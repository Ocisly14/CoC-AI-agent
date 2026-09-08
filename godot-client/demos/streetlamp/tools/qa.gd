extends SceneTree
const OUT = "res://demos/streetlamp/qa"
var failures: Array[String] = []
var checks := 0

func _initialize() -> void:
	run.call_deferred()

func check(ok: bool, message: String) -> void:
	checks += 1
	if not ok: failures.append(message); push_error(message)

func frame(name_: String) -> Image:
	for i in 5: await RenderingServer.frame_post_draw
	var image = root.get_texture().get_image()
	check(image.save_png(OUT.path_join(name_ + ".png")) == OK, "Save actual viewport " + name_)
	return image

func run() -> void:
	if DisplayServer.get_name() == "headless": quit(1); return
	DirAccess.make_dir_recursive_absolute(OUT)
	var scene = load("res://demos/streetlamp/preview.tscn").instantiate()
	root.add_child(scene); current_scene = scene
	var lamp = scene.get_node("Streetlamp")
	check(lamp.iron_material != null and lamp.bulb_material != null, "Imported iron and bulb materials identified")
	check(lamp.painted_texture.get_image().has_mipmaps(), "Embedded painted texture has mipmaps")
	check(lamp.BASE.get_image().has_mipmaps(), "Base texture has mipmaps")
	var counts := 0
	for mesh in lamp.get_node("Model").find_children("*", "MeshInstance3D", true, false): counts += 1
	check(counts == 13, "All thirteen lamp meshes present")
	lamp.set_painted(false)
	var base = await frame("01-base")
	lamp.set_painted(true)
	var painted = await frame("02-painted")
	var changed := 0
	for y in base.get_height():
		for x in base.get_width():
			if base.get_pixel(x,y) != painted.get_pixel(x,y): changed += 1
	check(changed > 30, "Oil overlay changes actual visible pixels")
	check(changed < base.get_width()*base.get_height()*.25, "Oil overlay leaves most of the image intact")
	scene.set_night(true)
	check(lamp.bulb_material.emission_enabled and lamp.get_node("LampLight").light_energy > 0, "Night enables bulb emission and actual omni light")
	await frame("03-night")
	scene.set_night(false)
	check(not lamp.bulb_material.emission_enabled and lamp.get_node("LampLight").light_energy == 0, "Day switches both light sources off")
	scene.get_node("Camera3D").position = Vector3(1.8,3.8,3)
	scene.get_node("Camera3D").look_at(Vector3(0,3.27,0))
	scene.get_node("Camera3D").size = 1.55
	await frame("04-lantern-detail")
	scene.free()
	var street = load("res://demos/bluebird/street_corner.tscn").instantiate()
	root.add_child(street); current_scene = street
	var contextual_lamp = load("res://demos/streetlamp/streetlamp.tscn").instantiate()
	street.add_child(contextual_lamp)
	contextual_lamp.position = Vector3(-8.0,.18,6.0)
	street.target = Vector3(-3,1.7,1)
	street.view_size = 26
	street._update_camera()
	if street.painterly != null:
		while street.painterly.renderer.is_capture_pending(): await process_frame
	await frame("05-bluebird-scale-study")
	var report = {"passed":failures.is_empty(),"failures":failures,"checks":checks,"meshes":counts,"changed_pixels":changed,"engine":Engine.get_version_info().string,"renderer":RenderingServer.get_current_rendering_method(),"scope":"Lamp GLB import, texture sampling, actual base/painted comparison, studio night bulb and light, contextual Bluebird scale study. Context placement is a preview, not a canonical world-map edit."}
	var file = FileAccess.open(OUT.path_join("validation.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"\t")+"\n")
	print("STREETLAMP_QA ",JSON.stringify(report))
	quit(0 if failures.is_empty() else 1)
