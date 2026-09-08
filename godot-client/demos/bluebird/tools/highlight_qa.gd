extends "res://demos/highlight_lab/qa.gd"

func frame(name_: String = "") -> Image:
	while demo.painterly.renderer.is_capture_pending(): await get_tree().process_frame
	return await super.frame(name_)

func run(scene: Node3D) -> void:
	demo = scene; highlights = demo.painterly.highlights
	output = "res://demos/bluebird/qa/highlights"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
	demo.get_node("HUD").hide()
	demo.reset_view(); demo.set_time_of_day(10.0)
	await frame()
	var stats := highlights.get_stats()
	for group in ["glass","metal","frame"]: check(stats.groups[group]>0, "Bluebird registers "+group)
	check(stats.generated_meshes==0 and stats.gpu_readbacks==0,"Highlight system creates no geometry or capture")
	var mesh_ids := []
	for record in highlights.records: mesh_ids.append(record.mesh.mesh.get_rid().get_id())
	var metrics := {}
	metrics.day = await pair("01-day")
	check(metrics.day.pixels>10,"Daytime Bluebird has visible highlights")
	var before_seed: int = highlights.settings.seed
	demo.set_time_of_day(20.0); metrics.night = await pair("02-night")
	check(metrics.night.pixels>0,"Nighttime scene lamps contribute highlights")
	demo.set_time_of_day(10.0)
	demo.target = Vector3(-2,2.5,4); demo.view_size = 11; demo._update_camera()
	metrics.detail = await pair("03-detail")
	highlights.settings.debug_view = 1; highlights.refresh(); await frame("04-coverage")
	highlights.settings.debug_view = 2; highlights.refresh(); await frame("05-received-light")
	highlights.settings.debug_view = 0; highlights.refresh()
	demo.yaw += 15; demo._update_camera(); await frame("06-camera-rotation")
	check(highlights.settings.seed==before_seed,"Panning, zoom, orbit and time retain layout seed")
	var after_ids := []
	for record in highlights.records: after_ids.append(record.mesh.mesh.get_rid().get_id())
	check(mesh_ids==after_ids,"Camera and light changes retain existing geometry")
	# Original imported materials remain intact; only native material instances soften.
	var glass_count := 0
	for record in highlights.records:
		if record.group=="glass" and record.base is BaseMaterial3D:
			glass_count += 1
			check(record.instance.albedo_color.a==record.base.albedo_color.a,"Glass alpha preserved")
			check(record.instance.roughness>=0.4,"Instance glass highlight softened")
	check(glass_count>0,"Transparent native glass is tested")
	var snapshot: Dictionary = demo.art_debugger.snapshot()
	var legacy: Dictionary = snapshot.duplicate(true); legacy.renderer.seam_enabled = true; legacy.renderer.silhouette_enabled = true
	check(demo.art_debugger.valid_state(legacy),"Legacy ribbon fields are accepted and ignored")
	demo.art_debugger.apply_state(legacy)
	check(highlights.settings.snapshot()==snapshot.highlights,"Old fields do not change highlight semantics")
	demo.set_highlights(false); check(not highlights.settings.enabled,"B control disables highlight passes")
	demo.set_highlights(true)
	demo.reset_view(); demo.set_time_of_day(10.0)
	metrics.timing = []
	for round_ in 2: metrics.timing.append({"off":await timing(false),"on":await timing(true)})
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output+"/motion"))
	for i in 48:
		await get_tree().process_frame
		demo.set_time_of_day(7.0+14.0*i/47.0)
		await frame("motion/%03d" % i)
	var report := {"passed":failures.is_empty(),"checks":checks,"failures":failures,"engine":Engine.get_version_info().string,"renderer":RenderingServer.get_current_rendering_method(),"metrics":metrics,"stats":highlights.get_stats()}
	FileAccess.open(output+"/validation.json",FileAccess.WRITE).store_string(JSON.stringify(report,"  "))
	print("BLUEBIRD_HIGHLIGHT_QA ",JSON.stringify(report))
	get_tree().quit(0 if failures.is_empty() else 1)
