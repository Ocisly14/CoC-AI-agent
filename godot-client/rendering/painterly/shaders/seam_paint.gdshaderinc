// Scene-wide, one-way paint deposited on receiving geometry before lighting.
uniform bool seam_enabled=true;
uniform float seam_strength=1.0;
uniform sampler2D seam_protection_map : filter_linear_mipmap, repeat_disable;
uniform bool use_seam_protection_map=false;
uniform int seam_stamp_count=0;
uniform mat4 seam_from_local=mat4(1.0);
uniform sampler2DArray seam_brushes : filter_linear_mipmap, repeat_disable;
uniform vec4 seam_regions[5];
uniform vec4 seam_origins[128]; // shared position, width in metres
uniform vec4 seam_tangents[128]; // tangent, reach
uniform vec4 seam_directions[128]; // inward, opacity
uniform vec4 seam_colors[128]; // raw linear source pigment, never lit/recursive
uniform vec4 seam_styles[128]; // brush variant, tilt, drip length, drip width
uniform vec4 seam_drips[128]; // fixed surface tangent gravity at creation

vec3 apply_seam_paint(vec3 base, vec3 position, vec3 normal, float protection, out float coverage, out vec3 donor, out vec3 direction) {
    coverage=0.0; donor=vec3(0); direction=vec3(0);
    if (!seam_enabled) {return base;}
    for (int i=0;i<seam_stamp_count;i++) {
        vec3 t=seam_tangents[i].xyz, v=seam_directions[i].xyz;
        vec3 n=normalize(cross(t,v));
        vec3 delta=position-seam_origins[i].xyz;
        float side=dot(delta,v), along=dot(delta,t);
        float width=seam_origins[i].w, reach=seam_tangents[i].w;
        // Do not leak to the back/inside of a thin wall or across an unrelated face.
        float gate=step(abs(dot(delta,n)),0.025)*step(0.90,abs(dot(normal,n)))*step(0.0,side);
        float brush_along=along-side*seam_styles[i].y;
        vec2 uv=vec2((side+0.02)/(reach+0.02),brush_along/width+0.5);
        vec4 region=seam_regions[int(seam_styles[i].x)];
        // Explicit gradients avoid undefined implicit derivatives in divergent stamp loops.
        vec2 gx=dFdx(uv)*region.zw, gy=dFdy(uv)*region.zw;
        float footprint=textureGrad(seam_brushes,vec3(region.xy+clamp(uv,vec2(0),vec2(1))*region.zw,seam_styles[i].x),gx,gy).a;
        footprint*=step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0);
        float drip=0.0;
        if (seam_styles[i].z>0.0) {
            vec3 gravity=seam_drips[i].xyz;
            vec3 across=normalize(cross(n,gravity));
            vec3 start=v*reach*0.40;
            vec3 dp=delta-start;
            float down=dot(dp,gravity), crossway=dot(dp,across);
            float len=seam_styles[i].z;
            float u=clamp(down/len,0.0,1.0);
            float wander=sin(u*5.2+seam_styles[i].x)*seam_styles[i].w*0.18*u;
            float radius=seam_styles[i].w*mix(0.55,0.32,u);
            float aa=max(fwidth(crossway),0.0007);
            float stem=(1.0-smoothstep(radius-aa,radius+aa,abs(crossway-wander)))*step(0.0,down)*step(down,len);
            float bulb=length(vec2((crossway-wander)/(seam_styles[i].w*0.7),(down-len)/(seam_styles[i].w*1.05)));
            float bead=1.0-smoothstep(0.72,1.0,bulb);
            // Broken pigment density, not an animated fluid or a perfect vector line.
            float dry=mix(0.56,0.94,smoothstep(-0.35,0.5,sin(u*27.0+seam_styles[i].x*2.0)));
            drip=max(stem*dry,bead*0.95);
        }
        float alpha=clamp(max(footprint,drip)*gate*seam_directions[i].w*seam_strength*(1.0-clamp(protection,0.0,1.0)),0.0,1.0);
        base=mix(base,seam_colors[i].rgb,alpha);
        donor=mix(donor,seam_colors[i].rgb,alpha);
        direction=mix(direction,v*0.5+0.5,alpha);
        coverage=alpha+coverage*(1.0-alpha);
    }
    return base;
}
