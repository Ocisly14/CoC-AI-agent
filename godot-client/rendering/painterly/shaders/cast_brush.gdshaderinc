// Whole brush shadows on horizontal receivers. Caster bounds and sun are one
// published snapshot. The lab uses box casters; bounds are an explicit proxy.
uniform vec4 brush_caster_min[32]; // xyz world minimum, w stable stroke seed
uniform vec4 brush_caster_max[32]; // xyz world maximum
uniform int brush_caster_count=0;
uniform float receiver_stroke_id=-1.0;
uniform sampler2DArray shadow_brush_layers : filter_linear_mipmap, repeat_disable;
uniform vec4 shadow_brush_regions[16];
uniform int shadow_brush_variant_count=0;
uniform float shadow_brush_width_m=0.85;
uniform float shadow_root_fill_m=0.22;
uniform vec2 shadow_length_range=vec2(0.8,1.2);
uniform float shadow_brush_overlap=0.2;
uniform float shadow_brush_seed=17.0;
uniform vec4 oil_brush_region_px=vec4(48,452,1172,476);

#include "res://rendering/painterly/shaders/procreate_brush.gdshaderinc"

// R=pigment load, G=oil/dry texture, B=complete painted shadow coverage.
// No M0 input: the texture builds the entire shadow, not only its boundary.
vec3 cast_brush_shadow(vec3 world_p,vec3 to_sun) {
    float horizontal=length(to_sun.xz);
    if(to_sun.y<=0.001 || brush_caster_count==0) {return vec3(0);}
    vec2 trail=horizontal>0.0001 ? -to_sun.xz/horizontal : vec2(1,0);
    vec2 across=vec2(-trail.y,trail.x);
    float slope=horizontal/to_sun.y;
    vec2 pixel_dx=dFdx(world_p.xz), pixel_dy=dFdy(world_p.xz);
    vec2 texture_pixels=max(vec2(textureSize(oil_brush_atlas,0)),vec2(1));
    vec4 region=oil_brush_region_px/vec4(texture_pixels,texture_pixels);
    float uncovered=1.0,total=0.0,strongest=0.0,load_sum=0.0,dry_sum=0.0;
    float root_cover=0.0;
    for(int caster=0;caster<32;caster++) {
        if(caster>=brush_caster_count) {break;}
        vec3 lo=brush_caster_min[caster].xyz, hi=brush_caster_max[caster].xyz;
        float identity=brush_caster_min[caster].w;
        if(identity==receiver_stroke_id || hi.y<=world_p.y+0.02) {continue;}
        vec2 center=(lo.xz+hi.xz)*0.5;
        vec2 half_extent=(hi.xz-lo.xz)*0.5;
        float half_along=dot(abs(trail),half_extent);
        float half_across=dot(abs(across),half_extent);
        float bottom=max(lo.y-world_p.y,0.0), top=max(hi.y-world_p.y,0.0);
        float projected_length=max(half_along*2.0+(top-bottom)*slope,0.08);
        float full_width=max(half_across*2.0,0.08);
        // Start under the caster (or its projected bottom if raised). The contact
        // is hidden by the geometry, then the bristles emerge on its shaded side.
        vec2 root=center-trail*half_along+trail*bottom*slope;
        vec2 rel=world_p.xz-root;
        if(dot(rel,trail)<-full_width || dot(rel,trail)>projected_length*shadow_length_range.y+full_width || abs(dot(rel,across))>full_width) {continue;}
        // Only a caster touching THIS receiver gets an opaque contact bridge.
        // Intersect the exact footprint at this pixel, including diagonal corners;
        // a rectangular lateral strip would leave gaps or spill past the sides.
        if(lo.y<=world_p.y+0.02) {
            vec2 safe_trail=vec2(abs(trail.x)>0.0001 ? trail.x : 0.0001,abs(trail.y)>0.0001 ? trail.y : 0.0001);
            vec2 root_hit0=(lo.xz-world_p.xz)/safe_trail;
            vec2 root_hit1=(hi.xz-world_p.xz)/safe_trail;
            float root_enter=max(min(root_hit0.x,root_hit1.x),min(root_hit0.y,root_hit1.y));
            float root_leave=min(max(root_hit0.x,root_hit1.x),max(root_hit0.y,root_hit1.y));
            float shadow_reach=top*slope;
            if(root_leave>=root_enter && root_enter<=0.0 && -root_leave<=shadow_reach) {
                float solid=min(shadow_root_fill_m,shadow_reach*0.25);
                float fade_end=min(solid*2.0,shadow_reach);
                float contact=1.0-smoothstep(solid,max(fade_end,solid+0.0001),max(-root_leave,0.0));
                root_cover=max(root_cover,contact);
            }
        }
        // Width determines count. Only nearby lanes can reach this fragment,
        // so wide shadows do not require an arbitrary count cap or a long loop.
        float stride=1.0-clamp(shadow_brush_overlap,0.0,0.45);
        int groups=max(1,int(ceil((full_width/max(shadow_brush_width_m,0.08)-1.0)/stride))+1);
        // Fit the outer two edges to the shadow width. Adjacent centres are
        // 80% of one stamp width apart, giving a constant 20% overlap.
        float stroke_width=full_width/(1.0+float(groups-1)*stride);
        float spacing=stroke_width*stride;
        int nearest=int(floor(dot(rel,across)/spacing+float(groups)*0.5));
        for(int neighbor=-2;neighbor<=2;neighbor++) {
            if(!(procreate_shadows_enabled && pressure_stamps_enabled) && abs(neighbor)>1) {continue;}
            int group=nearest+neighbor;
            if(group<0 || group>=groups) {continue;}
            vec2 id=vec2(identity+shadow_brush_seed,float(group));
            float random=hash21(id+vec2(53,71));
            float lateral=(float(group)+0.5-float(groups)*0.5)*spacing;
            // One footprint intersection per stroke, constant across its pixels.
            vec2 lane_origin=center+across*lateral;
            vec2 safe_axis=vec2(abs(trail.x)>0.0001 ? trail.x : 0.0001,abs(trail.y)>0.0001 ? trail.y : 0.0001);
            vec2 hit0=(lo.xz-lane_origin)/safe_axis;
            vec2 hit1=(hi.xz-lane_origin)/safe_axis;
            float enter=max(min(hit0.x,hit1.x),min(hit0.y,hit1.y));
            float leave=min(max(hit0.x,hit1.x),max(hit0.y,hit1.y));
            if(leave<enter) {continue;}
            vec2 start=lane_origin+trail*(enter+bottom*slope);
            float lane_length=max(leave-enter+(top-bottom)*slope,0.08);
            // No additive drag: the ENTIRE stamp stays within the length range.
            float stroke_length=lane_length*mix(shadow_length_range.x,shadow_length_range.y,random);
            // Base width, lane spacing and direction remain fixed. Pressure stamps
            // deform locally in the larger support below; legacy alpha keeps its UV.
            vec2 axis=trail;
            vec2 side=across;
            vec2 delta=world_p.xz-start;
            vec2 uv=vec2(dot(delta,axis)/stroke_length,dot(delta,side)/stroke_width+0.5);
            if(hash21(id+vec2(11,41))<0.5) {uv.y=1.0-uv.y;}
            float lateral_limit=(procreate_shadows_enabled && pressure_stamps_enabled) ? 0.71 : 0.5;
            if(uv.x<0.0 || uv.x>1.0 || abs(uv.y-0.5)>lateral_limit) {continue;}
            if(procreate_shadows_enabled) {
                vec3 paint;
                if(pressure_stamps_enabled) {
                    float root_offset=lo.y<=world_p.y+0.02 ? max(leave-enter-stroke_width*0.1,0.0) : 0.0;
                    paint=aui_pressure_deposit(uv,stroke_length,stroke_width,id,max(length(pixel_dx),length(pixel_dy)),root_offset);
                } else {
                    paint=aui_deposit(uv,stroke_length,stroke_width,id,max(length(pixel_dx),length(pixel_dy)));
                }
                total+=paint.x;
                strongest=max(strongest,paint.x);
                load_sum+=paint.x*paint.y;
                dry_sum+=paint.x*paint.z;
                uncovered*=1.0-paint.x;
                continue;
            }
            vec4 stroke_region=region;
            vec2 region_pixels=oil_brush_region_px.zw;
            int variant=0;
            if(shadow_brush_variant_count>0) {
                // Layer 0 is the normal rectangular brush (80%). Other layers
                // share the remaining 20% equally: 5% each for the approved set.
                float choice=hash21(id+vec2(97,13));
                if(shadow_brush_variant_count>1 && choice>=0.8) {
                    variant=1+min(int((choice-0.8)/0.2*float(shadow_brush_variant_count-1)),shadow_brush_variant_count-2);
                }
                stroke_region=shadow_brush_regions[variant];
                region_pixels=stroke_region.zw*vec2(textureSize(shadow_brush_layers,0).xy);
            }
            vec2 dx=vec2(dot(pixel_dx,axis)/stroke_length,dot(pixel_dx,side)/stroke_width)*region_pixels;
            vec2 dy=vec2(dot(pixel_dy,axis)/stroke_length,dot(pixel_dy,side)/stroke_width)*region_pixels;
            float lod=clamp(log2(max(max(length(dx),length(dy)),1.0)),0.0,oil_atlas_max_lod);
            vec2 sample_uv=stroke_region.xy+uv*stroke_region.zw;
            vec4 paint;
            if(shadow_brush_variant_count>0) {
                paint=textureLod(shadow_brush_layers,vec3(sample_uv,float(variant)),lod);
            } else {
                paint=textureLod(oil_brush_atlas,sample_uv,lod);
            }
            float alpha=smoothstep(0.02,0.98,paint.a);
            float tone=dot(paint.rgb,vec3(0.2126,0.7152,0.0722));
            // Keep loaded paint solid, with gently different pressure per gesture.
            alpha=pow(alpha,mix(0.8,1.08,random));
            float load=1.0-smoothstep(0.12,0.72,tone);
            float dry=smoothstep(0.07,0.38,tone);
            total+=alpha;
            strongest=max(strongest,alpha);
            load_sum+=alpha*load;
            dry_sum+=alpha*dry;
            uncovered*=1.0-alpha;
        }
    }
    float cover=max(1.0-uncovered,root_cover);
    float extra=max(total-strongest,0.0);
    float pigment=1.0-exp(-extra*0.7-load_sum*0.4);
    float dry=dry_sum/max(total,0.0001)*cover/(1.0+extra*0.25);
    return vec3(pigment,dry*(1.0-root_cover),cover);
}
