extends Node3D
## Visual street furniture only; no simulated world facts or item IDs are added.
var night := false
const DEFAULT_SETTINGS = {"lamp_temperature": 3150.0, "lamp_energy": 9.7,
	"lamp_attenuation": 1.9, "lamp_range": 11.5, "lamp_art_enabled": true,
	"lamp_art_strength": 4.1, "lamp_importance_boost": 1.85, "lamp_hue_boost": 1.45,
	"lamp_chroma_gain": 1.05, "lamp_lightness_gain": 0.6, "lamp_hue_width": 56.0}
const SETTING_RANGES = {"lamp_temperature": [1800.0, 10000.0], "lamp_energy": [0.0, 40.0],
	"lamp_attenuation": [0.5, 6.0], "lamp_range": [2.0, 16.0], "lamp_art_strength": [0.0, 8.0],
	"lamp_importance_boost": [0.0, 3.0], "lamp_hue_boost": [0.0, 3.0],
	"lamp_chroma_gain": [0.0, 2.0], "lamp_lightness_gain": [0.0, 0.8], "lamp_hue_width": [1.0, 180.0]}
var settings: Dictionary = DEFAULT_SETTINGS.duplicate()
signal settings_changed(values: Dictionary)

func _ready() -> void:
	for lamp in get_children():
		var light: OmniLight3D = lamp.get_node("LampLight")
		light.shadow_enabled = true
		light.shadow_bias = 0.025
		light.shadow_normal_bias = 0.10
		light.light_size = 0.55
		light.shadow_blur = 2.5
		light.shadow_opacity = 0.72
	set_night(false)
	apply_settings(settings)

func apply_settings(values: Dictionary) -> void:
	for key in SETTING_RANGES:
		settings[key] = clampf(values.get(key, settings[key]), SETTING_RANGES[key][0], SETTING_RANGES[key][1])
	settings.lamp_art_enabled = values.get("lamp_art_enabled", settings.lamp_art_enabled)
	var tint = temperature_color(settings.lamp_temperature)
	for lamp in get_children():
		lamp.night_energy = settings.lamp_energy
		lamp.bulb_color = tint
		var light: OmniLight3D = lamp.get_node("LampLight")
		light.light_color = tint
		light.omni_range = settings.lamp_range
		light.omni_attenuation = settings.lamp_attenuation
		lamp.set_night(night)
	settings_changed.emit(settings.duplicate())

static func temperature_color(kelvin: float) -> Color:
	# Artistic approximation, anchored to the existing warm lamp at 3000 K.
	var stops = [[1800.0, Color(1, .49, .18)], [3000.0, Color(1, .77, .47)],
		[4500.0, Color(1, .89, .74)], [6500.0, Color(1, 1, 1)], [10000.0, Color(.79, .87, 1)]]
	for i in range(1, stops.size()):
		if kelvin <= stops[i][0]:
			return stops[i-1][1].lerp(stops[i][1], clampf(inverse_lerp(stops[i-1][0], stops[i][0], kelvin), 0, 1))
	return stops[-1][1]

func set_night(enabled: bool) -> void:
	night = enabled
	for lamp in get_children(): lamp.set_night(night)
