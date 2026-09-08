extends Node
## Real-GPU content integration checks. P compares grading at identical lighting/output.
var failures: Array[String] = []
var checks := 0
var metrics := {}
var output_dir := "res://demos/bluebird/qa/color"

func check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures.append(message)
		push_error(message)

func frame(demo: Node3D, filename: String = "") -> Image:
	while demo.painterly.renderer.is_capture_pending():
		await get_tree().process_frame
	for i in 4: await RenderingServer.frame_post_draw
	var picture := get_viewport().get_texture().get_image()
	if filename != "":
		check(picture.save_png(output_dir.path_join(filename)) == OK, "Save " + filename)
	return picture

func difference(a: Image, b: Image) -> Dictionary:
	var total := 0.0
	var maximum := 0.0
	var changed := 0
	var count := 0
	for y in range(80, a.get_height()-100, 2):
		for x in range(0, a.get_width(), 2):
			var ca := a.get_pixel(x,y)
			var cb := b.get_pixel(x,y)
			var d := maxf(absf(ca.r-cb.r),maxf(absf(ca.g-cb.g),absf(ca.b-cb.b)))
			total += d
			maximum = maxf(maximum,d)
			changed += int(d>2.0/255.0)
			count += 1
	return {"mean":total/count,"max":maximum,"changed_pixels":changed}

