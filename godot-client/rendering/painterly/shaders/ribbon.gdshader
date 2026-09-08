shader_type spatial;
render_mode blend_mix, unshaded, fog_disabled, depth_draw_never, cull_disabled;

uniform bool seam_enabled = true;
uniform float seam_strength = 1.0;
uniform sampler2DArray brushes : filter_linear_mipmap, repeat_disable;
// Each layer stores its gesture inside a sub-rectangle of the 1024x384 page.
uniform vec4 brush_regions[5];

varying vec3 donor_albedo;
varying vec3 donor_normal;
varying vec3 receiver_albedo;
varying float importance;
varying float opacity;
varying float variant;
varying float mode;

void vertex() {
    donor_albedo = COLOR.rgb;
    opacity = COLOR.a;
    donor_normal = normalize(CUSTOM0.xyz);
    receiver_albedo = CUSTOM1.rgb;
    importance = CUSTOM1.a;
    variant = UV2.x;
    mode = UV2.y;
}

void fragment() {
    if (!seam_enabled) { discard; }
    // Shape comes entirely from the brush alpha; the quad is only its window.
    vec4 region = brush_regions[int(variant)];
    vec2 buv = region.xy + clamp(UV, vec2(0.0), vec2(1.0)) * region.zw;
    float a = texture(brushes, vec3(buv, variant)).a;
    if (a < 0.001) { discard; }
    ALBEDO = donor_albedo;
    ALPHA = a * opacity * seam_strength;
}
