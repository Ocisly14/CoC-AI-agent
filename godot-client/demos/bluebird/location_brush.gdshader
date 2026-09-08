shader_type canvas_item;
render_mode unshaded;

uniform vec4 pigment : source_color = vec4(0.23, 0.34, 0.33, 1.0);
uniform vec4 secondary : source_color = vec4(0.63, 0.48, 0.29, 1.0);
uniform float reveal : hint_range(0.0, 1.0) = 1.0;
uniform float hover : hint_range(0.0, 1.0) = 0.0;
uniform float seed = 1.0;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void fragment() {
	vec2 p = UV;
	float strand = noise(vec2(p.y * 49.0, seed));
	float edge = noise(vec2(p.x * 16.0, seed + 4.0));
	float center = 0.51 - p.x * 0.06;
	float width = 0.31 + edge * 0.07;
	float body = 1.0 - smoothstep(width - 0.025, width + 0.025, abs(p.y - center));
	float start = 0.018 + strand * 0.065;
	float end = 0.86 + strand * 0.125;
	body *= smoothstep(start, start + 0.014, p.x) * (1.0 - smoothstep(end - 0.014, end, p.x));
	float sweep = 1.0 - smoothstep(reveal * 1.16 - 0.11, reveal * 1.16 - 0.05, p.x + strand * 0.045);
	float broad = noise(vec2(p.x * 7.0, p.y * 9.0) + seed);
	vec3 paint = mix(pigment.rgb, secondary.rgb, smoothstep(0.47, 0.86, broad) * 0.72);
	float bristles = noise(vec2(p.x * 13.0, p.y * 79.0) + seed);
	paint *= 0.87 + bristles * 0.22;
	paint += hover * vec3(0.065, 0.049, 0.026);
	float dry = mix(0.72, 1.0, smoothstep(0.12, 0.34, bristles));
	COLOR = vec4(paint, body * sweep * dry) * COLOR;
}
