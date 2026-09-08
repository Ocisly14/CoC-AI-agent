// Selection in perceptual hue. Manual target is entered in familiar HSV degrees.
uniform int hue_selection_mode=0; // 0 follows sunlight, 1 selects material hue
uniform float hue_center=30.0;
uniform float hue_half_width=65.0;
uniform float hue_feather=50.0;

float selected_hue_weight(vec3 material_lab,vec3 solar_lab) {
    vec2 target=solar_lab.yz;
    if(hue_selection_mode==1) {
        vec3 rgb=clamp(abs(fract(vec3(hue_center/360.0)+vec3(0,2.0/3.0,1.0/3.0))*6.0-3.0)-1.0,0.0,1.0);
        vec3 linear_rgb=mix(rgb/12.92,pow((rgb+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),rgb));
        target=to_oklab(linear_rgb).yz;
    }
    float cosine=dot(material_lab.yz,target)/max(length(material_lab.yz)*length(target),0.000001);
    float angle=degrees(acos(clamp(cosine,-1.0,1.0)));
    if(hue_half_width>=180.0) {return 1.0;}
    float outer=max(hue_half_width,0.001);
    float inner=max(outer-max(hue_feather,0.001),0.0);
    return 1.0-smoothstep(inner,outer,angle);
}
