extends Node3D
## Reusable prop: original base and four baked paint marks share one mesh/UV.
const BASE = preload("res://demos/streetlamp/assets/iron-base-atlas.png")
static var _mipmap_textures: Dictionary = {}
@export_range(0.0, 20.0, 0.1) var night_energy := 2.4
@export var bulb_color := Color(1, 0.76, 0.42)
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
				var key = material.albedo_texture.get_instance_id()
				if not _mipmap_textures.has(key):
					var image = material.albedo_texture.get_image()
					if image.is_compressed(): image.decompress()
					if not image.has_mipmaps(): image.generate_mipmaps()
					_mipmap_textures[key] = ImageTexture.create_from_image(image)
				material.albedo_texture = _mipmap_textures[key]
			if "CastIron" in node.name:
				iron_material = material
				painted_texture = material.albedo_texture
			if "Lampbulb" in node.name or "Lamp_bulb" in node.name or "Lamp bulb" in node.name:
				bulb_material = material
				# The lamp's own opaque bulb must not enclose and occlude its point light.
				node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			if material.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED:
				node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	set_painted(painted)
	set_night(night)

func set_painted(enabled: bool) -> void:
	painted = enabled
	if iron_material != null: iron_material.albedo_texture = painted_texture if painted else BASE

func set_night(enabled: bool) -> void:
	night = enabled
	$LampLight.light_energy = night_energy if night else 0.0
	if bulb_material != null:
		bulb_material.emission_enabled = night and night_energy > 0.0
		bulb_material.emission = bulb_color
		bulb_material.emission_energy_multiplier = 2.5 if night and night_energy > 0.0 else 0.0
