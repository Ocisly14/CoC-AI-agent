extends RefCounted
## Demo adapter: retain the painterly solar/ambient result exactly in emission,
## then style Godot's shadowed local lights with shared perceptual colour helpers.
## Directional light is excluded; local art controls are independent of solar settings.
static func adapt(source: Shader) -> Shader:
	var shader := Shader.new()
	assert(source.code.contains("unshaded, fog_disabled"))
	assert(source.code.contains("ALBEDO=result;"))
	shader.code = source.code.replace("unshaded, fog_disabled", "fog_disabled, ambient_light_disabled, specular_disabled")
	shader.code = shader.code.replace("void fragment()", '#include "res://demos/bluebird/lamp_color.gdshaderinc"\nvoid fragment()')
	shader.code = shader.code.replace("ALBEDO=result;", "EMISSION=result; ALBEDO=vec3(1.0); lamp_albedo=albedo; lamp_importance=importance; ROUGHNESS=1.0; SPECULAR=0.0;")
	shader.code += """
void light() {
    if (!LIGHT_IS_DIRECTIONAL && debug_view == 0) {
        vec3 direct = lamp_albedo * max(dot(NORMAL, LIGHT), 0.0) * ATTENUATION * LIGHT_COLOR / PI;
        DIFFUSE_LIGHT += style_lamp_light(direct, LIGHT_COLOR / PI, ATTENUATION);
    }
}
"""
	return shader
