extends SceneTree
## Run with --script and -- --bluebird-art-debug. Never writes the user's preset.
var failures: Array = []
var scene
var panel
var renderer
const OUT = "/private/tmp/bluebird-art-debug-qa"

func _initialize() -> void:
	run.call_deferred()

func check(condition: bool, text: String) -> void:
	if not condition: failures.append(text); push_error(text)

func frame(name_: String = "") -> Image:
	while renderer.is_capture_pending(): await process_frame
	for i in 4: await RenderingServer.frame_post_draw
	var img = root.get_texture().get_image()
	if name_ != "": img.save_png(OUT.path_join(name_ + ".png"))
	return img

func run() -> void:
	DirAccess.make_dir_recursive_absolute(OUT)
	scene = load("res://demos/bluebird/street_corner.tscn").instantiate()
	root.add_child(scene); current_scene = scene
	panel = scene.art_debugger; renderer = scene.painterly.renderer
	var saved = panel.snapshot().duplicate(true)
	check(panel.valid_state(saved), "Initial or restored user preset validates")
	var preset_before = FileAccess.get_file_as_string(panel.PRESET_PATH)
	var history_dir = OUT.path_join("history-%d" % Time.get_ticks_usec())
	check(panel.save_new_preset(history_dir) == OK, "First history save succeeds")
	var first = DirAccess.get_files_at(history_dir)[0]
	var first_bytes = FileAccess.get_file_as_bytes(history_dir.path_join(first))
	panel.change("saturation", 0.4)
	check(panel.save_new_preset(history_dir) == OK, "Second history save succeeds")
	check(DirAccess.get_files_at(history_dir).size() == 2, "Repeated save creates two files")
	check(FileAccess.get_file_as_bytes(history_dir.path_join(first)) == first_bytes, "First history file remains unchanged")
	panel.choose_preset()
	await frame("00-history-picker")
	check(panel.preset_picker.visible and panel.preset_picker.file_mode == FileDialog.FILE_MODE_OPEN_FILE, "Load opens a file picker")
	panel.preset_picker.file_selected.emit(history_dir.path_join(first))
	panel.preset_picker.hide()
	check(is_equal_approx(renderer.saturation, saved.renderer.saturation), "Chosen historical file restores its values")
	panel.tabs.current_tab = 3
	await frame("01-range-controls")
	panel.widgets.manual_hue.button_pressed = true
	panel.widgets.hue_center[0].value = 0
	check(renderer.hue_selection_mode == 1 and renderer.hue_center == 0, "Widgets update renderer")
	panel.set_baseline()
	panel.widgets.hue_center[1].value = 240
	panel.toggle_compare(); check(renderer.hue_center == 0, "A restores hue selection")
	panel.toggle_compare(); check(renderer.hue_center == 240, "B restores hue selection")
	var path = OUT.path_join("test-preset.json")
	check(panel.save_preset(path) == OK, "V2 saves")
	panel.change("hue_center", 60.0)
	check(panel.load_preset(path) == OK and renderer.hue_center == 240, "V2 round trip")
	var v1 = saved.duplicate(true)
	for key in panel.HUE_DEFAULTS: v1.renderer.erase(key)
	var file = FileAccess.open(path, FileAccess.WRITE)
	file.store_string(JSON.stringify({"version": 1, "state": v1})); file.close()
	check(panel.load_preset(path) == OK and renderer.hue_selection_mode == 0, "V1 migration keeps legacy mode")
	var original = panel.snapshot()
	file = FileAccess.open(path, FileAccess.WRITE); file.store_string('{"version":2,"state":{}}'); file.close()
	check(panel.load_preset(path) != OK and panel.snapshot() == original, "Invalid preset does not mutate state")
	# Exercise shared GPU hue function, including wrap-around and white sunlight.
	var viewport = SubViewport.new(); viewport.size = Vector2i(100, 8); viewport.use_hdr_2d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS; root.add_child(viewport)
	var rect = ColorRect.new(); rect.size = Vector2(100, 8); viewport.add_child(rect)
	var shader = Shader.new()
	shader.code = 'shader_type canvas_item;\n#include "res://rendering/painterly/shaders/color.gdshaderinc"\n#include "res://rendering/painterly/shaders/color_selection.gdshaderinc"\nvoid fragment(){vec3 c=UV.x<0.2?vec3(1,0,0):(UV.x<0.4?vec3(0,1,0):(UV.x<0.6?vec3(0,0,1):(UV.x<0.8?vec3(1,0.001,0):vec3(1,0,0.001))));COLOR=vec4(vec3(selected_hue_weight(to_oklab(c),to_oklab(vec3(1)))),1);}'
	var mat = ShaderMaterial.new(); mat.shader = shader; rect.material = mat
	mat.set_shader_parameter("hue_selection_mode", 1); mat.set_shader_parameter("hue_center", 0.0)
	mat.set_shader_parameter("hue_half_width", 20.0); mat.set_shader_parameter("hue_feather", 5.0)
	for i in 4: await RenderingServer.frame_post_draw
	var samples = viewport.get_texture().get_image()
	check(samples.get_pixel(10,4).r > 0.99, "Red target selected under white sun")
	check(samples.get_pixel(30,4).r < 0.01 and samples.get_pixel(50,4).r < 0.01, "Green and blue excluded")
	check(samples.get_pixel(70,4).r > 0.99 and samples.get_pixel(90,4).r > 0.99, "Hue wrap across red is continuous")
	mat.set_shader_parameter("hue_half_width", 180.0)
	for i in 4: await RenderingServer.frame_post_draw
	samples = viewport.get_texture().get_image()
	check(samples.get_pixel(30,4).r > 0.99 and samples.get_pixel(50,4).r > 0.99, "180 selects all hues")
	viewport.queue_free()
	# Real scene: color response must visibly affect manual selection with white sun.
	panel.apply_state(saved)
	panel.change("sun_color", Color.WHITE); panel.change("manual_hue", true)
	panel.change("hue_half_width", 180.0); panel.change("chroma_gain", 0.6)
	panel.change("saturation", 1.0); panel.change("color_response", 0.0)
	renderer.selective_color = true; renderer.enabled = true; renderer.debug_view = 0; renderer.refresh_settings()
	scene.get_node("HUD").hide()
	var before = await frame("02-response-zero")
	var captures = renderer.capture_count
	panel.change("color_response", 4.0)
	var after = await frame("03-response-four")
	check(before.get_data() != after.get_data(), "Manual response visibly changes the scene")
	check(renderer.capture_count == captures, "Art edits do not recapture depth")
	panel.change("hue_half_width", 35.0); panel.change("hue_center", 0.0)
	renderer.debug_view = 17; renderer.refresh_settings(); await frame("04-selection-mask")
	panel.apply_state(saved); renderer.debug_view = 0; renderer.refresh_settings()
	scene.get_node("HUD").show(); panel.tabs.current_tab = 3; panel.sync_widgets()
	panel.message("保存生成新版本；读取时可自选历史参数。")
	await frame("05-restored-controls")
	check(FileAccess.get_file_as_string(panel.PRESET_PATH) == preset_before, "User preset is unchanged")
	file = FileAccess.open(OUT.path_join("validation.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify({"failures": failures, "user_preset_unchanged": true}, "  ")); file.close()
	print("ART_DEBUG_QA ", JSON.stringify({"failures": failures}))
	quit(0 if failures.is_empty() else 1)
