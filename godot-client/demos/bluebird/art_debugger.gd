extends PanelContainer
## Live calibration of the existing NPR pipeline. No automatic parameter fitting.

const PRESET_PATH = "user://bluebird-art-presets/current.json"
const PRESET_DIR = "user://bluebird-art-presets"
const HUE_DEFAULTS = {"hue_selection_mode": 0, "hue_center": 30.0, "hue_half_width": 65.0, "hue_feather": 50.0}
const HELP = {
	"color_response": "放大选中色域内的日照增色权重。范围未选中、没有直射光或增益上限为 0 时，提高它不会增色。",
	"chroma_gain": "限制日照额外增加的色度。0 表示不增艳；0.2 表示色度倍率最多接近 1.2。不是整张贴图饱和度。",
	"lightness_gain": "限制受光面的额外提亮。受重要度与原有明度保护影响，不跟随增色色相范围。",
	"contrast_response": "以明度中点为界，亮部更亮、暗部更暗。重要度越高越明显，明度改变量有软限制。",
	"contrast_pivot": "对比度调整的分界明度；高于它提亮，低于它压暗。不是曝光。",
	"saturation": "合成光照后统一调整色度，0 为灰度，1 保持原值。也影响阴影颜色，不受增色范围控制。",
	"detail_response": "提高后削弱低重要度区域的贴图细节，帮助突出重点。不会改变原始贴图文件。",
	"hue_half_width": "以目标色相为中心，向两侧各扩展这个角度。180° 选择所有色相；按 Oklab 色相距离筛选。",
	"hue_feather": "范围边缘逐渐减弱的宽度。增大更柔和，不会扩大外边界。",
	"hue_center": "目标颜色的 HSV 色相角：0° 红、60° 黄、120° 绿、180° 青、240° 蓝、300° 紫。",
}
const RENDER_RANGES = {
	"exposure": [0.1, 3.0], "color_response": [0.0, 4.0],
	"chroma_gain": [0.0, 1.0], "lightness_gain": [0.0, 0.15],
	"contrast_response": [0.0, 1.0], "contrast_pivot": [0.0, 1.0],
	"saturation": [0.0, 2.0], "detail_response": [0.0, 1.0],
	"importance_scale": [0.0, 3.0], "importance_gamma": [0.2, 3.0],
	"importance_override": [-1.0, 1.0], "hue_selection_mode": [0, 1],
	"hue_center": [0, 360], "hue_half_width": [0, 180], "hue_feather": [0.1, 90]
}
const LIGHT_RANGES = {
	"sun_energy": [0.0, 4.0], "ambient_energy": [0.0, 2.0],
	"azimuth": [-180.0, 180.0], "elevation": [5.0, 85.0]
}
const VIEWS = [0, 6, 9, 1, 2, 3, 4, 5, 17]

var demo: Node3D
var renderer: PainterlyRenderer
var widgets: Dictionary = {}
var initial: Dictionary
var baseline: Dictionary
var candidate: Dictionary
var comparing := false
var syncing := false
var status: Label
var tabs: TabContainer
var compare_button: Button
var view_menu: OptionButton
var preset_picker: FileDialog
var time_slider: HSlider
var time_readout: Label
var cycle_toggle: CheckBox
var play_button: Button
var playing := false
var cycle_elapsed := 0.0

