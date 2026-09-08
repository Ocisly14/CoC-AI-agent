shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled;
uniform float capture_near = 0.1;
uniform float capture_far = 64.0;
uniform sampler2D alpha_texture : source_color, filter_linear_mipmap, repeat_enable;
uniform bool use_alpha_texture = false;
uniform float base_alpha = 1.0;
uniform float alpha_cutoff = 0.0;
void fragment() {
    float a=use_alpha_texture ? texture(alpha_texture, UV).a : 1.0;
    if (a*base_alpha < alpha_cutoff) { discard; }
    // HDR viewport output remains linear; this is data, not display color.
    float depth = (-VERTEX.z - capture_near) / (capture_far - capture_near);
    // Power-of-two high/low split survives RGB11F HDR targets without acne.
    depth=clamp(depth,0.0,1.0);
    ALBEDO=vec3(floor(depth*64.0)/64.0,fract(depth*64.0),0.0);
}
