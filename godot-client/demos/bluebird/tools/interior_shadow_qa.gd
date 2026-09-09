extends SceneTree
## Exercise the actual imported receiver materials and production GPU shader.
const OUT := "res://demos/bluebird/qa/interior-shadow"
var checks: Array = []
var failures: Array[String] = []
var scene
var output_dir: String

func _initialize() -> void:
	run.call_deferred()

func verify(ok: bool, message: String) -> void:
	checks.append({"passed": ok, "message": message})
	if not ok:
		failures.append(message)
		push_error(message)

func frame(viewport: Viewport) -> Image:
	await process_frame
	for i in 5: await RenderingServer.frame_post_draw
	return viewport.get_texture().get_image()

func difference(a: Image, b: Image) -> int:
	var count := 0
	for y in a.get_height():
		for x in a.get_width():
			if absf(a.get_pixel(x,y).r - b.get_pixel(x,y).r) > 0.01: count += 1
	return count

func peak(image: Image) -> float:
	var value := 0.0
	for y in image.get_height():
		for x in image.get_width(): value = maxf(value, image.get_pixel(x,y).r)
	return value

func run() -> void:
	if DisplayServer.get_name() == "headless": quit(2); return
	var baseline := OS.get_cmdline_user_args().has("--baseline")
	output_dir = OUT.path_join("before" if baseline else "after")
	DirAccess.make_dir_recursive_absolute(output_dir)
	scene = load("res://demos/bluebird/street_corner.tscn").instantiate()
	root.add_child(scene); current_scene = scene
	scene.set_info_visible(false); scene.art_debugger.hide()
	scene.get_node("HUD").hide()
	scene.painterly.highlights.settings.enabled = false; scene.painterly.highlights.refresh()
	var r = scene.painterly.renderer
	var chosen := {}
	var expected_interior := ["L0_FLOOR_Surface0", "L0_REAR_high_Surface1", "L0_KITCHEN_PARTITION_high_Surface0", "L1_FLOOR_Surface0"]
	var interior_count := 0
	var exterior_count := 0
	for record in scene.painterly.records:
		if baseline: record.material.set_shader_parameter("painterly_shadows", true)
		if record.interior:
			interior_count += 1
			verify(not record.material.get_shader_parameter("painterly_shadows"), "Interior excludes exterior brush: " + str(record.part.name))
			verify(record.inputs.casts_shadow, "Interior geometry remains in physical depth: " + str(record.part.name))
		elif record.architecture:
			exterior_count += 1
			verify(record.inputs.painterly_shadows, "Exterior retains brush: " + str(record.part.name))
		if str(record.part.name) in expected_interior: chosen[str(record.part.name)] = record
		if str(record.part.name) == "D0_MAIN_SIGN_CASE_Surface4":
			verify(not record.interior, "Reused dining-floor material on sign stays exterior")
	verify(interior_count > 30 and exterior_count > 30, "Imported architecture has separate indoor and outdoor receivers")
	verify(chosen.size() == expected_interior.size(), "Ground/upper floors, inner wall and partition fixtures found")
	for mode in [false, true]:
		r.rectangle_shadows_enabled = mode; r.refresh_settings()
		scene.target = Vector3(1,1.8,3); scene.view_size = 12; scene._update_camera()
		while r.is_capture_pending(): await process_frame
		(await frame(root)).save_png(output_dir.path_join("street-" + ("rectangle" if mode else "pressure") + ".png"))

	# Use the scene's real receiver materials on a controlled plane. Known
	# captured depth tests physical visibility independently of proxy brushes.
	var viewport := SubViewport.new(); viewport.size = Vector2i(256,256)
	viewport.own_world_3d = true; viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var camera := Camera3D.new(); camera.projection = Camera3D.PROJECTION_ORTHOGONAL; camera.size = 8
	viewport.add_child(camera); camera.position = Vector3(0,0,10)
	var plane := MeshInstance3D.new(); var quad := QuadMesh.new(); quad.size = Vector2(8,8); plane.mesh = quad
	viewport.add_child(plane)
	var depth := Image.create(8,8,false,Image.FORMAT_RGF); depth.fill(Color(0.1,0,0,1))
	var lows := PackedVector4Array([Vector4(-1,-2,2,40)]); lows.resize(32)
	var highs := PackedVector4Array([Vector4(1,2,2.6,0)]); highs.resize(32)
	for name_ in chosen:
		var mat: ShaderMaterial = chosen[name_].material.duplicate()
		plane.material_override = mat
		mat.set_shader_parameter("use_albedo_texture",false); mat.set_shader_parameter("alpha_cutoff",0.0)
		mat.set_shader_parameter("sun_direction",Vector3(0,0.5,1).normalized())
		mat.set_shader_parameter("brush_caster_count",1); mat.set_shader_parameter("brush_caster_min",lows); mat.set_shader_parameter("brush_caster_max",highs)
		mat.set_shader_parameter("shadow_depth",ImageTexture.create_from_image(depth))
		mat.set_shader_parameter("light_view",Transform3D(Basis.IDENTITY,Vector3(0,0,-10)))
		mat.set_shader_parameter("light_span",8.0); mat.set_shader_parameter("light_near",0.0); mat.set_shader_parameter("light_far",20.0)
		for mode in [false,true]:
			var label: String = name_ + ("-rectangle" if mode else "-pressure")
			mat.set_shader_parameter("rectangle_shadows_enabled",mode)
			mat.set_shader_parameter("capture_valid",true)
			mat.set_shader_parameter("debug_view",4); var physical := await frame(viewport)
			mat.set_shader_parameter("debug_view",5); var received := await frame(viewport)
			verify(peak(physical)>0.9, label + ": captured geometry really blocks sunlight")
			verify(difference(physical,received)==0, label + ": indoor visibility follows actual depth, not solid building proxy")
			mat.set_shader_parameter("debug_view",12); var pigment := await frame(viewport)
			verify(peak(pigment)<0.005, label + ": no exterior pigment darkens indoor surface")
			mat.set_shader_parameter("capture_valid",false); mat.set_shader_parameter("debug_view",5)
			var empty := await frame(viewport)
			verify(peak(empty)<0.005, label + ": no proxy shadow where captured geometry is unoccluded")
			if name_ == expected_interior[1]:
				received.save_png(output_dir.path_join(label+"-visibility.png"))
				pigment.save_png(output_dir.path_join(label+"-pigment.png"))
	var report := {"passed":failures.is_empty(),"checks":checks,"failures":failures,"interior_surfaces":interior_count,"exterior_surfaces":exterior_count,"engine":Engine.get_version_info().string,"renderer":RenderingServer.get_current_rendering_method()}
	FileAccess.open(output_dir.path_join("validation.json"),FileAccess.WRITE).store_string(JSON.stringify(report,"  ")+"\n")
	print("INTERIOR_SHADOW_QA ", JSON.stringify({"passed":failures.is_empty(),"checks":checks.size(),"failures":failures.size()}))
	quit(0 if failures.is_empty() else 1)