func setup(scene: Node3D) -> void:
	demo = scene
	renderer = demo.painterly.renderer
	name = "ArtDebugger"
	theme = demo.get_node("HUD/Controls").theme
	set_anchors_and_offsets_preset(Control.PRESET_RIGHT_WIDE)
	offset_left = -426; offset_right = -16; offset_top = 76; offset_bottom = -102
	var style = StyleBoxFlat.new()
	style.bg_color = Color("26332ff5")
	style.set_corner_radius_all(8)
	style.content_margin_left = 14; style.content_margin_right = 14
	style.content_margin_top = 12; style.content_margin_bottom = 12
	add_theme_stylebox_override("panel", style)
	var column = VBoxContainer.new(); column.add_theme_constant_override("separation", 8); add_child(column)
	var heading = HBoxContainer.new(); column.add_child(heading)
	var title = Label.new(); title.text = "光照与美术调试"; title.size_flags_horizontal = Control.SIZE_EXPAND_FILL; heading.add_child(title)
	button(heading, "收起", func(): hide())
	view_menu = OptionButton.new(); column.add_child(view_menu)
	for label in ["成片", "美术重要度 · 白色更重要", "日照增色权重 · 白色更强", "固有色", "直接日照 · 遮挡前", "间接照明", "原始阴影", "笔刷阴影", "增色选区 · 白色被选中"]:
		view_menu.add_item(label)
	view_menu.item_selected.connect(func(index):
		renderer.debug_view = VIEWS[index]; renderer.refresh_settings()
		demo.debug_menu.select(0) if index == 0 else demo.debug_menu.select(-1))
	tabs = TabContainer.new(); tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL; column.add_child(tabs)
	var lighting = page("光照")
	cycle_toggle = CheckBox.new(); cycle_toggle.text = "按时间模拟太阳 / 月光"; lighting.add_child(cycle_toggle)
	cycle_toggle.toggled.connect(func(value): stop_playback(); change("cycle_enabled", value))
	time_readout = Label.new(); lighting.add_child(time_readout)
	time_slider = HSlider.new(); time_slider.min_value = 0; time_slider.max_value = 24; time_slider.step = 1.0 / 60.0
	time_slider.tooltip_text = "00:00 → 24:00；拖动自动启用昼夜模拟。"; lighting.add_child(time_slider)
	time_slider.value_changed.connect(func(value): stop_playback(); change("time_of_day", value))
	var times = HBoxContainer.new(); lighting.add_child(times)
	for pair in [["清晨", 6.5], ["正午", 12.0], ["日落", 17.5], ["午夜", 0.0]]:
		var hour: float = pair[1]
		button(times, pair[0], func(): stop_playback(); change("time_of_day", hour))
	play_button = button(times, "播放", func():
		playing = not playing; cycle_elapsed = 0
		if playing: change("cycle_enabled", true)
		play_button.text = "暂停" if playing else "播放")
	note(lighting, "0—24 时循环，播放约 2 分钟一天。白天太阳、夜间月光；拖动时间保持美术参数。手调下方光照会退出时间模拟。")
	note(lighting, "先固定光向与明暗比例，再调美术响应。改变光向会同步更新阴影。")
	slider(lighting, "sun_energy", "当前主光强度", 0, 4, 0.01)
	slider(lighting, "ambient_energy", "环境光强度", 0, 2, 0.01)
	slider(lighting, "azimuth", "当前主光方位角", -180, 180, 1)
	slider(lighting, "elevation", "当前主光高度角", 5, 85, 1)
	color_picker(lighting, "sun_color", "当前主光颜色")
	color_picker(lighting, "ambient_color", "环境光颜色")
	slider(lighting, "exposure", "输出曝光", 0.1, 3, 0.01)
	var art = page("美术响应")
	note(art, "日照增色取决于重要度、朝向、光强和色相匹配；整体饱和度作用于合成后的颜色。")
	checkbox(art, "selective_color", "启用日照增色")
	slider(art, "color_response", "日照增色响应", 0, 4, 0.01)
	slider(art, "chroma_gain", "日照饱和增益上限", 0, 1, 0.01)
	slider(art, "lightness_gain", "日照提亮上限", 0, 0.15, 0.001)
	slider(art, "contrast_response", "重要区域对比度", 0, 1, 0.01)
	slider(art, "contrast_pivot", "对比度明度中点", 0, 1, 0.01)
	slider(art, "saturation", "整体饱和度 · 1 为原值", 0, 2, 0.01)
	slider(art, "detail_response", "弱化低重要区域细节", 0, 1, 0.01)
	var importance = page("重要度")
	note(importance, "保留原重要度贴图，用倍率与曲线调整响应。曲线大于 1 会压低中间值，小于 1 会抬高中间值。")
	slider(importance, "importance_scale", "重要度倍率", 0, 3, 0.01)
	slider(importance, "importance_gamma", "重要度曲线", 0.2, 3, 0.01)
	checkbox(importance, "override_enabled", "临时使用统一重要度")
	slider(importance, "override_value", "统一重要度", 0, 1, 0.01)
	note(importance, "统一值用于隔离变量，不会改写贴图。立面、屋顶与地面共用这些调试参数；玻璃等原生材质不参与美术调色。")
	var selection = page("增色范围")
	note(selection, "跟随光色保留原效果；手选模式按贴图颜色选区，白色阳光下也可增色。选区只控制日照增艳，不改变基础光照染色。")
	checkbox(selection, "manual_hue", "手选贴图色相（取消则跟随光色）")
	color_picker(selection, "selected_hue", "目标颜色 · 取色相")
	slider(selection, "hue_center", "目标色相角", 0, 360, 1)
	slider(selection, "hue_half_width", "色相范围 ± 度", 0, 180, 1)
	slider(selection, "hue_feather", "边缘过渡宽度", 0.1, 90, 0.1)
	button(selection, "查看增色选区", func():
		renderer.debug_view = 17; renderer.refresh_settings(); sync_widgets())
	note(selection, "先开选区视图，选颜色并调范围，再回成片调增色响应和增益上限。灰白材质本身色度低，选区会更暗；阴影仍不获得直射光增色。悬停参数可查看说明。")
	var compare_row = HBoxContainer.new(); column.add_child(compare_row)
	button(compare_row, "当前设为 A", set_baseline)
	compare_button = button(compare_row, "对比 A", toggle_compare)
	button(compare_row, "恢复初始", restore_initial)
	var files = HBoxContainer.new(); column.add_child(files)
	button(files, "另存新参数", func(): save_new_preset())
	button(files, "选择参数读取", choose_preset)
	button(files, "保存截图", save_screenshot)
	preset_picker = FileDialog.new()
	preset_picker.title = "选择历史参数"
	preset_picker.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	preset_picker.access = FileDialog.ACCESS_FILESYSTEM
	preset_picker.filters = PackedStringArray(["*.json ; 美术参数 JSON"])
	preset_picker.file_selected.connect(func(path): load_preset(path))
	add_child(preset_picker)
	status = Label.new(); status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.add_theme_font_size_override("font_size", 12); column.add_child(status)
	initial = snapshot(); baseline = initial.duplicate(true)
	sync_widgets()
	message("拖动即时生效。F3 收起面板；A/B 保持当前镜头。")
	hide()

