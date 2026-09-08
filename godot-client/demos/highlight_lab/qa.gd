extends Node
var failures: Array[String] = []
var checks := 0
var output := "res://demos/highlight_lab/qa"
var demo: Node3D
var highlights: PainterlyHighlights
var last_off: Image
var last_on: Image

func check(ok: bool, message: String) -> void:
	checks += 1
	if not ok: failures.append(message); push_error(message)

func frame(name_: String = "") -> Image:
	for i in 4: await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	if name_ != "": image.save_png(output+"/"+name_+".png")
	return image

func difference(a: Image, b: Image) -> Dictionary:
	var aa: Image = a.duplicate(); var bb: Image = b.duplicate()
	aa.resize(320,180); bb.resize(320,180)
	var total := 0.0; var count := 0; var peak := 0.0
	for y in aa.get_height():
		for x in aa.get_width():
			var ca := aa.get_pixel(x,y); var cb := bb.get_pixel(x,y)
			var d := maxf(absf(ca.r-cb.r),maxf(absf(ca.g-cb.g),absf(ca.b-cb.b)))
			total += d; peak = maxf(peak,d)
			if d > 0.01: count += 1
	return {"mean":total/(320*180),"pixels":count,"peak":peak}

func pair(name_: String = "") -> Dictionary:
	highlights.settings.enabled = false; highlights.refresh()
	last_off = await frame(name_+"-off" if name_ != "" else "")
	highlights.settings.enabled = true; highlights.refresh()
	last_on = await frame(name_+"-on" if name_ != "" else "")
	return difference(last_off,last_on)

func timing(enabled_: bool) -> Dictionary:
	highlights.settings.enabled = enabled_; highlights.refresh()
	for i in 20: await RenderingServer.frame_post_draw
	var times := []; var previous := Time.get_ticks_usec()
	for i in 120:
		await RenderingServer.frame_post_draw
		var now := Time.get_ticks_usec(); times.append((now-previous)/1000.0); previous = now
	times.sort()
	return {"median_ms":times[60],"p95_ms":times[114],"draw_calls":Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)}

