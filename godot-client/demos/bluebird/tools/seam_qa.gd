extends Node
var checks:=0
var failures: Array[String]=[]
var output_dir:="res://demos/bluebird/qa/seams"
func check(ok: bool, label: String) -> void:
	checks+=1
	if not ok: failures.append(label);push_error(label)
func frame(demo: Node3D, filename: String="") -> Image:
	while demo.painterly.renderer.is_capture_pending(): await get_tree().process_frame
	for i in 4: await RenderingServer.frame_post_draw
	var image:=get_viewport().get_texture().get_image()
	if filename!="": check(image.save_png(output_dir.path_join(filename))==OK,"Save "+filename)
	return image
func pixels_changed(a: Image,b: Image) -> int:
	var count:=0
	for y in a.get_height():
		for x in a.get_width():
			if a.get_pixel(x,y)!=b.get_pixel(x,y): count+=1
	return count
func timing(demo: Node3D, enabled_: bool) -> Dictionary:
	demo.set_seam_paint(enabled_)
	for i in 6: await RenderingServer.frame_post_draw
	var wall: Array[float]=[];var gpu: Array[float]=[]
	var last:=Time.get_ticks_usec()
	for i in 40:
		await RenderingServer.frame_post_draw
		var now:=Time.get_ticks_usec();wall.append((now-last)/1000.0);last=now
		var g:=RenderingServer.viewport_get_measured_render_time_gpu(get_viewport().get_viewport_rid())
		if g>0.0: gpu.append(g)
	wall.sort();gpu.sort()
	return {"median_frame_interval_ms":wall[wall.size()/2],"median_gpu_ms":gpu[gpu.size()/2] if not gpu.is_empty() else null,"draw_calls":Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)}

