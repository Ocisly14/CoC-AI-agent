extends SceneTree
const OUT = "res://demos/bluebird/qa/lamp-controls"
var scene
var panel
var failures: Array[String] = []
var checks := 0

func _initialize() -> void:
	run.call_deferred()

func check(ok: bool, message: String) -> void:
	checks += 1
	if not ok: failures.append(message); push_error(message)

func frame(name_: String = "") -> Image:
	while scene.painterly.renderer.is_capture_pending(): await process_frame
	for i in 5: await RenderingServer.frame_post_draw
	var result = root.get_texture().get_image()
	if name_ != "": result.save_png(OUT.path_join(name_ + ".png"))
	return result

func sample(image: Image) -> float:
	var p = Vector2i(scene.camera.unproject_position(Vector3(-11.5, .18, 8.15)))
	var value := 0.0
	for y in range(-2, 3):
		for x in range(-2, 3):
			var c = image.get_pixelv(p + Vector2i(x, y))
			value += c.r * .2126 + c.g * .7152 + c.b * .0722
	return value / 25.0

func run() -> void:
	if DisplayServer.get_name() == "headless": quit(1); return
	DirAccess.make_dir_recursive_absolute(OUT)
	scene = load("res://demos/bluebird/street_corner.tscn").instantiate()
	root.add_child(scene); current_scene = scene
	panel = scene.art_debugger
	var lights = scene.get_node("StreetLights")
	scene.target = Vector3(1, 1.7, 6); scene.view_size = 36; scene._update_camera()
	scene.set_info_visible(false)
	scene.set_time_of_day(22)
	panel.sync_widgets()
	panel.tabs.current_tab = panel.lamp_tab_index; panel.show()
	await frame("01-lamp-controls")
	var saved = panel.snapshot().duplicate(true)
	check(panel.valid_state(saved), "New preset with lamps validates")
	panel.widgets.lamp_temperature[1].value = 8500
	panel.widgets.lamp_energy[0].value = 22
	panel.widgets.lamp_attenuation[1].value = 4
	panel.widgets.lamp_range[0].value = 10
	for lamp in lights.get_children():
		var light: OmniLight3D = lamp.get_node("LampLight")
		check(light.light_color.b > light.light_color.r and lamp.bulb_material.emission == light.light_color, "Cool temperature reaches light and bulb")
		check(light.light_energy == 22 and light.omni_attenuation == 4 and light.omni_range == 10, "Physical widgets update each lamp")
	check(scene.cycle_enabled and scene.time_of_day == 22, "Lamp edits preserve celestial clock")
	scene.set_time_of_day(12); scene.set_time_of_day(22)
	check(lights.get_child(0).get_node("LampLight").light_energy == 22, "Brightness survives day/night switching")
	panel.set_baseline()
	panel.widgets.lamp_art_strength[0].value = 6
	panel.toggle_compare(); check(lights.settings.lamp_art_strength == saved.lamps.lamp_art_strength, "A restores lamp art")
	panel.toggle_compare(); check(lights.settings.lamp_art_strength == 6, "B restores lamp art")
	var path = "/private/tmp/bluebird-lamp-controls-preset.json"
	check(panel.save_preset(path) == OK, "V4 preset saves")
	panel.change("lamp_energy", 1.0)
	check(panel.load_preset(path) == OK and lights.settings.lamp_energy == 22, "V4 restores physical and art values")
	var legacy = saved.duplicate(true); legacy.erase("lamps")
	var file = FileAccess.open(path, FileAccess.WRITE); file.store_string(JSON.stringify({"version": 3, "state": legacy})); file.close()
	check(panel.load_preset(path) == OK and lights.settings.lamp_energy == 22, "V3 migrates without resetting current lamps")
	var bad = panel.snapshot().duplicate(true); bad.lamps.lamp_energy = -5
	file = FileAccess.open(path, FileAccess.WRITE); file.store_string(JSON.stringify({"version": 4, "state": bad})); file.close()
	check(panel.load_preset(path) == ERR_INVALID_DATA and lights.settings.lamp_energy == 22, "Invalid lamp preset rejected without mutation")
	panel.apply_state(saved); panel.hide()
	var enhanced = await frame("02-enhanced-night")
	var captures = scene.painterly.renderer.capture_count
	panel.change("lamp_art_enabled", false)
	var plain = await frame("03-plain-night")
	panel.change("lamp_energy", 0.0)
	var dark = await frame("04-zero-energy")
	var enhancement = (sample(enhanced) - sample(dark)) / maxf(sample(plain) - sample(dark), .001)
	check(enhancement > 1.15, "Default art bonus visibly increases received light")
	check(scene.painterly.renderer.capture_count == captures, "Lamp controls do not rebuild solar shadow maps")
	panel.apply_state(saved)
	panel.change("lamp_energy", 0.0)
	var zero_art = await frame()
	check(zero_art.get_data() == dark.get_data(), "Art enhancement adds no light when source energy is zero")
	panel.apply_state(saved); scene.set_time_of_day(12)
	var day_on = await frame()
	panel.change("lamp_art_enabled", false)
	var day_off = await frame()
	check(day_on.get_data() == day_off.get_data(), "Lamp art leaves daylight unchanged when lamps are off")
	await check_gpu_selection()
	panel.apply_state(saved); panel.show(); panel.sync_widgets()
	var scroll: ScrollContainer = panel.tabs.get_child(panel.lamp_tab_index)
	scroll.scroll_vertical = 360
	await frame("05-art-controls")
	var report = {"passed": failures.is_empty(), "checks": checks, "failures": failures, "near_light_art_ratio": enhancement,
		"engine": Engine.get_version_info().string, "renderer": RenderingServer.get_current_rendering_method()}
	file = FileAccess.open(OUT.path_join("validation.json"), FileAccess.WRITE); file.store_string(JSON.stringify(report, "\t") + "\n")
	print("LAMP_CONTROLS_QA ", JSON.stringify(report)); quit(0 if failures.is_empty() else 1)

