uniform bool rectangle_shadows_enabled=false;
uniform sampler2D rectangle_bands : filter_nearest, repeat_disable;
uniform int rectangle_band_counts[32];
uniform vec4 rectangle_group_choices[5]; // two original Aui Grain indices, split, probability
uniform vec4 rectangle_group_shape[5]; // length, width, start, pigment gain
uniform vec4 rectangle_group_amount[5]; // opacity
uniform float rectangle_seed=1701.0;
uniform bool rectangle_debug=false;

uniform bool rectangle_overlay_enabled=false;
uniform float rectangle_overlay_strength=0.35;
uniform vec4 rectangle_overlay_choices[5];
uniform float rectangle_native_aspects[16];
#include "res://rendering/painterly/shaders/rectangle_overlay_geometry.gdshaderinc"

// Exactly one eligible group, then one PNG, per band. Never tile or repeat UVs.
vec3 rectangle_texture_accent(vec2 id,float travel,float lateral,float width,float total_length,float visible_start,bool touching,bool outer,vec2 trail,vec2 across,vec2 dx,vec2 dy) {
    if(!rectangle_overlay_enabled || shadow_brush_variant_count<=0)return vec3(0.0);
    float weight_sum=0.0;
    for(int role=0;role<5;role++) {
        if((role==2 && !touching) || (role==3 && !outer))continue;
        weight_sum+=max(rectangle_overlay_choices[role].w,0.0);
    }
    if(weight_sum<=0.0)return vec3(0.0);
    float draw=hash21(id+vec2(181.0,23.0))*weight_sum;
    int selected=-1;
    for(int role=0;role<5;role++) {
        if((role==2 && !touching) || (role==3 && !outer))continue;
        float weight=max(rectangle_overlay_choices[role].w,0.0);
        if(weight<=0.0)continue;
        draw-=weight;
        if(draw<=0.0){selected=role;break;}
    }
    if(selected<0)return vec3(0.0);
    vec4 choice=rectangle_overlay_choices[selected],shape=rectangle_group_shape[selected];
    int variant=int(hash21(id+vec2(43.0,191.0))<choice.z?choice.x:choice.y);
    if(variant<0 || variant>=shadow_brush_variant_count)return vec3(0.0);
    float brush_width=width*shape.y;
    float requested=max(total_length-visible_start,0.001)*shape.x;
    float brush_length=rectangle_overlay_length(brush_width,rectangle_native_aspects[variant],requested);
    float brush_start=visible_start+(total_length-visible_start)*shape.z;
    vec2 uv=vec2((travel-brush_start)/brush_length,lateral/max(brush_width,0.001)+0.5);
    if(any(lessThan(uv,vec2(0.0))) || any(greaterThan(uv,vec2(1.0))))return vec3(0.0);
    if(hash21(id+vec2(113.0,37.0))<0.5)uv.y=1.0-uv.y;
    vec4 region=shadow_brush_regions[variant];
    vec2 pixels=region.zw*vec2(textureSize(shadow_brush_layers,0).xy);
    vec2 ddx=vec2(dot(dx,trail)/brush_length,dot(dx,across)/brush_width)*pixels;
    vec2 ddy=vec2(dot(dy,trail)/brush_length,dot(dy,across)/brush_width)*pixels;
    float lod=clamp(log2(max(max(length(ddx),length(ddy)),1.0)),0.0,oil_atlas_max_lod);
    vec4 paint=textureLod(shadow_brush_layers,vec3(region.xy+uv*region.zw,float(variant)),lod);
    float tone=dot(paint.rgb,vec3(0.2126,0.7152,0.0722));
    return vec3(smoothstep(0.02,0.98,paint.a)*rectangle_overlay_strength,
        (1.0-smoothstep(0.12,0.72,tone))*shape.w,smoothstep(0.07,0.38,tone));
}

