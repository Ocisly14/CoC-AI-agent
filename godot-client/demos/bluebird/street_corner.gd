extends Node3D
## Self-contained exterior study. Preview lighting never changes simulation state.

const HOME_TARGET := Vector3(0.0, 1.7, 0.0)
const HOME_YAW := 42.0
const HOME_PITCH := 31.0
const HOME_SIZE := 23.0

@onready var camera: Camera3D = $Camera3D
@onready var sun: DirectionalLight3D = $Lighting/Sun
@onready var environment: Environment = $WorldEnvironment.environment
@onready var info: PanelContainer = $HUD/Info
@onready var time_label: Label = $HUD/TopBar/Margin/Row/Time
@onready var day_button: Button = $HUD/Controls/Margin/Row/Day
@onready var evening_button: Button = $HUD/Controls/Margin/Row/Evening
@onready var info_button: Button = $HUD/Controls/Margin/Row/Info

var target := HOME_TARGET
var yaw := HOME_YAW
var pitch := HOME_PITCH
var view_size := HOME_SIZE
var evening := false
var painterly: Node3D
var grade_button: Button
var debug_menu: OptionButton
var seam_button: Button

func _ready() -> void:
	$HUD/Controls/Margin/Row/Reset.pressed.connect(reset_view)
	day_button.pressed.connect(func(): set_evening(false))
	evening_button.pressed.connect(func(): set_evening(true))
	info_button.pressed.connect(func(): set_info_visible(not info.visible))
	$HUD/Info/Margin/Column/Close.pressed.connect(func(): set_info_visible(false))
	set_evening(false)
	_update_camera()
	if RenderingServer.get_current_rendering_method() == "forward_plus":
		painterly = load("res://demos/bluebird/painterly_preview.gd").new()
		painterly.name = "PainterlyPreview"
		add_child(painterly)
		painterly.setup(self)
		painterly.sync_lighting(self)
		grade_button = Button.new()
		grade_button.text = "美术调色 [P]"
		grade_button.toggle_mode = true
		grade_button.button_pressed = true
		grade_button.toggled.connect(set_grading)
		$HUD/Controls/Margin/Row.add_child(grade_button)
		debug_menu = OptionButton.new()
		for label in ["成片", "固有色", "日照增强权重", "美术重要度", "叠色遮罩", "叠色来源", "叠色方向"]:
			debug_menu.add_item(label)
		debug_menu.item_selected.connect(func(index):
			painterly.renderer.debug_view = [0, 1, 9, 6, 14, 15, 16][index]
			painterly.renderer.refresh_settings())
		$HUD/Controls/Margin/Row.add_child(debug_menu)
		seam_button=Button.new()
		seam_button.text="接缝叠色 [B]"
		seam_button.toggle_mode=true
		seam_button.button_pressed=true
		seam_button.toggled.connect(set_seam_paint)
		$HUD/Controls/Margin/Row.add_child(seam_button)
	if OS.get_cmdline_user_args().has("--bluebird-seam-qa"):
		var seam_qa=load("res://demos/bluebird/tools/seam_qa.gd").new()
		add_child(seam_qa)
		seam_qa.call_deferred("run",self)
	if OS.get_cmdline_user_args().has("--bluebird-color-qa"):
		var color_qa = load("res://demos/bluebird/tools/color_qa.gd").new()
		add_child(color_qa)
		color_qa.call_deferred("run", self)
	if OS.get_cmdline_user_args().has("--bluebird-rectangle-qa"):
		var qa=load("res://demos/bluebird/tools/rectangle_qa.gd").new()
		add_child(qa)
		qa.call_deferred("run",self)
	if OS.get_cmdline_user_args().has("--bluebird-pressure-qa"):
		var qa = load("res://demos/bluebird/tools/pressure_qa.gd").new()
		add_child(qa)
		qa.call_deferred("run", self)
	if OS.get_cmdline_user_args().has("--bluebird-aui-qa"):
		var qa = load("res://demos/bluebird/tools/aui_qa.gd").new()
		add_child(qa)
		qa.call_deferred("run", self)
	if OS.get_cmdline_user_args().has("--bluebird-qa"):
		var qa = load("res://demos/bluebird/tools/qa.gd").new()
		add_child(qa)
		qa.call_deferred("run", self)
	if OS.get_cmdline_user_args().has("--bluebird-material-views"):
		var views = load("res://demos/bluebird/tools/material_views.gd").new()
		add_child(views)
		views.call_deferred("run", self)