func check_gpu_selection() -> void:
	# Isolate importance and hue with equal direct radiance, removing albedo brightness as a confounder.
	var viewport = SubViewport.new(); viewport.size = Vector2i(64, 16)
	viewport.use_hdr_2d = true; viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS; root.add_child(viewport)
	var rect = ColorRect.new(); rect.size = Vector2(64, 16); viewport.add_child(rect)
	var shader = Shader.new()
	shader.code = 'shader_type canvas_item;\nuniform bool enabled=true;\nuniform float material_chroma_knee=.035;\nuniform float sun_chroma_knee=.04;\n#include "res://rendering/painterly/shaders/color.gdshaderinc"\n#include "res://rendering/painterly/shaders/color_selection.gdshaderinc"\n#include "res://demos/bluebird/lamp_color.gdshaderinc"\nvoid fragment(){lamp_importance=UV.x<.5?0.0:1.0;lamp_albedo=UV.x<.5?vec3(.7,.2,.03):vec3(.03,.12,.7);COLOR=vec4(style_lamp_light(vec3(.08),vec3(1,.3,.08),.3),1);}'
	var mat = ShaderMaterial.new(); mat.shader = shader; rect.material = mat
	mat.set_shader_parameter("lamp_hue_boost", 0.0)
	for i in 4: await RenderingServer.frame_post_draw
	var img = viewport.get_texture().get_image()
	check(img.get_pixel(48, 8).r > img.get_pixel(16, 8).r * 1.3, "High importance gets stronger bonus on GPU")
	mat.set_shader_parameter("lamp_importance_boost", 0.0); mat.set_shader_parameter("lamp_hue_boost", 1.5)
	for i in 4: await RenderingServer.frame_post_draw
	img = viewport.get_texture().get_image()
	check(img.get_pixel(16, 8).r > img.get_pixel(48, 8).r * 1.3, "Matching lamp hue gets stronger bonus on GPU")
	viewport.queue_free()