func page(title: String) -> VBoxContainer:
	var scroll = ScrollContainer.new(); scroll.name = title
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; tabs.add_child(scroll)
	var box = VBoxContainer.new(); box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_theme_constant_override("separation", 7); scroll.add_child(box)
	return box

func note(parent: Node, text: String) -> void:
	var label = Label.new(); label.text = text; label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", 13); parent.add_child(label)

func button(parent: Node, text: String, action: Callable) -> Button:
	var control = Button.new(); control.text = text; control.pressed.connect(action); parent.add_child(control)
	return control

func slider(parent: Node, key: String, title: String, low: float, high: float, step_: float) -> void:
	var row = HBoxContainer.new(); parent.add_child(row)
	var label = Label.new(); label.text = title; label.size_flags_horizontal = Control.SIZE_EXPAND_FILL; row.add_child(label)
	label.tooltip_text = HELP.get(key, "")
	var number = SpinBox.new(); number.min_value = low; number.max_value = high; number.step = step_
	number.tooltip_text = HELP.get(key, "")
	number.custom_minimum_size.x = 96; row.add_child(number)
	var bar = HSlider.new(); bar.min_value = low; bar.max_value = high; bar.step = step_; parent.add_child(bar)
	bar.tooltip_text = HELP.get(key, "")
	widgets[key] = [number, bar]
	number.value_changed.connect(func(value): bar.set_value_no_signal(value); change(key, value))
	bar.value_changed.connect(func(value): number.set_value_no_signal(value); change(key, value))

func color_picker(parent: Node, key: String, title: String) -> void:
	var row = HBoxContainer.new(); parent.add_child(row)
	var label = Label.new(); label.text = title; label.size_flags_horizontal = Control.SIZE_EXPAND_FILL; row.add_child(label)
	var picker = ColorPickerButton.new(); picker.edit_alpha = false; picker.custom_minimum_size = Vector2(96, 28)
	row.add_child(picker); widgets[key] = picker
	picker.color_changed.connect(func(value): change(key, value))

func checkbox(parent: Node, key: String, title: String) -> void:
	var check = CheckBox.new(); check.text = title; parent.add_child(check); widgets[key] = check
	check.toggled.connect(func(value): change(key, value))

