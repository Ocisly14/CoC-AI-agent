uniform sampler2D shadow_depth : filter_nearest, repeat_disable;
uniform mat4 light_view;
uniform float light_span = 32.0;
uniform float light_near = 0.1;
uniform float light_far = 64.0;
uniform float shadow_bias_m = 0.035;
uniform bool capture_valid = false;
uniform float edge_width_m = 0.65;
uniform float stroke_length_m = 1.3;
uniform float stroke_width_m = 0.24;
uniform float brush_strength = 1.0;
uniform float drag_length_m = 0.9;
uniform float gap_depth_m = 0.5;
uniform float edge_response = 0.8;
uniform float overlap_darkening = 0.14;
uniform float bristle_strength = 0.55;
uniform float bristle_spacing_m = 0.09;
uniform float stroke_group_density = 0.52;
uniform float stroke_angle_jitter_degrees = 22.0;
uniform float stroke_arc_bend_m = 0.22;
uniform float seed = 17.0;
uniform sampler2D brush_texture : filter_linear_mipmap, repeat_enable;
uniform bool use_brush_texture = false;
// Atlas is read as authored DATA, without source_color. Alpha = footprint;
// grayscale = pigment variation, not a baked shadow color or physical height.
uniform sampler2D oil_brush_atlas : filter_linear_mipmap, repeat_disable;
uniform bool use_oil_brush_atlas = false;
uniform float oil_atlas_max_lod = 6.0;

