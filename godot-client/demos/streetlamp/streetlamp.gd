extends Node3D
## Reusable prop: original base and four baked paint marks share one mesh/UV.
const BASE = preload("res://demos/streetlamp/assets/iron-base-atlas.png")
var painted := true
var night := false
var iron_material: StandardMaterial3D
var painted_texture: Texture2D
var bulb_material: StandardMaterial3D

func _ready() -> void:
	for node in $Model.find_children("*", "MeshInstance3D", true, false):
		for i in node.mesh.get_surface_count():
			var material = node.mesh.surface_get_material(i).duplicate()
			node.set_surface_override_material(i, material)
			if not material is StandardMaterial3D: continue
			material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
			material.texture_repeat = false
			if material.albedo_texture != null:
				var image = material.albedo_texture.get_image()
				if image.is_compressed(): image.decompress()
				if not image.has_mipmaps(): image.generate_mipmaps()
				material.albedo_texture = ImageTexture.create_from_image(image)
			if "CastIron" in node.name:
				iron_material = material
				painted_texture = material.albedo_texture
			if "Lampbulb" in node.name or "Lamp_bulb" in node.name or "Lamp bulb" in node.name:
				bulb_material = material
	set_painted(painted)
	set_night(night)

func set_painted(enabled: bool) -> void:
	painted = enabled
	if iron_material != null: iron_material.albedo_texture = painted_texture if painted else BASE

func set_night(enabled: bool) -> void:
	night = enabled
	$LampLight.light_energy = 2.4 if night else 0.0
	if bulb_material != null:
		bulb_material.emission_enabled = night
		bulb_material.emission = Color(1, 0.76, 0.42)
		bulb_material.emission_energy_multiplier = 2.5 if night else 0.0
