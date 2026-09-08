extends Node3D
var yaw := 30.0
var view_size := 5.0
var night := false
var status: Label

func _ready() -> void:
	get_window().title = "灰港铸铁路灯 · 基础材质与少量油画叠加"
	var hud := CanvasLayer.new()
	add_child(hud)
	status = Label.new()
	status.position = Vector2(28, 24)
	status.add_theme_font_size_override("font_size", 18)
	hud.add_child(status)
	refresh()

func refresh() -> void:
	$Camera3D.position = Vector3(sin(deg_to_rad(yaw)) * 8, 3.2, cos(deg_to_rad(yaw)) * 8)
	$Camera3D.look_at(Vector3(0, 1.96, 0))
	$Camera3D.size = view_size
	status.text = "灰港 · 铸铁路灯\n%s · %s\n1 基础材质   2 油画叠加   L 昼夜   ← → 转向   滚轮 缩放" % ["四处油画色块" if $Streetlamp.painted else "仅基础旧漆", "夜间" if night else "白天"]

func set_night(enabled: bool) -> void:
	night = enabled
	$Streetlamp.set_night(night)
	$Sun.light_energy = 0.04 if night else 1.1
	$WorldEnvironment.environment.ambient_light_energy = 0.10 if night else 0.55
	refresh()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		match event.keycode:
			KEY_1: $Streetlamp.set_painted(false)
			KEY_2: $Streetlamp.set_painted(true)
			KEY_L: set_night(not night)
			KEY_LEFT: yaw -= 15
			KEY_RIGHT: yaw += 15
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP: view_size = maxf(1.0, view_size * .9)
		if event.button_index == MOUSE_BUTTON_WHEEL_DOWN: view_size = minf(7.0, view_size * 1.1)
	refresh()