func reset_view() -> void:
	target = HOME_TARGET
	yaw = HOME_YAW
	pitch = HOME_PITCH
	view_size = HOME_SIZE
	_update_camera()

func _update_camera() -> void:
	var azimuth := deg_to_rad(yaw)
	var elevation := deg_to_rad(pitch)
	var direction := Vector3(sin(azimuth) * cos(elevation), sin(elevation), cos(azimuth) * cos(elevation))
	camera.position = target + direction * 45.0
	camera.look_at(target)
	camera.size = view_size

func set_evening(enabled: bool) -> void:
	evening = enabled
	day_button.button_pressed = not enabled
	evening_button.button_pressed = enabled
	# Sunny direct light with cool ambient fill preserves colored shadows.
	sun.rotation_degrees = Vector3(-23, -38, 0) if enabled else Vector3(-48, -32, 0)
	sun.light_color = Color("e5c5a8") if enabled else Color("fff0d6")
	sun.light_energy = 0.38 if enabled else 1.10
	sun.shadow_opacity = 0.70 if enabled else 0.85
	# PCSS is available in Forward+; Compatibility uses the gentler light ratio.
	sun.light_angular_distance = (3.0 if enabled else 0.65) if RenderingServer.get_current_rendering_method() == "forward_plus" else 0.0
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	environment.ambient_light_color = Color("a5aec3") if enabled else Color("afc3dd")
	environment.ambient_light_energy = 0.58 if enabled else 0.55
	environment.background_color = Color("737d87") if enabled else Color("a4b7c2")
	environment.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	environment.tonemap_exposure = 1.0
	environment.adjustment_enabled = false
	environment.adjustment_saturation = 1.0
	environment.adjustment_contrast = 1.0
	environment.adjustment_brightness = 1.0
	time_label.text = "暮色 · 柔光预览" if enabled else "晴天 · 日照预览"
	if painterly != null:
		painterly.sync_lighting(self)

func set_seam_paint(enabled_: bool) -> void:
	if painterly==null: return
	painterly.renderer.seam_enabled=enabled_
	painterly.renderer.refresh_settings()
	seam_button.set_pressed_no_signal(enabled_)

func set_grading(enabled: bool) -> void:
	if painterly == null: return
	painterly.renderer.enabled = enabled
	painterly.renderer.refresh_settings()
	grade_button.set_pressed_no_signal(enabled)
	grade_button.text = "美术调色 [P]" if enabled else "基础照明 [P]"

func set_info_visible(enabled: bool) -> void:
	info.visible = enabled
	info_button.button_pressed = enabled

func building_at(screen_position: Vector2) -> bool:
	var origin := camera.project_ray_origin(screen_position)
	var direction := camera.project_ray_normal(screen_position)
	var query := PhysicsRayQueryParameters3D.create(origin, origin + direction * 120.0, 2)
	var result := get_world_3d().direct_space_state.intersect_ray(query)
	return not result.is_empty()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		match event.button_index:
			MOUSE_BUTTON_WHEEL_UP:
				view_size = clampf(view_size * 0.9, 12.0, 38.0)
			MOUSE_BUTTON_WHEEL_DOWN:
				view_size = clampf(view_size / 0.9, 12.0, 38.0)
			MOUSE_BUTTON_LEFT:
				set_info_visible(building_at(event.position))
		_update_camera()
	elif event is InputEventMouseMotion:
		if event.button_mask & MOUSE_BUTTON_MASK_MIDDLE:
			_pan(event.relative)
	elif event is InputEventMagnifyGesture:
		view_size = clampf(view_size / event.factor, 12.0, 38.0)
		_update_camera()
	elif event is InputEventPanGesture:
		_pan(event.delta * 10.0)
	elif event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_R: reset_view()
			KEY_1: set_evening(false)
			KEY_2: set_evening(true)
			KEY_B:
				if painterly != null: set_seam_paint(not painterly.renderer.seam_enabled)
			KEY_P:
				if painterly != null: set_grading(not painterly.renderer.enabled)
			KEY_I: set_info_visible(not info.visible)
			KEY_ESCAPE: set_info_visible(false)

func _pan(delta: Vector2) -> void:
	var right := camera.global_basis.x
	var forward := Vector3(camera.global_basis.z.x, 0, camera.global_basis.z.z).normalized()
	target += (-right * delta.x - forward * delta.y) * view_size / get_viewport().get_visible_rect().size.y
	target.x = clampf(target.x, -10.0, 10.0)
	target.z = clampf(target.z, -10.0, 10.0)
	_update_camera()
