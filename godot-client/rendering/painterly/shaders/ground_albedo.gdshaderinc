float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
		mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec3 ground_albedo(vec3 position, vec3 ground_base, vec3 ground_secondary, bool ground_paving) {
	vec2 p = position.xz;
	// Quiet, broad variation; the building carries the expressive painting.
	float field = smoothstep(0.22, 0.8, noise(p * vec2(0.32, 0.65)));
	vec3 color = mix(ground_base, ground_secondary, field * 0.7);
	if (ground_paving) {
		vec2 tile = p / 1.6;
		vec2 edge = abs(fract(tile + 0.5) - 0.5);
		vec2 aa = max(fwidth(tile), vec2(0.0005));
		vec2 seam = smoothstep(vec2(0.493) - aa, vec2(0.493) + aa, edge);
		color *= 1.0 - max(seam.x, seam.y) * 0.15;
		color *= mix(0.97, 1.03, hash(floor(tile + 0.5)));
	}
	return color;
}