// Result: coverage, resolved pigment, dry-brush relief. Layers use alpha-over
// in the published clockwise band order; no polygon-filling or repair pass.
vec3 rectangle_caster(int caster,vec3 p,vec3 lo,vec3 hi,float identity,vec2 trail,vec2 across,float slope,vec2 dx,vec2 dy) {
    vec2 center=(lo.xz+hi.xz)*0.5,half_extent=(hi.xz-lo.xz)*0.5;
    float full_width=max(2.0*dot(abs(across),half_extent),0.08);
    float bottom=max(lo.y-p.y,0.0),top=max(hi.y-p.y,0.0);
    float alpha_sum=0.0,pigment_sum=0.0,dry_sum=0.0;
    for(int order=0;order<64;order++) {
        if(order>=rectangle_band_counts[caster])break;
        vec4 band=texelFetch(rectangle_bands,ivec2(order,caster),0);
        float width=full_width*band.y;
        vec2 origin=center+across*(band.x*full_width);
        float lateral=dot(p.xz-origin,across);
        if(abs(lateral)>width*0.8)continue;
        vec2 axis=vec2(abs(trail.x)>0.0001?trail.x:0.0001,abs(trail.y)>0.0001?trail.y:0.0001);
        vec2 a=(lo.xz-origin)/axis,b=(hi.xz-origin)/axis;
        float enter=max(min(a.x,b.x),min(a.y,b.y)),leave=min(max(a.x,b.x),max(a.y,b.y));
        if(leave<enter)continue;
        vec2 id=vec2(identity+rectangle_seed,band.z);
        float length_scale=mix(shadow_length_range.x,shadow_length_range.y,hash21(id+vec2(5,47)));
        float total_length=max(leave-enter+(top-bottom)*slope,0.08)*length_scale;
        vec2 start=origin+trail*(enter+bottom*slope);
        float travel=dot(p.xz-start,trail);
        if(travel< -width*0.55 || travel>total_length+width*0.55)continue;
        float visible_start=lo.y<=p.y+0.02?clamp(leave-enter-width*0.1,0.0,total_length):0.0;
        if(rectangle_debug) {
            if(travel<0.0 || travel>total_length || abs(lateral)>width*0.5)continue;
            float boundary=min(min(travel,total_length-travel)/max(width,0.01),0.5-abs(lateral)/max(width,0.01));
            float stripe=boundary<0.035?1.0:0.28+0.5*float(order)/max(float(rectangle_band_counts[caster]-1),1.0);
            return vec3(stripe,0.0,0.0);
        }
        float band_cover=0.0;
        for(int role=0;role<5;role++) {
            vec2 rid=id+vec2(float(role)*19.0,31.0);
            vec4 choice=rectangle_group_choices[role],shape=rectangle_group_shape[role];
            if(hash21(rid+vec2(11,29))>=choice.w)continue;
            if(role==2 && lo.y>p.y+0.02)continue;
            // Edge group only decorates the outer lanes; interior joins use group 1.
            if(role==3 && band.z>0.5 && band.z<float(rectangle_band_counts[caster]-1)-0.5)continue;
            int variant=int(hash21(rid+vec2(71,13))<choice.z?choice.x:choice.y);
            if(variant<0 || variant>=3)continue;
            float local_start=role==0?0.0:visible_start+(total_length-visible_start)*shape.z;
            float local_length=role==0?total_length:max((total_length-visible_start)*shape.x,0.03);
            local_length=min(local_length,total_length-local_start);
            float local_width=width*shape.y;
            float shift=(hash21(rid+vec2(17,43))-0.5)*(width-local_width)*0.6;
            vec2 uv=vec2((travel-local_start)/max(local_length,0.001),(lateral-shift)/max(local_width,0.001)+0.5);
            if(hash21(rid+vec2(7,83))<0.5)uv.y=1.0-uv.y;
            float pressure_root=role==0?visible_start:0.0;
            vec3 paint=aui_pressure_full_tip(uv,local_length,local_width,rid,max(length(dx),length(dy)),pressure_root,variant);
            float alpha=paint.x*rectangle_group_amount[role].x;
            float load=paint.y*shape.w;
            float dry=paint.z;
            // A later brush covers earlier relief, preserving drawing order.
            pigment_sum=load*alpha+pigment_sum*(1.0-alpha);
            dry_sum=dry*alpha+dry_sum*(1.0-alpha);
            alpha_sum=alpha+alpha_sum*(1.0-alpha);
            band_cover=alpha+band_cover*(1.0-alpha);
        }
        bool outer=band.z<0.5 || band.z>float(rectangle_band_counts[caster]-1)-0.5;
        vec3 accent=rectangle_texture_accent(id,travel,lateral,width,total_length,visible_start,lo.y<=p.y+0.02,outer,trail,across,dx,dy);
        float accent_alpha=accent.x*band_cover;
        // Accent changes pigment/relief within the rounded pressure footprint;
        // it never fills its gaps or replaces the silhouette with a PNG boundary.
        pigment_sum=mix(pigment_sum,accent.y*alpha_sum,accent_alpha);
        dry_sum=mix(dry_sum,accent.z*alpha_sum,accent_alpha);
    }
    return vec3(alpha_sum,pigment_sum/max(alpha_sum,0.001),dry_sum/max(alpha_sum,0.001));
}