func snapshot() -> Dictionary:
	var active = demo.active_celestial_light()
	var state = {"renderer": {}, "lighting": {
		"sun_energy": active.light_energy, "ambient_energy": demo.environment.ambient_light_energy,
		"azimuth": clampf(active.rotation_degrees.y, -180, 180), "elevation": clampf(-active.rotation_degrees.x, 5, 85),
		"sun_color": color_array(active.light_color), "ambient_color": color_array(demo.environment.ambient_light_color),
		"background_color": color_array(demo.environment.background_color)
	}, "cycle": {"enabled": demo.cycle_enabled, "hour": demo.time_of_day}}
	for key in RENDER_RANGES: state.renderer[key] = renderer.get(key)
	state.renderer.selective_color = renderer.selective_color
	return state

func color_array(value: Color) -> Array:
	return [value.r, value.g, value.b]

func apply_state(state: Dictionary) -> void:
	for key in state.renderer: renderer.set(key, state.renderer[key])
	if state.cycle.enabled:
		demo.set_time_of_day(state.cycle.hour)
		sync_widgets()
		return
	demo.leave_time_cycle()
	demo.time_of_day = state.cycle.hour
	var light = state.lighting
	demo.sun.light_energy = light.sun_energy
	demo.sun.rotation_degrees = Vector3(-light.elevation, light.azimuth, 0)
	demo.sun.light_color = Color(light.sun_color[0], light.sun_color[1], light.sun_color[2])
	demo.environment.ambient_light_energy = light.ambient_energy
	demo.environment.ambient_light_color = Color(light.ambient_color[0], light.ambient_color[1], light.ambient_color[2])
	demo.environment.background_color = Color(light.background_color[0], light.background_color[1], light.background_color[2])
	# Avoid sync_lighting(), which intentionally resets exposure for day/evening presets.
	renderer.set_environment_light(demo.environment.ambient_light_color, demo.environment.ambient_light_energy)
	renderer.set_lighting(demo.sun.global_basis.z, demo.sun.light_color, demo.sun.light_energy)
	renderer.refresh_settings()
	sync_widgets()

func change(key: String, value: Variant) -> void:
	if syncing: return
	# Editing while looking at A resumes the retained B before applying the edit.
	if comparing:
		comparing = false; apply_state(candidate); compare_button.text = "对比 A"
	var state = snapshot()
	if RENDER_RANGES.has(key) or key == "selective_color": state.renderer[key] = value
	elif LIGHT_RANGES.has(key):
		state.lighting[key] = value; state.cycle.enabled = false; stop_playback()
	elif key in ["sun_color", "ambient_color"]:
		state.lighting[key] = color_array(value); state.cycle.enabled = false; stop_playback()
	elif key == "time_of_day": state.cycle = {"enabled": true, "hour": fposmod(value, 24.0)}
	elif key == "cycle_enabled": state.cycle.enabled = value
	elif key == "manual_hue": state.renderer.hue_selection_mode = 1 if value else 0
	elif key == "selected_hue":
		if value.s < 0.001: return
		state.renderer.hue_center = value.h * 360.0
		state.renderer.hue_selection_mode = 1
	elif key == "override_enabled": state.renderer.importance_override = widgets.override_value[0].value if value else -1.0
	elif key == "override_value":
		if not widgets.override_enabled.button_pressed: return
		state.renderer.importance_override = value
	apply_state(state)
	message("当前：B · 参数已更新" if renderer.enabled else "美术调色已关闭，按 P 开启后查看美术响应。")

