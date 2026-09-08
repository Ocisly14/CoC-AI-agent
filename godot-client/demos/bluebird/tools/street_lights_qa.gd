extends SceneTree
const OUT = "res://demos/bluebird/qa/street-lights"
var failures: Array[String] = []
var checks := 0
var scene

func _initialize() -> void:
	run.call_deferred()

func check(ok: bool, message: String) -> void:
	checks += 1
	if not ok: failures.append(message); push_error(message)

func frame(name_: String) -> Image:
	if scene.painterly != null:
		while scene.painterly.renderer.is_capture_pending(): await process_frame
	for i in 5: await RenderingServer.frame_post_draw
	var image = root.get_texture().get_image()
	check(image.save_png(OUT.path_join(name_+".png")) == OK, "Save " + name_)
	return image

func light_at(image: Image, world: Vector3) -> float:
	var p: Vector2i = Vector2i(scene.camera.unproject_position(world))
	var sum := 0.0
	for y in range(-2,3):
		for x in range(-2,3):
			var q = p + Vector2i(x,y)
			if q.x < 0 or q.y < 0 or q.x >= image.get_width() or q.y >= image.get_height(): continue
			var c = image.get_pixelv(q)
			sum += c.r*.2126+c.g*.7152+c.b*.0722
	return sum/25.0

func run() -> void:
	if DisplayServer.get_name() == "headless": quit(1); return
	DirAccess.make_dir_recursive_absolute(OUT)
	scene = load("res://demos/bluebird/street_corner.tscn").instantiate()
	root.add_child(scene); current_scene = scene
	var lamps = scene.get_node("StreetLights").get_children()
	check(lamps.size()==4,"Four street lamps placed")
	for lamp in lamps:
		check(is_equal_approx(lamp.position.y,.18),"Lamp base rests on sidewalk")
		check(lamp.get_node("LampLight").shadow_enabled,"Each local light uses native occlusion")
		check(lamp.get_node("LampLight").light_energy==0,"Day lamps start off")
		check(lamp.painted_texture==lamps[0].painted_texture,"Instances share a single mipmapped colour texture")
	scene.target=Vector3(1,1.7,6)
	scene.view_size=36
	scene._update_camera()
	var day=await frame("01-day")
	# Same scene, same lighting: bridge must not count the sun/ambient a second time.
	var swaps: Array = []
	if scene.painterly != null:
		for record in scene.painterly.records:
			var material = record.material
			for key in scene.painterly._local_light_shaders:
				if material.shader == scene.painterly._local_light_shaders[key]:
					swaps.append([material,material.shader])
					material.shader=instance_from_id(key)
	var baseline=await frame("02-day-original-shader")
	var error:=0.0
	for y in day.get_height():
		for x in day.get_width():
			var a=day.get_pixel(x,y);var b=baseline.get_pixel(x,y)
			error+=absf(a.r-b.r)+absf(a.g-b.g)+absf(a.b-b.b)
	error/=float(day.get_width()*day.get_height()*3)
	check(error<.003,"Local bridge preserves daytime solar/ambient rendering")
	for entry in swaps: entry[0].shader=entry[1]
	scene.set_time_of_day(22)
	for lamp in lamps: check(lamp.night and lamp.bulb_material.emission_enabled,"Clock turns on actual lamp and bulb")
	var night=await frame("03-night")
	scene.get_node("StreetLights").set_night(false)
	var dark=await frame("04-night-lamps-off")
	var gains: Array = []
	for lamp in lamps:
		var world: Vector3=lamp.position+Vector3(1.5,0,2.0 if lamp.position.z<10 else -2.0)
		var gain=light_at(night,world)-light_at(dark,world)
		gains.append(gain)
		check(gain>.012,"Lamp lights the authored street surface nearby")
	# A temporary shadow-only occluder verifies actual point-light shadow sampling.
	lamps[0].set_night(true)
	var probe: Vector3=lamps[0].position+Vector3(1.5,0,2.0)
	var isolated=await frame("06-isolated-light")
	var blocker:=MeshInstance3D.new()
	var block_mesh:=BoxMesh.new()
	# Architectural-size occluder retains an interior under the enlarged penumbra.
	block_mesh.size=Vector3(3.2,2.0,3.2)
	blocker.mesh=block_mesh
	blocker.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY
	scene.add_child(blocker)
	blocker.global_position=(lamps[0].get_node("LampLight").global_position+probe)*.5
	var occluded=await frame("07-shadow-probe")
	var shadow_drop=light_at(isolated,probe)-light_at(occluded,probe)
	check(shadow_drop>.007,"Actual geometry occludes the street lamp on the painted road")
	blocker.free()
	scene.set_time_of_day(12)
	check(not scene.get_node("StreetLights").night,"Noon turns street lights off")
	scene.set_evening(true)
	check(scene.get_node("StreetLights").night,"Evening preset turns lights on")
	await frame("05-evening")
	scene.set_evening(false)
	check(not scene.get_node("StreetLights").night,"Day preset turns lights off")
	var point=scene.camera.unproject_position(Vector3(0,1.7,4.98))
	await physics_frame
	check(scene.building_at(point),"Restaurant picking still works")
	var report={"passed":failures.is_empty(),"failures":failures,"checks":checks,"lamps":lamps.size(),"day_mean_absolute_error":error,"night_ground_luminance_gains":gains,"occluder_luminance_drop":shadow_drop,"engine":Engine.get_version_info().string,"renderer":RenderingServer.get_current_rendering_method(),"scope":"Actual day/night rendering, no double solar/ambient, physical surface illumination from each lamp, mip sharing, actual shadow-occluder probe, time/preset switching and restaurant picking. No performance benchmark."}
	var file=FileAccess.open(OUT.path_join("validation.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"\t")+"\n")
	print("STREET_LIGHTS_QA ",JSON.stringify(report))
	quit(0 if failures.is_empty() else 1)
