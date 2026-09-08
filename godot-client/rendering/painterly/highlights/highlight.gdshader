shader_type spatial;
render_mode blend_add, depth_draw_never, ambient_light_disabled, specular_disabled, fog_disabled, cull_back;

uniform sampler2DArray brushes : source_color, filter_linear_mipmap, repeat_disable;
uniform sampler2D direction_map : filter_nearest, repeat_disable;
uniform bool use_direction_map = false;
uniform vec3 default_axis = vec3(1, 0, 0);
uniform vec3 object_scale = vec3(1);
uniform bool effect_enabled = true;
uniform float seed = 71.0;
uniform int brush_group = 0;
uniform float strength = 0.8;
uniform float density = 0.65;
uniform vec2 stroke_size = vec2(0.8, 0.3);
uniform vec2 angle_cosines = vec2(0.8660254, 0.9659258);
uniform float direction_angle = 0.0;
uniform vec4 material_tint : source_color = vec4(1);
uniform sampler2D base_texture : source_color, filter_linear_mipmap, repeat_enable;
uniform bool use_base_texture = false;
uniform float alpha_cutoff = 0.0;
uniform float base_alpha = 1.0;
uniform vec2 base_uv_scale = vec2(1);
uniform vec2 base_uv_offset = vec2(0);
uniform int debug_view = 0;
varying vec3 local_position;
varying vec3 local_normal;

float random_cell(vec2 p, float salt) {
    return fract(sin(dot(p, vec2(127.1, 311.7)) + seed * 0.137 + salt) * 43758.5453);
}
void vertex() {
    local_position = VERTEX * object_scale;
    local_normal = normalize(NORMAL / max(object_scale, vec3(0.0001)));
}
void fragment() {
    if (!effect_enabled) { discard; }
    vec4 base = use_base_texture ? texture(base_texture, UV * base_uv_scale + base_uv_offset) : vec4(1);
    if (base.a * base_alpha < alpha_cutoff) { discard; }
    vec3 n = normalize(local_normal);
    vec3 axis = use_direction_map ? texture(direction_map, UV).rgb * 2.0 - 1.0 : default_axis;
    axis -= n * dot(n, axis);
    if (dot(axis, axis) < 0.01) { axis = abs(n.y) < 0.9 ? cross(vec3(0,1,0), n) : cross(vec3(0,0,1), n); }
    axis = normalize(axis);
    vec3 across = normalize(cross(n, axis));
    vec2 p = vec2(dot(local_position, axis), dot(local_position, across));
    float rotation = direction_angle;
    p = mat2(vec2(cos(rotation), -sin(rotation)), vec2(sin(rotation), cos(rotation))) * p;
    vec2 cell_size = max(stroke_size * 1.45, vec2(0.002));
    vec2 cell = floor(p / cell_size);
    vec4 pigment = vec4(0);
    // Neighbour support permits irregular placement without clipping at a grid cell.
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 candidate = cell + vec2(float(x), float(y));
            if (random_cell(candidate, 1.0) >= density) { continue; }
            vec2 jitter = vec2(random_cell(candidate, 2.0), random_cell(candidate, 3.0));
            vec2 center = (candidate + 0.1 + jitter * 0.8) * cell_size;
            float size_variation = mix(0.65, 1.15, random_cell(candidate, 7.0));
            vec2 delta = (p - center) / max(stroke_size * size_variation, vec2(0.001));
            float tilt = (random_cell(candidate, 4.0)-0.5) * (brush_group == 0 ? 0.35 : 0.06);
            delta = mat2(vec2(cos(tilt), -sin(tilt)), vec2(sin(tilt), cos(tilt))) * delta;
            vec2 uv = delta + vec2(0.5);
            if (any(lessThan(uv, vec2(0))) || any(greaterThan(uv, vec2(1)))) { continue; }
            float layer = float(brush_group * 4) + floor(random_cell(candidate, 5.0) * 4.0);
            vec4 sample_paint = texture(brushes, vec3(uv, layer));
            sample_paint.a *= 0.8 + 0.2 * random_cell(candidate, 6.0);
            if (sample_paint.a > pigment.a) { pigment = sample_paint; }
        }
    }
    if (pigment.a < 0.005) { discard; }
    ALBEDO = pigment.rgb * mix(vec3(1), material_tint.rgb * base.rgb, brush_group == 1 ? 0.45 : 0.15);
    ALPHA = pigment.a;
    ROUGHNESS = 1.0;
    if (debug_view == 1) { EMISSION = vec3(0.15, 0.65, 0.3); ALBEDO = vec3(0); }
}
void light() {
    // Both vectors are in view space; their dot product is camera invariant.
    // The overlay culls rear faces; original glass retains its transparency/culling.
    vec3 n = NORMAL;
    float facing = max(dot(n, LIGHT), 0.0);
    float weight = smoothstep(angle_cosines.x, angle_cosines.y, facing) * ATTENUATION;
    if (debug_view == 0) { DIFFUSE_LIGHT += LIGHT_COLOR / PI * weight * strength; }
    else if (debug_view == 2) { DIFFUSE_LIGHT += vec3(weight) * LIGHT_COLOR / PI; }
}
