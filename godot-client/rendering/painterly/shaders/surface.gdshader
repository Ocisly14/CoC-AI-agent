shader_type spatial;
render_mode unshaded, fog_disabled;
#include "res://rendering/painterly/shaders/color.gdshaderinc"
#include "res://rendering/painterly/shaders/color_selection.gdshaderinc"
#include "res://rendering/painterly/shaders/seam_paint.gdshaderinc"
#include "res://rendering/painterly/shaders/ground_albedo.gdshaderinc"
uniform bool procedural_ground=false;
uniform vec4 secondary_color : source_color=vec4(0.3,0.3,0.3,1);
uniform bool paving=false;
#include "res://rendering/painterly/shaders/shadow.gdshaderinc"

uniform vec4 base_color : source_color = vec4(0.6,0.58,0.5,1);
uniform sampler2D albedo_texture : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform bool use_albedo_texture=false;
uniform sampler2D importance_map : filter_linear_mipmap, repeat_disable;
uniform bool use_importance_map=false;
uniform float default_importance=0.2;
uniform float importance_scale=1.0;
uniform float importance_gamma=1.0;
uniform float importance_override=-1.0;
uniform sampler2D flow_map : filter_linear_mipmap, repeat_disable;
uniform bool use_flow_map=false;
uniform vec2 default_flow=vec2(1,0);
uniform int map_plane=0;
uniform vec2 map_origin=vec2(-8,-8);
uniform vec2 map_extent=vec2(16,16);
uniform mat4 data_transform=mat4(1.0);
uniform sampler2D indirect_map : filter_linear_mipmap, repeat_disable;
uniform bool use_indirect_map=false;
uniform bool indirect_alpha_occlusion=false;
uniform vec4 indirect_tint : source_color=vec4(0,0,0,1);
uniform float indirect_energy=1.0;
uniform sampler2D contact_map : filter_linear, repeat_disable;
uniform bool use_contact_map=false;
uniform float contact_protection=0.0;
uniform float alpha_cutoff=0.0;
uniform bool painterly_shadows=true;

uniform vec3 sun_direction=vec3(-0.5,0.8,0.3);
uniform vec4 sun_color : source_color=vec4(1,0.94,0.83,1);
uniform float sun_energy=1.0;
uniform vec4 ambient_color : source_color=vec4(0.6,0.72,0.9,1);
uniform float ambient_energy=0.5;
uniform float exposure=1.1;
uniform bool enabled=true;
uniform bool selective_color=true;
uniform float chroma_gain=0.20;
uniform float lightness_gain=0.025;
uniform float material_chroma_knee=0.035;
uniform float sun_chroma_knee=0.04;
uniform float color_response=1.0;
uniform float contrast_response=0.15;
uniform float detail_response=0.4;
uniform float contrast_pivot=0.55;
uniform float saturation=1.0;
// 0 beauty, 1 base, 2 S0, 3 B, 4 M0, 5 Mp, 6 importance,
// 7 flow, 8 fixed stroke, 9 effective chroma weight, 10 raw final linear, 11 Cp-raw
// 12 pigment density/overlap, 13 dry bristle/oil ridge detail (gated to painted shadow).
uniform int debug_view=0;
varying vec3 world_position;
varying vec3 world_normal;
varying vec3 local_position;
varying vec3 local_normal;
varying mat3 object_basis;