func run(demo: Node3D) -> void:
	if DisplayServer.get_name()=="headless" or demo.painterly==null: get_tree().quit(1);return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_dir))
	await frame(demo)
	var renderer: PainterlyRenderer=demo.painterly.renderer
	var report:=renderer.rebuild_seam_paint()
	print("BLUEBIRD_SEAM_BUILD ",JSON.stringify(report))
	check(report.errors.is_empty(),"All automatically found seams compile")
	check(report.stamps>0,"Bluebird uses automatically discovered geometric seams")
	check(report.drips<=2,"At most two fixed drips across the whole scene")
	check(report.coverage_upper_bound<=0.15,"Sparse stroke support stays under 15 percent")
	var by_id: Dictionary={}
	for record in demo.painterly.records: by_id[record.inputs.paint_id]=record
	var geometry_valid:=true;var directions_valid:=true;var protected_valid:=true
	for stamp in renderer.seam_paint.stamps:
		var source: Dictionary=by_id[stamp.source_id]
		var receiver: Dictionary=by_id[stamp.receiver_id]
		directions_valid=directions_valid and source.inputs.paint_order>receiver.inputs.paint_order
		protected_valid=protected_valid and receiver.inputs.seam_protection<1.0 and receiver.inputs.alpha_cutoff==0
		geometry_valid=geometry_valid and stamp.center.is_finite() and stamp.reach<=0.25
	check(directions_valid,"Every stroke obeys the scene paint layers")
	check(protected_valid,"Protected lettering/interior surfaces never receive strokes")
	check(geometry_valid,"Stamp coordinates and reach are finite and bounded")
	var snapshot:=str(renderer.seam_paint.stamps)
	var build_count: int=renderer.seam_paint.build_count
	demo.get_node("HUD").hide()
	demo.set_seam_paint(false)
	var before:=await frame(demo,"01-before.png")
	demo.set_seam_paint(true)
	var after:=await frame(demo,"02-after.png")
	var difference:=pixels_changed(before,after)
	check(difference>10,"Visible rendered pixels change with seam paint")
	check(renderer.seam_paint.build_count==build_count,"B toggle does not rebuild seam geometry")
	renderer.debug_view=PainterlyRenderer.DebugView.SEAM_MASK;renderer.refresh_settings()
	var mask:=await frame(demo,"03-mask.png")
	var visible_paint:=Vector3.ZERO
	var found_visible:=false
	for stamp in renderer.seam_paint.stamps:
		var point: Vector3=renderer.seam_paint.anchor_transform(renderer)*(stamp.center+stamp.inward*stamp.reach*0.5)
		var pixel:=Vector2i(demo.camera.unproject_position(point))
		if pixel.x>=0 and pixel.x<mask.get_width() and pixel.y>=0 and pixel.y<mask.get_height() and mask.get_pixelv(pixel).r>0.6:
			visible_paint=point;found_visible=true;break
	renderer.debug_view=PainterlyRenderer.DebugView.SEAM_SOURCE;renderer.refresh_settings()
	await frame(demo,"04-source.png")
	renderer.debug_view=PainterlyRenderer.DebugView.BEAUTY;renderer.refresh_settings()
	demo.view_size=14.0;demo._update_camera()
	await frame(demo,"05-closeup.png")
	demo.set_seam_paint(false)
	await frame(demo,"06-closeup-before.png")
	demo.set_seam_paint(true);demo.reset_view();demo.set_evening(true)
	await frame(demo,"07-evening.png")
	check(str(renderer.seam_paint.stamps)==snapshot,"Sunset and zoom retain identical paint layout")
	var drips: Array=[]
	for stamp in renderer.seam_paint.stamps:
		if stamp.drip_length>0: drips.append({"id":stamp.id,"type":"long" if stamp.long_drip else "short","length_m":stamp.drip_length})
	demo.set_evening(false)
	for stamp in renderer.seam_paint.stamps:
		if stamp.drip_length>0 and not stamp.long_drip:
			demo.target=renderer.seam_paint.anchor_transform(renderer)*stamp.center+Vector3(0,-0.1,0)
			demo.view_size=3.0;demo._update_camera()
			await frame(demo,"09-drip-detail.png")
			demo.set_seam_paint(false)
			await frame(demo,"10-drip-detail-before.png")
			demo.set_seam_paint(true)
			break
	if found_visible:
		demo.target=visible_paint;demo.view_size=2.6;demo._update_camera()
		await frame(demo,"11-visible-paint-detail.png")
		demo.set_seam_paint(false)
		await frame(demo,"12-visible-paint-before.png")
		demo.set_seam_paint(true)
	demo.reset_view()
	demo.get_node("HUD").show()
	await frame(demo,"08-controls.png")
	var key:=InputEventKey.new();key.keycode=KEY_B;key.pressed=true
	demo._unhandled_input(key);check(not renderer.seam_enabled,"B keyboard toggle works")
	demo._unhandled_input(key);check(renderer.seam_enabled,"B restores seam rendering")
	RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(),true)
	var baseline_timing:=await timing(demo,false)
	var enabled_timing:=await timing(demo,true)
	check(enabled_timing.draw_calls==baseline_timing.draw_calls,"Seam paint adds no geometry draw calls")
	var result:={"baseline_timing":baseline_timing,"enabled_timing":enabled_timing,"passed":failures.is_empty(),"checks":checks,"failures":failures,"engine":Engine.get_version_info().string,"renderer":RenderingServer.get_current_rendering_method(),"compiler":report,"changed_pixels":difference,"drips":drips,"scope":"Global renderer tested on imported Bluebird. No authored seam coordinates. Sparse one-way pre-light colour, protected surfaces, debug outputs, B toggle and sun/camera stability. Static rigid surfaces; no fluid simulation."}
	var file:=FileAccess.open(output_dir.path_join("validation.json"),FileAccess.WRITE);file.store_string(JSON.stringify(result,"\t")+"\n")
	print("BLUEBIRD_SEAM_QA ",JSON.stringify(result));get_tree().quit(0 if failures.is_empty() else 1)
