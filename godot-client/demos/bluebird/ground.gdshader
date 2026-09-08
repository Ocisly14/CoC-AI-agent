shader_type spatial;
render_mode diffuse_burley;

uniform vec4 base_color : source_color = vec4(0.28, 0.30, 0.29, 1.0);
uniform vec4 secondary_color : source_color = vec4(0.32, 0.33, 0.30, 1.0);
uniform bool paving = false;
varying vec3 world_position;

#include "res://rendering/painterly/shaders/ground_albedo.gdshaderinc"
void vertex() { world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
	ALBEDO = ground_albedo(world_position, base_color.rgb, secondary_color.rgb, paving);
	ROUGHNESS = 0.92;
}
