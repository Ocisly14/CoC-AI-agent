extends Node
## Explicit opt-in integration check; also captures the actual rendered viewport.

var failures: Array[String] = []
var output_dir := "res://demos/bluebird/qa"

func check(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)
		push_error(message)

func capture(filename: String) -> void:
	if DisplayServer.get_name() == "headless":
		return
	var demo = get_parent()
	if demo.painterly != null:
		while demo.painterly.renderer.is_capture_pending(): await get_tree().process_frame
	for i in 3: await RenderingServer.frame_post_draw
	var picture := get_viewport().get_texture().get_image()
	check(not picture.is_empty(), "Rendered image must not be empty")
	check(picture.save_png(output_dir.path_join(filename)) == OK, "Screenshot saves")

func run(demo: Node3D) -> void:
	await get_tree().process_frame
	await get_tree().physics_frame
	await get_tree().process_frame
	var meshes := demo.get_node("Bluebird/Architecture").find_children("*", "MeshInstance3D", true, false)
	check(meshes.size() == 75, "All 75 v11 architectural meshes import")
	var surfaces := 0
	var checked_textures: Dictionary = {}
	for mesh in meshes:
		for surface in mesh.mesh.get_surface_count():
			surfaces += 1
			var material: Material = mesh.get_active_material(surface)
			check(material != null, "Imported surface has its material")
			if material is BaseMaterial3D and material.albedo_texture != null:
				var texture: Texture2D = material.albedo_texture
				check(material.texture_filter == BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC, "Building uses mipmap filtering")
				if not checked_textures.has(texture.get_instance_id()):
					check(texture.get_image().has_mipmaps(), "Embedded building texture has mipmaps")
					checked_textures[texture.get_instance_id()] = true
	check(surfaces == 167, "Multi-material geometry and four painted sign planes import")
	check(checked_textures.size() == 10, "Six new atlases, complete kitchen floor and three painted signs are shared")
	check(demo.camera.projection == Camera3D.PROJECTION_ORTHOGONAL, "Orthographic overview")
	check(demo.sun.light_energy > demo.environment.ambient_light_energy, "Sunny direct light dominates ambient fill")
	check(not demo.environment.adjustment_enabled and demo.environment.adjustment_saturation == 1.0, "Global desaturation disabled")
	await capture("01-afternoon.png")
	var point: Vector2 = demo.camera.unproject_position(Vector3(0, 1.7, 4.98))
	check(demo.building_at(point), "Building can be picked through the camera ray")
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = point
	demo._unhandled_input(click)
	check(demo.location_scenes.menu_open, "Click opens painted location strokes")
	demo.location_scenes.set_menu_open(false)
	demo.set_info_visible(true)
	await capture("02-location-note.png")
	demo.get_node("HUD/Info/Margin/Column/Close").pressed.emit()
	check(not demo.info.visible, "Close button hides location note")
	var wheel := InputEventMouseButton.new()
	wheel.button_index = MOUSE_BUTTON_WHEEL_UP
	wheel.pressed = true
	for i in 80:
		demo._unhandled_input(wheel)
	check(is_equal_approx(demo.view_size, 12), "Zoom clamps at its near bound")
	wheel.button_index = MOUSE_BUTTON_WHEEL_DOWN
	for i in 80:
		demo._unhandled_input(wheel)
	check(is_equal_approx(demo.view_size, 38), "Zoom clamps at its far bound")
	var drag := InputEventMouseMotion.new()
	drag.button_mask = MOUSE_BUTTON_MASK_RIGHT
	drag.relative = Vector2(110, 40)
	demo._unhandled_input(drag)
	check(is_equal_approx(demo.yaw, demo.HOME_YAW) and is_equal_approx(demo.pitch, demo.HOME_PITCH), "Right drag preserves fixed camera angle")
	drag.button_mask = MOUSE_BUTTON_MASK_MIDDLE
	drag.relative = Vector2(50, 25)
	demo._unhandled_input(drag)
	check(not demo.target.is_equal_approx(demo.HOME_TARGET), "Middle drag pans")
	demo.get_node("HUD/Controls/Margin/Row/Reset").pressed.emit()
	check(demo.target.is_equal_approx(demo.HOME_TARGET), "Reset restores target")
	check(is_equal_approx(demo.view_size, demo.HOME_SIZE), "Reset restores zoom")
	demo.evening_button.pressed.emit()
	check(demo.evening and demo.evening_button.button_pressed and not demo.day_button.button_pressed, "Evening button updates light and selection")
	await capture("03-evening.png")
	demo.day_button.pressed.emit()
	demo.view_size = 14.0
	demo._update_camera()
	await capture("04-material-closeup.png")
	demo.reset_view()
	var report := {
		"passed": failures.is_empty(), "failures": failures,
		"engine": Engine.get_version_info().string, "display": DisplayServer.get_name(),
		"renderer": RenderingServer.get_current_rendering_method(),
		"architecture_meshes": meshes.size(), "material_surfaces": surfaces,
		"textures_with_mipmaps": checked_textures.size(),
		"scope": "Asset import, material presence, picking, camera controls, UI signals, lighting and actual viewport captures. No live simulation or performance benchmark."
	}
	var file := FileAccess.open(output_dir.path_join("validation.json"), FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(report, "\t") + "\n")
	print("BLUEBIRD_QA ", JSON.stringify(report))
	get_tree().quit(0 if failures.is_empty() else 1)
