extends Control
## Fixed-view scene paintings and location strokes anchored to the building.

const BRUSH = preload("res://demos/bluebird/location_brush.gdshader")
const INTERIOR_DISPLAY_SCALE := 1.5
const PAINTINGS = [
	preload("res://demos/bluebird/assets/bluebird-dining-painted-background.png"),
	preload("res://demos/bluebird/assets/bluebird-kitchen-painted-background.png"),
]
const LOCATIONS = [
	{"id": "SCN_bluebird_dining", "title": "堂座", "detail": "咖啡 · 蛋挞 · 街坊闲谈", "color": "405d59", "accent": "aa8150", "body": "临窗的绿皮卡座磨得发亮，枫木长柜台前排着红皮转凳。咖啡机嘶嘶吐着蒸汽，玻璃柜里的葡式蛋挞刚刚出炉。"},
	{"id": "SCN_bluebird_kitchen", "title": "后厨", "detail": "炖鱼汤 · 烤箱 · 私语", "color": "505964", "accent": "819085", "body": "铸铁锅里的炖鱼汤煨了一整个上午。备菜台擦得发亮，老烤箱旁晾着暗金色的蛋挞模；角落的陡楼梯通往 Dolores 的住处。"},
	{"id": "SCN_bluebird_upstairs", "title": "楼上住处", "detail": "摇椅 · 家族照片 · 手抄食谱", "color": "786451", "accent": "a79879", "body": "小客厅连着卧室，摇椅正对着主街的窗。圆桌上铺着浆洗的桌布，墙上的照片从外祖父母的葡式咖啡馆排到儿女的毕业照。\n\n五斗柜上摊着葡语手抄食谱，页边叠着几代人的批注。里屋的铁床收拾得整齐，床头灯常亮到很晚。"},
]

var demo: Node3D
var menu: Control
var strokes: Array[Button] = []
var materials: Array[ShaderMaterial] = []
var labels: Array[Control] = []
var menu_open := false
var interior_open := false
var selected_index := -1
var overlay: Control
var painting: TextureRect
var heading: Label
var description: Label
var scene_tabs: HBoxContainer
var animation: Tween
var transition: Tween

func setup(host: Node3D) -> void:
	demo = host
	name = "LocationScenes"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	theme = demo.get_node("HUD/Controls").theme
	menu = Control.new()
	menu.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(menu)
	for index in LOCATIONS.size():
		_make_stroke(index)
	menu.hide()
	_build_interior()
	get_viewport().size_changed.connect(_layout_interior)
	_layout_interior()
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--bluebird-location="):
			var location_id: String = argument.trim_prefix("--bluebird-location=")
			for index in LOCATIONS.size():
				if LOCATIONS[index].id == location_id:
					call_deferred("open_location", index)

func _make_stroke(index: int) -> void:
	var data: Dictionary = LOCATIONS[index]
	var button := Button.new()
	button.name = data.id
	button.position = Vector2([0, 12, -6][index], (2 - index) * 70)
	button.size = Vector2(276, 76)
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.tooltip_text = "蓝鸟餐馆 · " + data.title
	for state in ["normal", "hover", "pressed", "focus"]:
		button.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	menu.add_child(button)
	var paint := ColorRect.new()
	paint.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	paint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var material_ := ShaderMaterial.new()
	material_.shader = BRUSH
	material_.set_shader_parameter("pigment", Color(data.color))
	material_.set_shader_parameter("secondary", Color(data.accent))
	material_.set_shader_parameter("seed", 5.7 + index * 8.1)
	paint.material = material_
	button.add_child(paint)
	var words := VBoxContainer.new()
	words.position = Vector2(31, 14)
	words.size = Vector2(218, 50)
	words.mouse_filter = Control.MOUSE_FILTER_IGNORE
	words.add_theme_constant_override("separation", 2)
	button.add_child(words)
	var title_ := _label(data.title, 21)
	words.add_child(title_)
	var subtitle := _label(data.detail, 12)
	subtitle.modulate = Color(1, 1, 1, 0.78)
	words.add_child(subtitle)
	button.pressed.connect(func(): open_location(index))
	button.mouse_entered.connect(func(): material_.set_shader_parameter("hover", 1.0))
	button.mouse_exited.connect(func(): material_.set_shader_parameter("hover", 0.0))
	button.focus_entered.connect(func(): material_.set_shader_parameter("hover", 1.0))
	button.focus_exited.connect(func(): material_.set_shader_parameter("hover", 0.0))
	strokes.append(button)
	materials.append(material_)
	labels.append(words)

func _label(value: String, font_size: int) -> Label:
	var label := Label.new()
	label.text = value
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", Color("e7ddc8"))
	return label