float hash21(vec2 p) {return fract(sin(dot(p,vec2(127.1,311.7))+seed)*43758.5453);}
float noise21(vec2 p) {
    vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),
               mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);
}
float shadow_at(vec3 p) {
    if(!capture_valid) {return 0.0;}
    vec3 v=(light_view*vec4(p,1)).xyz;
    vec2 uv=vec2(v.x,-v.y)/light_span+0.5;
    float z=(-v.z-light_near)/(light_far-light_near);
    if(any(lessThan(uv,vec2(0))) || any(greaterThan(uv,vec2(1))) || z<=0.0 || z>=1.0) {return 0.0;}
    vec2 packed=texture(shadow_depth,uv).rg;
    float saved=packed.r+packed.g/64.0;
    return step(saved+shadow_bias_m/(light_far-light_near),z);
}
#include "res://rendering/painterly/shaders/cast_brush.gdshaderinc"
// Sparse surface-anchored groups, each containing two partially overlapping swipes.
// Rotate in metres BEFORE normalizing length/width, so the angle is not distorted.
// Each group's bristles share one curved centreline; pigment is NOT caster count.
// Return R=extra pigment load from overlapping strokes, G=resolved dry bristle channels.
vec2 pigment_stamps(vec2 surface_m) {
    float stroke_length=max(stroke_length_m,0.02);
    float stroke_width=max(stroke_width_m,0.02);
    float bend_limit=max(stroke_arc_bend_m,0.0);
    // Conservative support radius keeps all rotated/curved swipes in this 3x3 search.
    float radius=length(vec2(stroke_length*0.97,stroke_width*1.02+bend_limit));
    float cell_size=max(stroke_length*0.9,radius/1.3);
    vec2 cell=floor(surface_m/cell_size);
    float total=0.0, strongest=0.0, dry_sum=0.0;
    for(int y=-1;y<=1;y++) {
        for(int x=-1;x<=1;x++) {
            vec2 id=cell+vec2(float(x),float(y));
            float rnd=hash21(id+vec2(83,41));
            // Keep derivative evaluation outside divergent branches for reliable AA.
            float occupied=1.0-step(clamp(stroke_group_density,0.0,1.0),hash21(id+vec2(97,23)));
            vec2 center=(id+0.5+(vec2(hash21(id+vec2(7,19)),hash21(id+vec2(53,11)))-0.5)*0.32)*cell_size;
            vec2 delta=surface_m-center;
            float angle=radians(stroke_angle_jitter_degrees)*(hash21(id+vec2(43,67))*2.0-1.0);
            vec2 p=vec2(dot(delta,vec2(cos(angle),sin(angle))),dot(delta,vec2(-sin(angle),cos(angle))));
            float reach=stroke_length*mix(0.66,0.85,rnd);
            float half_width=stroke_width*mix(0.62,0.84,hash21(id+vec2(31,71)));
            float bend=bend_limit*mix(0.45,1.0,hash21(id+vec2(61,29)));
            bend*=hash21(id+vec2(17,89))<0.5 ? -1.0 : 1.0;
            float u=p.x/reach;
            // A quadratic arc bows the footprint AND its hairs, rather than wiggling
            // independent straight lines. The central tangent is the group's angle.
            float curved_y=p.y-bend*(u*u-0.35);
            float hair_coord=curved_y/max(bristle_spacing_m,0.008)+rnd*7.0;
            float footprint=max(fwidth(hair_coord),0.0001);
            float aa=min(footprint,0.25);
            float groove=smoothstep(0.31-aa,0.47+aa,abs(fract(hair_coord)-0.5));
            float lane=floor(hair_coord);
            float lane_reach=reach*mix(0.75,1.0,hash21(id+vec2(lane,113)));
            float lane_shift=reach*(hash21(id+vec2(lane,149))-0.5)*0.16;
            float hair_tip=1.0-smoothstep(lane_reach*0.72,lane_reach,abs(p.x-lane_shift));
            float broken=smoothstep(0.18,0.58,noise21(vec2(u*0.85+rnd*17.0,lane*3.1)));
            float resolved=1.0-smoothstep(0.55,1.15,footprint);
            float dry=groove*broken*hair_tip*resolved;
            for(int swipe=0;swipe<2;swipe++) {
                float side=float(swipe)*2.0-1.0;
                float along=p.x-side*reach*0.10;
                float swipe_reach=reach*(swipe==0 ? 1.0 : 0.81);
                float tip=1.0-smoothstep(swipe_reach*0.72,swipe_reach,abs(along));
                float width=half_width*(1.0-0.24*pow(clamp(abs(along)/swipe_reach,0.0,1.0),3.0));
                float cover=occupied*tip*(1.0-smoothstep(width*0.7,width,abs(curved_y-side*stroke_width*0.18)));
                total+=cover;
                strongest=max(strongest,cover);
                dry_sum+=cover*dry;
            }
        }
    }
    float extra=max(total-strongest,0.0);
    float overlap=1.0-exp(-extra*1.2);
    // Overlapping loaded strokes partially fill the grooves left by one dry stroke.
    // Preserve empty space and tapered tails; normalization alone would amplify
    // nearly invisible footprints back to full-strength hairs between groups.
    float hairs=dry_sum/max(total,0.0001)*min(total,1.0)*(1.0-overlap*0.45);
    return vec2(overlap,hairs);
}
// R=M0, G=Mp, B=fixed brush field. Separate capture, reprocessed on receivers.
vec3 brush_shadow(vec3 world_p, vec2 local_p, vec2 flow, mat3 object_basis,
                  vec3 to_sun, vec3 receiver_normal, float importance, float protect, bool paint, out vec2 pigment) {
    pigment=vec2(0.0);
    float m0=shadow_at(world_p);
    vec2 cross_flow=vec2(-flow.y,flow.x);
    vec2 brush_m=vec2(dot(local_p,flow),dot(local_p,cross_flow));
    vec2 brush_uv=brush_m/vec2(max(stroke_length_m,0.02),max(stroke_width_m,0.02));
    float field=smoothstep(0.22,0.78,noise21(brush_uv));
    float bristles=noise21(brush_uv*vec2(1.3,2.4)+vec2(23,7));
    field=mix(field,bristles,0.12);
    if(use_brush_texture) {field=texture(brush_texture,brush_uv).r;}
    if(use_oil_brush_atlas && paint && brush_strength>0.0) {
        vec3 brush=cast_brush_surface_shadow(world_p,to_sun,receiver_normal,m0);
        pigment=brush.xy;
        return vec3(m0,brush.z*clamp(brush_strength,0.0,1.0),brush.z);
    }
    if(!paint || brush_strength<=0.0) {return vec3(m0,m0,field);}
    vec3 axis=normalize(object_basis*vec3(flow.x,0,flow.y));
    vec3 across=normalize(object_basis*vec3(cross_flow.x,0,cross_flow.y));
    vec3 light_on_plane=to_sun-dot(to_sun,normalize(cross(axis,across)))*normalize(cross(axis,across));
    float horizontal=length(light_on_plane);
    vec3 trail=horizontal>0.0001 ? -light_on_plane/horizontal : axis;
    float edge_scale=(1.0-edge_response*0.6*importance)*(1.0-protect);
    float width=max(edge_width_m,max(drag_length_m,gap_depth_m))*edge_scale;
    // Nine fixed-position taps delimit an edge band, rather than dirtying the whole shadow.
    float m=m0*2.0;
    float mn=m0, mx=m0;
    for(int i=0;i<8;i++) {
        float angle=float(i)*0.7853981634;
        float tap=shadow_at(world_p+(axis*cos(angle)+across*sin(angle))*width);
        mn=min(mn,tap); mx=max(mx,tap); m+=tap;
    }
    float coverage=m/10.0;
    pigment=pigment_stamps(brush_m);
    // Sample towards the light to drag pigment OUT; the opposite direction cuts gaps IN.
    // The pigment field stays fixed to the surface; only this boundary sampling kernel turns.
    float directional=smoothstep(0.0,0.25,horizontal);
    float reach=drag_length_m*edge_scale*(0.35+0.65*field)*directional;
    float bite=gap_depth_m*edge_scale*(0.3+0.7*(1.0-field))*directional;
    float extended=shadow_at(world_p-trail*reach+across*(bristles-0.5)*width*0.2);
    float eroded=shadow_at(world_p+trail*bite);
    float deposit=smoothstep(0.45,0.63,field);
    float gap=1.0-smoothstep(0.28,0.43,field);
    float rough=smoothstep(0.3+field*0.25,0.5+field*0.25,coverage);
    float broken=mix(rough,max(rough,extended),deposit);
    broken=mix(broken,min(broken,eroded),gap);
    float edge=mx-mn;
    // Dry hairs split the extended brush tips before the shared sunlight visibility gate.
    broken*=1.0-clamp(bristle_strength,0.0,1.0)*pigment.y*0.7;
    float mp=mix(m0,broken,edge*brush_strength*(1.0-protect));
    return vec3(m0,mp,field);
}
