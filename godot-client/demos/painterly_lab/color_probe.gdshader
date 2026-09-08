shader_type canvas_item;
render_mode unshaded;
#include "res://rendering/painterly/shaders/color.gdshaderinc"
uniform int mode=0;
void fragment() {
    vec3 value=vec3(0);
    if(mode==0) {value=to_oklab(vec3(1))+vec3(0,0.5,0.5);}
    else if(mode==1) {value=from_oklab(to_oklab(vec3(UV.x,0.25,0.8)));}
    else if(mode==2) {
        float angle=UV.x*6.283185307;
        value=output_map(from_oklab(vec3(1.05,0.45*cos(angle),0.45*sin(angle))),1.4);
    }
    else if(mode==3) {
        float q=confidence(length(to_oklab(vec3(1)).yz),0.04);
        value=vec3(q,confidence(UV.x*0.1,0.035),0);
    }
    else if(mode==4) {value=vec3(soft_limit(UV.x*0.4,0.2));}
    COLOR=vec4(value,1);
}