func run(scene: Node3D) -> void:
	demo = scene; highlights = scene.highlights; demo.hud.hide()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
	await frame()
	check(RenderingServer.get_current_rendering_method()=="forward_plus", "Actual Forward+ rendering")
	check(highlights.brushes != null and highlights.brushes.get_layers()==12,"All twelve generated brush layers loaded")
	var metrics := {}
	var packed_margins := true
	for layer in 12:
		var packed := highlights.brushes.get_layer_data(layer)
		for x in packed.get_width():
			packed_margins = packed_margins and packed.get_pixel(x,0).a==0 and packed.get_pixel(x,packed.get_height()-1).a==0
		for y in packed.get_height():
			packed_margins = packed_margins and packed.get_pixel(0,y).a==0 and packed.get_pixel(packed.get_width()-1,y).a==0
	check(packed_margins,"All array pages have fully transparent padding without cropping source images")
	var map: Image = highlights.records[3].direction_map.get_image()
	var horizontal := 0; var vertical := 0
	for y in range(0,256,4):
		for x in range(0,256,4):
			var color := map.get_pixel(x,y)
			if color.r>0.9: horizontal+=1
			if color.g>0.9: vertical+=1
	check(horizontal>0 and vertical>0,"Merged joinery direction map includes horizontal and vertical domains")
	metrics.day = await pair("01-day")
	check(metrics.day.pixels>100,"Direct light produces visible oil strokes")
	var hole: Vector2i = Vector2i(demo.camera.unproject_position(Vector3(0.4,-2.15,0.04)))
	var hole_error := 0.0
	for y in range(-3,4):
		for x in range(-3,4):
			var q := hole+Vector2i(x,y)
			var a := last_off.get_pixelv(q); var b := last_on.get_pixelv(q)
			hole_error=maxf(hole_error,absf(a.r-b.r)+absf(a.g-b.g)+absf(a.b-b.b))
	check(hole_error<0.005,"Alpha-cutout holes receive no added paint")
	var original_seed: int = highlights.settings.seed
	var registrations: int = highlights.registration_count
	var mesh_ids := []
	for record in highlights.records: mesh_ids.append(record.mesh.mesh.get_rid().get_id())
	var baseline := last_on
	# Sample the same world-space point before and after an orbit. Restrict to the
	# planar metal face so changes to the native glass/specular base are irrelevant.
	var best := 0.0; var pixel := Vector2i(650,300)
	for y in range(220, 480):
		for x in range(600, 775):
			var a := last_off.get_pixel(x,y); var b := last_on.get_pixel(x,y)
			var delta := b.r-a.r
			if delta>best: best=delta;pixel=Vector2i(x,y)
	var screen := Vector2(pixel)+Vector2(0.5,0.5)
	var origin: Vector3 = demo.camera.project_ray_origin(screen)
	var direction: Vector3 = demo.camera.project_ray_normal(screen)
	var point: Vector3 = origin + direction*((0.075-origin.z)/direction.z)
	demo.camera.position = Vector3(0.6,0.3,10); demo.camera.look_at(Vector3.ZERO)
	await pair("02-orbit")
	var projected: Vector2 = demo.camera.unproject_position(point)
	var projected_pixel := Vector2i(projected.round())
	var recovered := 0.0
	for y in range(-1,2):
		for x in range(-1,2):
			var q := projected_pixel+Vector2i(x,y)
			recovered=maxf(recovered,last_on.get_pixelv(q).r-last_off.get_pixelv(q).r)
	check(best>0.03 and absf(best-recovered)<0.08,"Orbit preserves highlight response at the same surface point")
	demo.camera.position = Vector3(0,0,10); demo.camera.rotation = Vector3.ZERO
	await pair()

	check(difference(last_on,await frame()).mean<0.0001,"Static lighting has no random flicker")
	for group in ["glass","metal","frame"]:
		for key in ["glass","metal","frame"]: highlights.settings.set(key+"_enabled",key==group)
		highlights.refresh(); metrics[group] = await pair("02-"+group)
		check(metrics[group].pixels>10,group+" contributes independently")
	# Frame incidence gate: 0, 20, 40 degrees.
	demo.sun.rotation_degrees.y = 20; metrics.frame20 = await pair()
	demo.sun.rotation_degrees.y = 40; metrics.frame40 = await pair("03-frame-oblique")
	check(metrics.frame20.mean>metrics.frame40.mean*2.0 and metrics.frame20.pixels>2,"Frames fade when incidence leaves the near-direct interval")
	check(metrics.frame40.peak<0.02,"Oblique frame faces do not glow")
	for key in ["glass","metal","frame"]: highlights.settings.set(key+"_enabled",true)
	demo.sun.rotation = Vector3.ZERO
	highlights.settings.density = 0; highlights.refresh(); metrics.zero_density = await pair()
	check(metrics.zero_density.peak<0.005,"Density zero creates no strokes")
	highlights.settings.density = 0.65
	demo.sun.light_energy = 0; metrics.unlit = await pair("04-no-light")
	check(metrics.unlit.peak<0.005,"No light means no additional radiance despite ambient")
	demo.sun.light_energy = 1.5; demo.sun.rotation_degrees.y = 180; metrics.backlit = await pair("05-backlit")
	check(metrics.backlit.mean<metrics.day.mean*0.15,"Back-facing visible surfaces receive no front highlight")
	demo.sun.rotation = Vector3.ZERO; demo.blocker.show(); metrics.shadow = await pair("06-shadow")
	check(metrics.shadow.mean<metrics.day.mean*0.1,"Native directional shadow suppresses highlights")
	demo.blocker.hide(); demo.sun.light_energy = 0; demo.lamp.light_energy = 4; demo.lamp.light_color = Color("ff9d50")
	metrics.lamp = await pair("07-warm-lamp"); check(metrics.lamp.pixels>20,"Local coloured light drives highlights")
	demo.blocker.show(); metrics.lamp_shadow = await pair(); check(metrics.lamp_shadow.mean<metrics.lamp.mean*0.2,"Local light shadows suppress highlights")
	demo.blocker.hide(); demo.lamp.light_energy = 0; demo.sun.light_energy = 1.5
	highlights.settings.seed = original_seed; highlights.refresh()
	check(difference(baseline,await frame()).mean<0.001,"Restoring light and seed restores the original image")
	highlights.repaint(); check(difference(baseline,await frame("08-repaint")).pixels>50,"Repaint produces a new stable layout")
	highlights.settings.seed = original_seed; highlights.refresh()
	check(highlights.registration_count==registrations,"Light and seed changes never register or rebuild geometry")
	var after_ids := []
	for record in highlights.records: after_ids.append(record.mesh.mesh.get_rid().get_id())
	check(mesh_ids==after_ids,"Original mesh resources are retained")
	metrics.timing = []
	for round_ in 2: metrics.timing.append({"off":await timing(false),"on":await timing(true)})
	# Save an actual rendered sequence, ready for encoding without screen recording.
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output+"/motion"))
	for i in 60:
		await get_tree().process_frame
		demo.sun.rotation_degrees.y = -55.0+110.0*i/59.0
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(output+"/motion/%03d.png" % i)
		if i % 20 == 0: print("HIGHLIGHT_MOTION ",i)
	var report := {"passed":failures.is_empty(),"checks":checks,"failures":failures,"engine":Engine.get_version_info().string,"renderer":RenderingServer.get_current_rendering_method(),"metrics":metrics,"stats":highlights.get_stats()}
	FileAccess.open(output+"/validation.json",FileAccess.WRITE).store_string(JSON.stringify(report,"  "))
	print("HIGHLIGHT_QA ",JSON.stringify(report))
	get_tree().quit(0 if failures.is_empty() else 1)