func sync_widgets() -> void:
	if widgets.is_empty(): return
	syncing = true
	var state = snapshot()
	for key in widgets:
		var control = widgets[key]
		if key == "manual_hue": control.set_pressed_no_signal(renderer.hue_selection_mode == 1); continue
		if key == "selected_hue": control.color = Color.from_hsv(renderer.hue_center / 360.0, 1, 1); continue
		if key == "override_enabled": control.set_pressed_no_signal(renderer.importance_override >= 0); continue
		if key == "override_value":
			if renderer.importance_override >= 0:
				for item in control: item.set_value_no_signal(renderer.importance_override)
			elif control[0].value == 0:
				for item in control: item.set_value_no_signal(0.5)
			continue
		if key == "selective_color": control.set_pressed_no_signal(renderer.selective_color); continue
		if key in ["sun_color", "ambient_color"]:
			var c = state.lighting[key]; control.color = Color(c[0], c[1], c[2]); continue
		var value = state.renderer[key] if state.renderer.has(key) else state.lighting[key]
		for item in control: item.set_value_no_signal(value)
	view_menu.select(VIEWS.find(renderer.debug_view))
	cycle_toggle.set_pressed_no_signal(demo.cycle_enabled)
	time_slider.set_value_no_signal(demo.time_of_day)
	var minutes = int(round(demo.time_of_day * 60.0)) % 1440
	var source = demo.DAY_NIGHT.sample(demo.time_of_day).source if demo.cycle_enabled else "手动光照"
	time_readout.text = "%02d:%02d   %s   00:00 ────── 24:00" % [minutes / 60, minutes % 60, source]
	syncing = false

func stop_playback() -> void:
	playing = false; cycle_elapsed = 0
	if play_button: play_button.text = "播放"

func _process(delta: float) -> void:
	if not playing or not demo.cycle_enabled: return
	cycle_elapsed += delta
	# Throttle shadow rebuilds; the renderer commits direction and depth together.
	if cycle_elapsed < 0.1 or renderer.is_capture_pending(): return
	var elapsed = cycle_elapsed; cycle_elapsed = 0
	change("time_of_day", demo.time_of_day + elapsed * 0.2)

func set_baseline() -> void:
	if comparing:
		message("正在查看 A；先返回 B 再替换基准。")
		return
	baseline = snapshot().duplicate(true)
	message("已把当前光照与美术参数设为 A。")

func toggle_compare() -> void:
	stop_playback()
	if comparing:
		comparing = false; apply_state(candidate)
		compare_button.text = "对比 A"; message("当前：B · 调节结果")
	else:
		candidate = snapshot().duplicate(true); comparing = true; apply_state(baseline)
		compare_button.text = "返回 B"; message("当前：A · 基准参数；B 已保留")

func restore_initial() -> void:
	stop_playback()
	comparing = false; compare_button.text = "对比 A"; apply_state(initial)
	message("已恢复本次启动参数。已保存的文件未改动。")

func external_lighting_changed() -> void:
	stop_playback()
	if comparing:
		comparing = false; compare_button.text = "对比 A"
	sync_widgets()
	message("已使用场景光照预设；面板数值已同步。")

func valid_state(state: Variant) -> bool:
	if not state is Dictionary: return false
	if not state.get("renderer") is Dictionary or not state.get("lighting") is Dictionary: return false
	for pair in [[RENDER_RANGES, state.renderer], [LIGHT_RANGES, state.lighting]]:
		for key in pair[0]:
			var value = pair[1].get(key)
			if not (value is float or value is int): return false
			if not is_finite(value) or value < pair[0][key][0] or value > pair[0][key][1]: return false
	if not state.renderer.get("selective_color") is bool: return false
	if state.renderer.hue_selection_mode != 0 and state.renderer.hue_selection_mode != 1: return false
	if state.renderer.size() != RENDER_RANGES.size() + 1 or state.lighting.size() != LIGHT_RANGES.size() + 3: return false
	if not state.get("cycle") is Dictionary or not state.cycle.get("enabled") is bool: return false
	var hour = state.cycle.get("hour")
	if not (hour is float or hour is int): return false
	if not is_finite(hour) or hour < 0 or hour >= 24: return false
	for key in ["sun_color", "ambient_color", "background_color"]:
		var color = state.lighting.get(key)
		if not color is Array or color.size() != 3: return false
		for value in color:
			if not (value is float or value is int): return false
			if not is_finite(value) or value < 0 or value > 1: return false
	return true

func save_new_preset(directory: String = PRESET_DIR) -> Error:
	var stamp = Time.get_datetime_string_from_system().replace(":", "-").replace("T", "_")
	var base = directory.path_join("art-" + stamp)
	var path = base + ".json"
	var suffix = 2
	while FileAccess.file_exists(path) or FileAccess.file_exists(path + ".tmp"):
		path = base + "-%02d.json" % suffix
		suffix += 1
	return save_preset(path)

