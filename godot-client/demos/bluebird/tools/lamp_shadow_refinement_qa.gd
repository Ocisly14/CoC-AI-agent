extends SceneTree
const OUT = "res://demos/bluebird/qa/lamp-shadow-refinement"
var scene
var failures: Array[String] = []
var checks := 0

func _initialize() -> void:
	run.call_deferred()

func check(ok: bool, message: String) -> void:
	checks += 1
	if not ok: failures.append(message); push_error(message)

func frame(name_: String) -> Image:
	while scene.painterly.renderer.is_capture_pending(): await process_frame
	for i in 5: await RenderingServer.frame_post_draw
	var image = root.get_texture().get_image()
	check(image.save_png(OUT.path_join(name_+".png")) == OK,"Save "+name_)
	return image

func difference(a: Image,b: Image) -> int:
	var count:=0
	for y in a.get_height():
		for x in a.get_width():
			if a.get_pixel(x,y)!=b.get_pixel(x,y): count+=1
	return count

func sample(image: Image,world: Vector3) -> float:
	var p: Vector2i=Vector2i(scene.camera.unproject_position(world))
	var sum:=0.0
	for y in range(-2,3):
		for x in range(-2,3):
			var c=image.get_pixelv(p+Vector2i(x,y))
			sum+=c.r*.2126+c.g*.7152+c.b*.0722
	return sum/25.0

func run() -> void:
	if DisplayServer.get_name()=="headless": quit(1); return
	DirAccess.make_dir_recursive_absolute(OUT)
	scene=load("res://demos/bluebird/street_corner.tscn").instantiate()
	root.add_child(scene);current_scene=scene
	var adapter=scene.painterly
	var renderer=adapter.renderer
	var lamps=scene.get_node("StreetLights").get_children()
	check(adapter.lamp_casters.size()==4,"All four cast-iron meshes enter physical depth capture")
	check(adapter.lamp_brush_volumes.size()==12,"Pedestal, column and lantern have separate brush masses")
	check(renderer._custom_brush_casters.size()<=32,"Shared brush caster budget is respected")
	check(renderer.pressure_stamps_enabled and renderer.procreate_shadows_enabled,"Same pressure brush pipeline as building")
	for mesh in adapter.lamp_casters:
		check(mesh.material_override==null,"Native lamp material remains intact")
	scene.target=Vector3(-13,1.1,6.8);scene.view_size=10;scene._update_camera()
	var painted=await frame("01-day-lamp-shadow")
	adapter.set_lamp_shadows(false)
	var missing=await frame("02-day-lamp-shadow-disabled")
	var changed=difference(painted,missing)
	check(changed>40,"Lamp casts visible painted shadow in actual viewport")
	adapter.set_lamp_shadows(true)
	renderer.debug_view=4;renderer.refresh_settings()
	var physical=await frame("03-physical-shadow")
	renderer.debug_view=5;renderer.refresh_settings()
	var brush=await frame("04-painted-shadow-mask")
	check(difference(physical,brush)>40,"Lamp shadow receives painted shape treatment")
	renderer.debug_view=0;renderer.refresh_settings()
	scene.target=Vector3(1,1.7,6);scene.view_size=36;scene._update_camera()
	await frame("05-day-wide")
	scene.set_time_of_day(22)
	await frame("06-night-refined")
	# Compare one isolated lamp under the same moon, camera and exposure.
	scene.get_node("StreetLights").set_night(false)
	var dark=await frame("07-night-no-local")
	var lamp=lamps[0]
	var light: OmniLight3D=lamp.get_node("LampLight")
	lamp.set_night(true)
	var refined=await frame("08-isolated-refined")
	var settings=[light.light_energy,light.omni_range,light.omni_attenuation,light.light_size,light.shadow_blur,light.shadow_opacity]
	light.light_energy=2.4;light.omni_range=9;light.omni_attenuation=1.5;light.light_size=.12;light.shadow_blur=1.0;light.shadow_opacity=1.0
	var old=await frame("09-isolated-previous")
	var near: Vector3=lamp.position+Vector3(1.5,0,2)
	var far: Vector3=lamp.position+Vector3(4.8,0,3.6)
	var new_near=sample(refined,near)-sample(dark,near)
	var old_near=sample(old,near)-sample(dark,near)
	var new_far=sample(refined,far)-sample(dark,far)
	var old_far=sample(old,far)-sample(dark,far)
	check(new_near>old_near*1.1,"Light is visibly brighter near the lamp")
	check(new_far/maxf(new_near,.001)<old_far/maxf(old_near,.001),"Light falls away faster relative to its brighter core")
	light.light_energy=settings[0];light.omni_range=settings[1];light.omni_attenuation=settings[2];light.light_size=settings[3];light.shadow_blur=settings[4];light.shadow_opacity=settings[5]
	check(light.light_size>.12 and light.shadow_blur>1 and light.shadow_opacity<1,"Wider penumbra and reduced shadow contrast are configured")
	scene.get_node("StreetLights").set_night(true)
	var report={"passed":failures.is_empty(),"failures":failures,"checks":checks,"lamp_shadow_changed_pixels":changed,"shared_brush_casters":renderer._custom_brush_casters.size(),"light_energy":settings[0],"range":settings[1],"attenuation":settings[2],"light_size":settings[3],"shadow_blur":settings[4],"shadow_opacity":settings[5],"near_gain_new":new_near,"near_gain_old":old_near,"far_gain_new":new_far,"far_gain_old":old_far,"engine":Engine.get_version_info().string,"renderer":RenderingServer.get_current_rendering_method()}
	var file=FileAccess.open(OUT.path_join("validation.json"),FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t")+"\n")
	print("LAMP_SHADOW_REFINEMENT ",JSON.stringify(report));quit(0 if failures.is_empty() else 1)