void vertex() {
    local_position=VERTEX;
    local_normal=NORMAL;
    world_position=(MODEL_MATRIX*vec4(VERTEX,1)).xyz;
    world_normal=normalize(MODEL_NORMAL_MATRIX*NORMAL);
    object_basis=mat3(MODEL_MATRIX);
}
void fragment() {
    vec2 surface_p=local_position.xz;
    mat3 surface_basis=object_basis;
    if(map_plane==1) {
        surface_p=local_position.xy;
        surface_basis=mat3(object_basis[0],object_basis[2],object_basis[1]);
    } else if(map_plane==2) {
        surface_p=local_position.zy;
        surface_basis=mat3(object_basis[2],object_basis[0],object_basis[1]);
    }
    vec3 data_p=(data_transform*vec4(local_position,1.0)).xyz;
    vec2 map_p=data_p.xz;
    if(map_plane==1) {map_p=data_p.xy;}
    else if(map_plane==2) {map_p=data_p.zy;}
    vec2 data_uv=(map_p-map_origin)/max(map_extent,vec2(0.001));
    float importance=use_importance_map ? texture(importance_map,data_uv).r : default_importance;
    importance=clamp(importance,0.0,1.0);
    if(importance_override>=0.0) {importance=clamp(importance_override,0.0,1.0);}
    else if(importance_scale!=1.0 || importance_gamma!=1.0) {
        importance=clamp(pow(importance,importance_gamma)*importance_scale,0.0,1.0);
    }
    vec2 flow=length(default_flow)>0.0001 ? normalize(default_flow) : vec2(1,0);
    if(use_flow_map) {
        vec2 axis=texture(flow_map,data_uv).rg*2.0-1.0;
        if(length(axis)>0.0001) {
            float angle=atan(axis.y,axis.x)*0.5;
            flow=vec2(cos(angle),sin(angle));
        }
    }
    float protect=use_contact_map ? texture(contact_map,data_uv).r : contact_protection;
    vec4 texel=vec4(1);
    if(use_albedo_texture) {texel=texture(albedo_texture,UV);}
    if(texel.a*base_color.a<alpha_cutoff) {discard;}
    vec3 albedo=base_color.rgb*texel.rgb;
    if(procedural_ground) {albedo=ground_albedo(world_position,base_color.rgb,secondary_color.rgb,paving);}
    if(enabled && use_albedo_texture) {
        vec3 coarse=base_color.rgb*textureLod(albedo_texture,UV,3.0).rgb;
        albedo=mix(coarse,albedo,1.0-detail_response*(1.0-importance));
    }
    float seam_coverage;
    vec3 seam_donor, seam_direction;
    vec3 seam_position=(seam_from_local*vec4(local_position,1.0)).xyz;
    vec3 seam_normal=normalize(transpose(inverse(mat3(seam_from_local)))*local_normal);
    float seam_protection=use_seam_protection_map ? texture(seam_protection_map,data_uv).r : 0.0;
    albedo=apply_seam_paint(albedo,seam_position,seam_normal,seam_protection,seam_coverage,seam_donor,seam_direction);
    // A planar flow field cannot describe perpendicular faces of the same box/slab.
    vec3 mapped_normal=normalize(cross(surface_basis[0],surface_basis[2]));
    bool paint_receiver=painterly_shadows && abs(dot(normalize(world_normal),mapped_normal))>0.75;
    if(use_oil_brush_atlas) {paint_receiver=paint_receiver && abs(normalize(world_normal).y)>0.99;}
    vec2 pigment;
    vec3 masks=brush_shadow(world_position,surface_p,flow,surface_basis,
        sun_direction,importance,clamp(protect,0.0,1.0),enabled && paint_receiver,pigment);
    float visibility=1.0-(enabled ? masks.g : masks.r);
    float ndotl=max(dot(normalize(world_normal),sun_direction),0.0);
    float direct=ndotl*sun_energy;
    vec3 s0=albedo*sun_color.rgb*direct;
    vec4 indirect_sample=use_indirect_map ? texture(indirect_map,data_uv) : vec4(0,0,0,1);
    float ambient_access=(use_indirect_map && indirect_alpha_occlusion) ? indirect_sample.a : 1.0;
    vec3 irradiance=ambient_color.rgb*ambient_energy*ambient_access;
    irradiance+=indirect_tint.rgb*indirect_energy;
    if(use_indirect_map) {irradiance+=indirect_sample.rgb*indirect_energy;}
    vec3 indirect=albedo*irradiance;
    vec3 styled=s0;
    float color_weight=0.0;
    if(enabled && selective_color && sun_energy>0.000001) {
        vec3 material_lab=to_oklab(albedo);
        vec3 solar_lab=to_oklab(sun_color.rgb/max(luminance(sun_color.rgb),0.000001));
        float cm=length(material_lab.yz), cs=length(solar_lab.yz);
        float qm=confidence(cm,material_chroma_knee), qs=confidence(cs,sun_chroma_knee);
        float match_hue=selected_hue_weight(material_lab,solar_lab);
        float d=(1.0-exp(-sun_energy))*ndotl;
        float fc=mix(0.12,1.0,pow(importance,1.3))*color_response;
        float fl=mix(0.15,1.0,importance);
        float guard=smoothstep(0.08,0.28,material_lab.x)*(1.0-smoothstep(0.86,1.0,material_lab.x));
        // Manual selection is independent of sun chroma, including white light.
        color_weight=d*fc*qm*(hue_selection_mode==1 ? 1.0 : qs)*match_hue;
        vec3 slab=to_oklab(s0);
        float gain=soft_limit(chroma_gain*color_weight,chroma_gain);
        slab.yz*=1.0+gain;
        slab.x+=soft_limit(lightness_gain*d*fl*guard,lightness_gain);
        slab.yz+=solar_lab.yz*(1.0-qm)*d*fl*guard*0.04;
        styled=from_oklab(slab);
    }
    // Visibility is applied once, to the whole direct term (including its enhancement).
    vec3 composed=indirect+visibility*styled;
    // A small pigment-density adjustment, independent of the geometric shadow visibility.
    // Scale RGB equally to retain the cold shadow hue; neither cast shadows nor V are reapplied.
    float pigment_gate=(enabled && paint_receiver) ? masks.g*clamp(brush_strength,0.0,1.0) : 0.0;
    float accumulation=clamp(overlap_darkening,0.0,0.25)*pigment.x*pigment_gate;
    float dry_lift=clamp(bristle_strength,0.0,1.0)*pigment.y*pigment_gate*0.32;
    composed*=1.0-accumulation+dry_lift;
    if(enabled && contrast_response>0.0) {
        vec3 lab=to_oklab(composed);
        float strength=contrast_response*importance;
        lab.x+=soft_limit((lab.x-contrast_pivot)*strength,0.04);
        composed=from_oklab(lab);
    }
    if(enabled && saturation!=1.0) {
        vec3 lab=to_oklab(composed);
        lab.yz*=saturation;
        composed=from_oklab(lab);
    }
    vec3 result=output_map(composed,exposure);
    if(debug_view==1) {result=albedo;}
    else if(debug_view==2) {result=s0;}
    else if(debug_view==3) {result=indirect;}
    else if(debug_view==4) {result=vec3(masks.r);}
    else if(debug_view==5) {result=vec3(masks.g);}
    else if(debug_view==6) {result=vec3(importance);}
    else if(debug_view==7) {result=vec3(flow*0.5+0.5,0.2);}
    else if(debug_view==8) {result=vec3(masks.b);}
    else if(debug_view==9) {result=vec3(color_weight*visibility);}
    else if(debug_view==10) {result=composed;}
    else if(debug_view==11) {result=vec3(abs(masks.g-masks.r));}
    else if(debug_view==12) {result=vec3(pigment.x*pigment_gate);}
    else if(debug_view==13) {result=vec3(pigment.y*pigment_gate);}
    if(debug_view==14) {result=vec3(seam_coverage);}
    else if(debug_view==15) {result=seam_donor;}
    else if(debug_view==16) {result=seam_direction;}
    else if(debug_view==17) {
        vec3 material_lab=to_oklab(albedo);
        vec3 solar_lab=to_oklab(sun_color.rgb/max(luminance(sun_color.rgb),0.000001));
        result=vec3(selected_hue_weight(material_lab,solar_lab)*confidence(length(material_lab.yz),material_chroma_knee));
    }
    ALBEDO=result;
}