func run(demo: Node3D) -> void:
	if OS.get_cmdline_user_args().has("--bluebird-base-study"):
		output_dir="res://demos/bluebird/qa/base-v11"
	if DisplayServer.get_name() == "headless" or demo.painterly == null:
		push_error("Bluebird color QA requires a real Forward+ GPU window.")
		get_tree().quit(1)
		return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_dir))
	var preview = demo.painterly
	var renderer: PainterlyRenderer = preview.renderer
	await frame(demo)
	var atlases := {}
	var architecture := 0
	var uv_match := true
	var material_match := true
	for record in preview.records:
		if record.architecture: architecture += 1
		var original = record.original
		if original is BaseMaterial3D:
			material_match = material_match and record.inputs.albedo == original.albedo_color and record.inputs.albedo_texture == original.albedo_texture
			if original.albedo_texture:
				atlases[original.albedo_texture.get_instance_id()] = original.albedo_texture
		var before: Array = record.source.mesh.surface_get_arrays(record.index)
		var after: Array = record.part.mesh.surface_get_arrays(0)
		uv_match = uv_match and before[Mesh.ARRAY_TEX_UV] == after[Mesh.ARRAY_TEX_UV] and before[Mesh.ARRAY_VERTEX] == after[Mesh.ARRAY_VERTEX] and before[Mesh.ARRAY_INDEX] == after[Mesh.ARRAY_INDEX]
	var imported_meshes := demo.get_node("Bluebird/Architecture").find_children("*", "MeshInstance3D", true, false)
	check(imported_meshes.size() == 75, "v11 retains architecture and four painted sign surfaces")
	check(demo.get_node("Bluebird/Architecture").find_children("*FASCIA*", "MeshInstance3D", true, false).is_empty(), "White eave frame geometry absent from imported model")
	check(architecture == 157, "157 diffuse and painted alpha-cutout surfaces use NPR")
	check(preview.skipped.size() == 10, "Ten glass/special surfaces bypass the diffuse adapter")
	check(uv_match, "All converted geometry, indices and UVs match source surfaces")
	check(material_match, "All standard diffuse inputs retain source colors and texture resources")
	check(atlases.size() == 10, "Six baked component atlases, complete kitchen floor and three painted signs present")
	for texture in atlases.values(): check(texture.get_image().has_mipmaps(), "Original atlas has mipmaps")
	check(renderer._brush_layers.get_layers()==5 and renderer.brush_strength==1.0,"Five approved shadow brushes enabled")
	check(renderer._published_caster_count==14,"Fourteen authored mass proxies replace arbitrary surface bounds")
	check(preview.control_profiles.size()==11,"Eleven facade, roof and ground control domains loaded")
	for name in preview.control_textures:
		var data: Image=preview.control_textures[name].get_image()
		var sample: Color=data.get_pixel(data.get_width()/2,data.get_height()/2)
		if name.ends_with("/importance"):
			check(sample.r>0.15,"Importance data is nonzero: "+name)
		elif name.ends_with("/flow"):
			check(sample.r>0.78 and sample.g>0.48,"Flow data survived export: "+name)
		else:
			check(sample.r>0.0 and sample.a>=0.47,"Indirect RGB and accessibility survived export: "+name)
	var mapped := 0
	var lettering := 0
	for record in preview.records:
		if record.inputs.indirect_map and record.inputs.flow_map: mapped+=1
		if record.source.get_meta("extras",{}).get("paintedLettering",false):
			lettering+=1
			check(record.inputs.alpha_cutoff>0,"Painted lettering retains transparent counters")
	check(mapped>100,"Authored controls are connected to visible surfaces")
	check(lettering==4,"BLUEBIRD, DINER and both EATS faces use painted lettering")
	var component_domains := {}
	for mesh in imported_meshes:
		var domain: String=mesh.get_meta("extras",{}).get("componentTexture","")
		if domain!="":component_domains[domain]=true
	check(component_domains.size()==9,"Nine unique complete component paintings are attached to model geometry")
	metrics.component_domains=component_domains.keys()
	metrics.controlled_surfaces=mapped
	metrics.painted_sign_surfaces=lettering
	for record in preview.records:
		if record.source.name in ["L0_RIGHT_high","L1_ROOF","L0_FRONT_high"]:
			var expected={"L0_RIGHT_high":"right_0","L1_ROOF":"roof_1","L0_FRONT_high":"front_0"}[str(record.source.name)]
			check(record.part.get_meta("control_profile","")==expected,"GLTF extras select "+expected)
			var vertex: Vector3=record.part.mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX][0]
			var actual: Vector3=record.inputs.data_transform*vertex
			var expected_position: Vector3=preview._architecture.to_local(record.part.to_global(vertex))
			check(actual.distance_to(expected_position)<0.0001,"Controls follow architecture coordinates")
	check(not demo.environment.adjustment_enabled and demo.environment.tonemap_exposure == 1.0, "Neutral host output avoids double grading and exposure")
	check(renderer.color_response > 0.0 and renderer.contrast_response > 0.0, "Selective color and importance contrast enabled")
	demo.get_node("HUD").hide()
	demo.set_grading(false)
	var before := await frame(demo,"01-noon-baseline.png")
	var captures := renderer.capture_count
	demo.set_grading(true)
	var after := await frame(demo,"02-noon-graded.png")
	metrics.noon_difference = difference(before,after)
	check(metrics.noon_difference.changed_pixels > 100, "Noon grading changes visible content")
	check(renderer.capture_count == captures, "Grade toggle reuses identical physical shadow capture")
	var stable := await frame(demo)
	check(difference(after,stable).max < 0.005, "Fixed frame grading is stable")
	# Check actual irradiance contribution, independently from direct sun and grade.
	for record in preview.records:
		if not record.inputs.indirect_map: continue
		record.inputs.indirect_energy=0.0
		record.inputs.indirect_alpha_occlusion=false
		renderer.refresh_surface_inputs(record.part)
	var no_indirect := await frame(demo)
	metrics.indirect_difference=difference(after,no_indirect)
	check(metrics.indirect_difference.changed_pixels>100,"Authored indirect maps visibly affect the rendered scene")
	check(renderer.capture_count==captures,"Indirect maps do not rebuild solar depth")
	for record in preview.records:
		if not record.inputs.indirect_map: continue
		record.inputs.indirect_energy=1.0
		record.inputs.indirect_alpha_occlusion=true
		renderer.refresh_surface_inputs(record.part)
	renderer.debug_view = PainterlyRenderer.DebugView.IMPORTANCE
	renderer.refresh_settings()
	var importance_picture := await frame(demo,"03-importance.png")
	var roof_point: Vector2=demo.camera.unproject_position(preview._architecture.to_global(Vector3(3,6.04,-7)))
	check(importance_picture.get_pixelv(Vector2i(roof_point)).r>0.1,"Visible roof samples the authored importance map")
	renderer.debug_view = PainterlyRenderer.DebugView.COLOR_WEIGHT
	renderer.refresh_settings()
	await frame(demo,"04-noon-color-weight.png")
	renderer.debug_view = PainterlyRenderer.DebugView.BEAUTY
	renderer.refresh_settings()
	demo.view_size = 14.0
	demo._update_camera()
	await frame(demo,"05-noon-closeup.png")
	# Real viewport detail views, including both readable EATS faces.
	demo.target=preview._architecture.to_global(Vector3(9.65,3.72,0.0))
	demo.yaw=15.0
	demo.pitch=7.0
	demo.view_size=6.1
	demo._update_camera()
	await frame(demo,"09-painted-signs.png")
	demo.target=preview._architecture.to_global(Vector3(12.45,3.54,-1.45))
	demo.yaw=155.0
	demo.pitch=6.0
	demo.view_size=2.8
	demo._update_camera()
	await frame(demo,"10-eats-back.png")
	demo.reset_view()
	demo.set_evening(true)
	demo.set_grading(false)
	before = await frame(demo,"06-evening-baseline.png")
	demo.set_grading(true)
	after = await frame(demo,"07-evening-graded.png")
	metrics.evening_difference = difference(before,after)
	check(metrics.evening_difference.changed_pixels > 100, "Evening grading changes visible content")
	# Debug weight must vanish without direct sun, even with strong indirect light.
	renderer.set_lighting(renderer.sun_direction, renderer.sun_color, 0.0)
	renderer.set_environment_light(Color("ffb577"), 2.0)
	renderer.debug_view = PainterlyRenderer.DebugView.COLOR_WEIGHT
	renderer.refresh_settings()
	var no_sun := await frame(demo)
	var point: Vector2 = demo.camera.unproject_position(Vector3(0,0.18,6.0))
	check(no_sun.get_pixelv(Vector2i(point)).r < 0.01, "Indirect light alone cannot trigger ground solar enhancement")
	renderer.debug_view = PainterlyRenderer.DebugView.BEAUTY
	demo.set_evening(false)
	demo.get_node("HUD").show()
	await frame(demo,"08-controls.png")
	var grade_key := InputEventKey.new()
	grade_key.keycode = KEY_P
	grade_key.pressed = true
	demo._unhandled_input(grade_key)
	check(not renderer.enabled and not demo.grade_button.button_pressed, "P key and toggle agree")
	demo._unhandled_input(grade_key)
	check(renderer.enabled and demo.grade_button.button_pressed, "P restores art grading")
	metrics.merge(renderer.get_stats())
	var report := {"passed":failures.is_empty(),"checks":checks,"failures":failures,"engine":Engine.get_version_info().string,"display":DisplayServer.get_name(),"renderer":RenderingServer.get_current_rendering_method(),"converted_architecture_surfaces":architecture,"native_surfaces":preview.skipped,"shared_atlases":atlases.size(),"metrics":metrics,"scope":"v11 nine complete component paintings, preserved alpha lettering, authored importance/flow/ambient maps and architecture mass brush proxies. Preserved geometry/UV/colour, control domains, noon/evening GPU grading and closeups. Native GI, full PBR and performance budget excluded; indirect RGB is artist-authored bounce."}
	var file := FileAccess.open(output_dir.path_join("validation.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"\t")+"\n")
	print("BLUEBIRD_COLOR_QA ",JSON.stringify(report))
	get_tree().quit(0 if failures.is_empty() else 1)