func _build_interior() -> void:
	overlay = Control.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(overlay)
	var black := ColorRect.new()
	black.color = Color.BLACK
	black.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	black.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(black)
	painting = TextureRect.new()
	painting.texture = PAINTINGS[0]
	painting.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	painting.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	painting.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(painting)
	heading = _label("", 24)
	overlay.add_child(heading)
	description = _label("", 16)
	description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	description.add_theme_color_override("font_color", Color("bcb5a6"))
	overlay.add_child(description)
	var back := Button.new()
	back.text = "← 返回街角  Esc"
	back.position = Vector2(28, 22)
	back.pressed.connect(close_interior)
	overlay.add_child(back)
	scene_tabs = HBoxContainer.new()
	scene_tabs.add_theme_constant_override("separation", 12)
	overlay.add_child(scene_tabs)
	for index in LOCATIONS.size():
		var button := Button.new()
		button.text = LOCATIONS[index].title
		button.toggle_mode = true
		button.pressed.connect(func(): open_location(index))
		scene_tabs.add_child(button)
	overlay.hide()

func _layout_interior() -> void:
	var viewport_size := get_viewport_rect().size
	painting.position = Vector2(20, 64)
	painting.size = Vector2(viewport_size.x - 40, maxf(180, viewport_size.y - 190))
	painting.pivot_offset = painting.size * 0.5
	painting.scale = Vector2.ONE * INTERIOR_DISPLAY_SCALE
	heading.position = Vector2(36, viewport_size.y - 116)
	description.position = Vector2(36, viewport_size.y - 78)
	description.size = Vector2(maxf(200, viewport_size.x - 72), 70)
	scene_tabs.position = Vector2(viewport_size.x - 344, 22)
	if selected_index == 2:
		heading.position = Vector2(viewport_size.x * 0.22, viewport_size.y * 0.30)
		description.position = heading.position + Vector2(0, 60)
		description.size = Vector2(viewport_size.x * 0.56, viewport_size.y * 0.50)

func _process(_delta: float) -> void:
	if not menu_open:
		return
	var anchor: Vector2 = demo.camera.unproject_position(Vector3(0, 6.4, 0))
	var viewport_size := get_viewport_rect().size
	menu.position = Vector2(clampf(anchor.x + 22, 20, viewport_size.x - 306), clampf(anchor.y - 214, 108, viewport_size.y - 300))

func set_menu_open(enabled: bool) -> void:
	menu_open = enabled
	if animation != null:
		animation.kill()
	menu.visible = enabled
	if not enabled:
		return
	demo.set_info_visible(false)
	animation = create_tween().set_parallel(true)
	for index in strokes.size():
		var button := strokes[index]
		var final_y: float = (2 - index) * 70.0
		button.position.y = final_y + 18
		materials[index].set_shader_parameter("reveal", 0.0)
		labels[index].modulate.a = 0.0
		animation.tween_property(materials[index], "shader_parameter/reveal", 1.0, 0.27).set_delay(index * 0.11)
		animation.tween_property(button, "position:y", final_y, 0.32).set_delay(index * 0.11).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		animation.tween_property(labels[index], "modulate:a", 1.0, 0.20).set_delay(index * 0.11 + 0.12)

func open_location(index: int) -> void:
	if index < 0 or index >= LOCATIONS.size():
		return
	var was_open := interior_open
	set_menu_open(false)
	selected_index = index
	interior_open = true
	demo.set_info_visible(false)
	if demo.art_debugger != null:
		demo.art_debugger.hide()
	heading.text = "蓝鸟餐馆 · " + LOCATIONS[index].title
	description.text = LOCATIONS[index].body
	painting.visible = index != 2
	painting.texture = PAINTINGS[index] if index < PAINTINGS.size() else null
	for item in scene_tabs.get_child_count():
		scene_tabs.get_child(item).set_pressed_no_signal(item == index)
	_layout_interior()
	if transition != null:
		transition.kill()
	overlay.show()
	overlay.modulate.a = 1.0 if was_open else 0.0
	painting.modulate.a = 0.0
	transition = create_tween()
	transition.tween_property(overlay, "modulate:a", 1.0, 0.22)
	transition.tween_property(painting, "modulate:a", 1.0, 0.32)

func close_interior() -> void:
	if transition != null:
		transition.kill()
	interior_open = false
	overlay.hide()
	set_menu_open(true)

func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		if interior_open:
			close_interior()
		elif menu_open:
			set_menu_open(false)
		else:
			return
		get_viewport().set_input_as_handled()
	elif interior_open and (event is InputEventMagnifyGesture or event is InputEventPanGesture):
		get_viewport().set_input_as_handled()
	elif interior_open and event is InputEventKey and event.keycode in [KEY_R, KEY_I, KEY_P, KEY_B, KEY_1, KEY_2, KEY_F3]:
		get_viewport().set_input_as_handled()
