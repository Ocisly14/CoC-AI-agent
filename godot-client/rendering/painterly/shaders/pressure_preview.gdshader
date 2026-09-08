shader_type canvas_item;

float hash21(vec2 p) {return fract(sin(dot(p,vec2(127.1,311.7))+17.0)*43758.5453);}
#include "res://rendering/painterly/shaders/procreate_brush.gdshaderinc"
uniform int preview_mode=0; // 0 combined, 1 isolated stamp, 2 isolated stroke
uniform float preview_pressure=0.5;
uniform float preview_length=4.0;
uniform float preview_width=0.85;
uniform float preview_root_offset=0.0;
uniform float preview_pixel_m=0.006;

void fragment() {
    vec3 ink=vec3(0.29,0.36,0.38);
    vec3 paper=vec3(0.90,0.88,0.80);
    float alpha=0.0;
    if(preview_mode==1) {
        vec2 point=(UV-0.5)*vec2(2.0,2.0);
        alpha=aui_tip_shape(point,aui_tip_size(preview_pressure,50.0),preview_pixel_m);
        COLOR=vec4(vec3(alpha),1.0);
    } else if(preview_mode==2) {
        // Canvas includes transverse margins to test widened tip support.
        vec2 uv=vec2(UV.x,(UV.y-0.5)*2.0+0.5);
        vec3 paint=aui_pressure_deposit(uv,preview_length,preview_width,vec2(40,2),preview_pixel_m,preview_root_offset);
        COLOR=vec4(vec3(paint.x),1.0);
    } else {
        if(UV.y<0.30) {
            float pressure=aui_gesture(UV.x,vec2(40,2)).x;
            float y=0.27-pressure*0.23;
            float line=1.0-smoothstep(0.005,0.012,abs(UV.y-y));
            COLOR=vec4(mix(paper,vec3(0.6,0.28,0.1),line),1);
        } else if(UV.y<0.67) {
            float index=floor(UV.x*3.0);
            float p=index<1.0 ? 0.2 : (index<2.0 ? 0.5 : 0.9);
            vec2 local=vec2(fract(UV.x*3.0)-0.5,(UV.y-0.485)/0.37)*vec2(1.6,1.6);
            alpha=aui_tip_shape(local,aui_tip_size(clamp(p*pressure_scale,0.0,1.0),50.0),0.012);
            COLOR=vec4(mix(paper,ink,alpha),1);
        } else {
            vec2 uv=vec2(UV.x,(UV.y-0.835)/0.33*1.7+0.5);
            vec3 paint=aui_pressure_deposit(uv,4.0,0.85,vec2(40,2),0.01,0.0);
            COLOR=vec4(mix(paper,ink,paint.x),1);
        }
    }
}