func choose_preset() -> void:
	stop_playback()
	var directory = ProjectSettings.globalize_path(PRESET_DIR)
	DirAccess.make_dir_recursive_absolute(directory)
	preset_picker.current_dir = directory
	preset_picker.current_file = ""
	preset_picker.popup_centered_ratio(0.75)

func save_preset(path: String) -> Error:
	var state = candidate if comparing else snapshot()
	if not valid_state(state): message("参数超出支持范围，未保存。"); return ERR_INVALID_DATA
	var dir = ProjectSettings.globalize_path(path).get_base_dir()
	var error = DirAccess.make_dir_recursive_absolute(dir)
	if error != OK: message("无法创建参数目录：" + error_string(error)); return error
	var payload = {"version": 3, "state": state, "camera_reference": {
		"target": [demo.target.x, demo.target.y, demo.target.z], "yaw": demo.yaw, "pitch": demo.pitch, "size": demo.view_size},
		"shadow_reference": {"rectangle": renderer.rectangle_shadows_enabled, "overlay": renderer.rectangle_settings.texture_overlay_enabled,
		"seed": renderer.rectangle_settings.seed, "revision": renderer.rectangle_settings.painting_revision}}
	var file = FileAccess.open(path + ".tmp", FileAccess.WRITE)
	if file == null: error = FileAccess.get_open_error(); message("保存失败：" + error_string(error)); return error
	file.store_string(JSON.stringify(payload, "  ") + "\n"); file.flush(); error = file.get_error(); file.close()
	if error == OK: error = DirAccess.rename_absolute(ProjectSettings.globalize_path(path + ".tmp"), ProjectSettings.globalize_path(path))
	message("已保存 B 参数：" + ProjectSettings.globalize_path(path) if error == OK else "保存失败：" + error_string(error))
	return error

func load_preset(path: String) -> Error:
	if not FileAccess.file_exists(path): message("还没有保存的参数文件。"); return ERR_FILE_NOT_FOUND
	var payload = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not payload is Dictionary or (payload.get("version") != 1 and payload.get("version") != 2 and payload.get("version") != 3):
		message("参数文件版本无效，当前效果未改变。"); return ERR_INVALID_DATA
	# Migrate in memory only. The user's saved v1 file remains untouched.
	if payload.version == 1 and payload.get("state") is Dictionary and payload.state.get("renderer") is Dictionary:
		for key in HUE_DEFAULTS:
			if not payload.state.renderer.has(key): payload.state.renderer[key] = HUE_DEFAULTS[key]
	if payload.version < 3 and payload.get("state") is Dictionary and payload.state.get("lighting") is Dictionary:
		payload.state.cycle = {"enabled": false, "hour": 12.0}
		if not payload.state.lighting.has("background_color"):
			payload.state.lighting.background_color = color_array(Color("a4b7c2"))
	if not valid_state(payload.get("state")):
		message("参数文件无效，当前效果未改变。"); return ERR_INVALID_DATA
	payload.state.renderer.hue_selection_mode = int(payload.state.renderer.hue_selection_mode)
	stop_playback()
	comparing = false; compare_button.text = "对比 A"; apply_state(payload.state)
	message("已读取：" + path.get_file() + "；保留当前镜头与笔触布局。")
	return OK

func save_screenshot() -> void:
	stop_playback()
	var dir = "user://bluebird-art-presets"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	var path = dir.path_join("view-%d" % Time.get_ticks_msec())
	var state = snapshot().duplicate(true)
	var was_visible = visible
	demo.get_node("HUD").hide()
	while renderer.is_capture_pending(): await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var error = get_viewport().get_texture().get_image().save_png(path + ".png")
	demo.get_node("HUD").show(); visible = was_visible
	var file = FileAccess.open(path + ".json", FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify({"version": 3, "state": state, "debug_view": renderer.debug_view,
			"camera_reference": {"target": color_array(Color(demo.target.x, demo.target.y, demo.target.z)), "yaw": demo.yaw, "pitch": demo.pitch, "size": demo.view_size}}, "  "))
	message("截图已保存：" + ProjectSettings.globalize_path(path + ".png") if error == OK else "截图保存失败。")

func message(text: String) -> void:
	if status:
		status.text = text
		status.tooltip_text = text
