class_name PainterlyHighlightSettings
extends Resource
## Layout is material-local and deterministic; lighting never changes the seed.
@export var enabled := true
@export var seed := 71
@export_enum("Beauty", "Coverage", "Received light") var debug_view := 0
@export var glass_enabled := true
@export var metal_enabled := true
@export var frame_enabled := true
@export_range(0, 4) var strength := 0.8
@export_range(0, 1) var density := 0.65
@export_range(0.1, 4) var size_scale := 1.0
@export var direction_degrees := 0.0
@export var glass_angles := Vector2(65, 25)
@export var metal_angles := Vector2(55, 20)
@export var frame_angles := Vector2(30, 15)

func snapshot() -> Dictionary:
	var result := {}
	for key in ["enabled", "seed", "debug_view", "glass_enabled", "metal_enabled", "frame_enabled", "strength", "density", "size_scale", "direction_degrees"]:
		result[key] = get(key)
	for key in ["glass_angles", "metal_angles", "frame_angles"]:
		var value: Vector2 = get(key)
		result[key] = [value.x, value.y]
	return result

func apply_state(state: Dictionary) -> void:
	if not valid_state(state):
		push_error("Invalid highlight settings; previous configuration retained")
		return
	for key in snapshot():
		if not state.has(key): continue
		if key.ends_with("_angles"):
			var value = state[key]
			if value is Array and value.size() == 2: set(key, Vector2(clampf(value[0], 0, 89), clampf(value[1], 0, 89)))
		else: set(key, state[key])
	strength = clampf(strength, 0, 4)
	density = clampf(density, 0, 1)
	size_scale = clampf(size_scale, 0.1, 4)
	debug_view = clampi(debug_view, 0, 2)

static func valid_state(state: Variant) -> bool:
	if not state is Dictionary: return false
	for key in state:
		var value = state[key]
		if key in ["enabled", "glass_enabled", "metal_enabled", "frame_enabled"]:
			if not value is bool: return false
		elif key in ["glass_angles", "metal_angles", "frame_angles"]:
			if not value is Array or value.size()!=2: return false
			for angle in value:
				if not (angle is float or angle is int) or not is_finite(angle) or angle<0 or angle>89: return false
		elif key in ["seed", "debug_view", "strength", "density", "size_scale", "direction_degrees"]:
			if not (value is float or value is int) or not is_finite(value): return false
			if key=="seed" and (value!=int(value) or abs(value)>2147483647): return false
			if key=="debug_view" and (value!=int(value) or value<0 or value>2): return false
			if key=="strength" and (value<0 or value>4): return false
			if key=="density" and (value<0 or value>1): return false
			if key=="size_scale" and (value<0.1 or value>4): return false
		else: return false
	return true
