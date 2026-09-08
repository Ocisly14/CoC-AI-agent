extends Node

var failures: Array[String] = []
const OUT := "/private/tmp/bluebird-interior-qa"

func check(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)
		push_error(message)

func capture(filename: String) -> void:
	if DisplayServer.get_name() == "headless":
		return
	for frame in 3:
		await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(OUT.path_join(filename))

func run(demo: Node3D) -> void:
	DirAccess.make_dir_recursive_absolute(OUT)
	await get_tree().physics_frame
	await get_tree().process_frame
	var scenes = demo.location_scenes
	var original_target: Vector3 = demo.target
	var original_size: float = demo.view_size
	var click := InputEventMouseButton.new()
	click.pressed = true
	click.button_index = MOUSE_BUTTON_LEFT
	click.position = demo.camera.unproject_position(Vector3(0, 1.7, 4.98))
	check(demo.building_at(click.position), "Camera ray hits the building")
	demo._unhandled_input(click)
	check(scenes.menu_open and not demo.info.visible, "Building opens location strokes instead of note")
	await get_tree().create_timer(0.8).timeout
	check(scenes.strokes.size() == 3, "Module has three location choices")
	await capture("01-strokes.png")
	scenes.strokes[0].pressed.emit()
	await get_tree().create_timer(0.7).timeout
	check(scenes.interior_open and scenes.painting.visible, "Dining opens its independent room painting")
	var dining_texture: Texture2D = scenes.painting.texture
	check(dining_texture.resource_path.ends_with("bluebird-dining-painted-background.png"), "Dining selects its composition with the matching paint background ratio")
	await capture("02-dining.png")
	var wheel := InputEventMouseButton.new()
	wheel.pressed = true
	wheel.button_index = MOUSE_BUTTON_WHEEL_UP
	demo._unhandled_input(wheel)
	check(is_equal_approx(demo.view_size, original_size), "Interior input cannot zoom street camera")
	scenes.scene_tabs.get_child(1).pressed.emit()
	await get_tree().create_timer(0.7).timeout
	check(scenes.selected_index == 1 and scenes.heading.text.contains("后厨"), "Kitchen tab selects correct module location")
	check(scenes.painting.texture != dining_texture and scenes.painting.texture.resource_path.ends_with("bluebird-kitchen-painted-background.png"), "Kitchen uses the approved composition with the 110 percent paint background")
	await capture("03-kitchen.png")
	scenes.scene_tabs.get_child(2).pressed.emit()
	check(not scenes.painting.visible and scenes.description.text.contains("食谱"), "Upstairs shows its own module note, not the ground-floor image")
	await get_tree().create_timer(0.7).timeout
	await capture("04-upstairs-note.png")
	var escape := InputEventKey.new()
	escape.pressed = true
	escape.keycode = KEY_ESCAPE
	scenes._input(escape)
	check(not scenes.interior_open and scenes.menu_open, "Escape returns to building selection")
	check(demo.target == original_target and is_equal_approx(demo.view_size, original_size), "Return preserves street camera")
	scenes._input(escape)
	check(not scenes.menu_open, "Second Escape closes location strokes")
	# Interrupt animation rapidly and verify no delayed callback reopens it.
	scenes.set_menu_open(true)
	scenes.set_menu_open(false)
	scenes.open_location(0)
	scenes.close_interior()
	scenes.set_menu_open(false)
	await get_tree().create_timer(0.8).timeout
	check(not scenes.overlay.visible and not scenes.menu.visible, "Rapid navigation has no stale animation visibility")
	var report := {"passed": failures.is_empty(), "failures": failures, "renderer": RenderingServer.get_current_rendering_method()}
	var file := FileAccess.open(OUT.path_join("validation.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify(report, "\t"))
	print("BLUEBIRD_INTERIOR_QA ", JSON.stringify(report))
	get_tree().quit(0 if failures.is_empty() else 1)
