extends SceneTree
## Reproduce street geometry drawing inside the room; test actual visible pixels.
const OUT := "res://demos/bluebird/qa/street-footprint"
var scene
var checks: Array = []
var failures: Array[String] = []
var output_dir: String

func _initialize() -> void:
	run.call_deferred()

func verify(ok: bool, message: String) -> void:
	checks.append({"passed":ok,"message":message})
	if not ok: failures.append(message); push_error(message)

func frame() -> Image:
	while scene.painterly.renderer.is_capture_pending(): await process_frame
	for i in 5: await RenderingServer.frame_post_draw
	return root.get_texture().get_image()

func capture(name_: String) -> Image:
	var image := await frame()
	image.save_png(output_dir.path_join(name_+".png"))
	return image

func area_xz(mesh: Mesh) -> float:
	var total := 0.0
	for s in mesh.get_surface_count():
		var arrays := mesh.surface_get_arrays(s)
		var points: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX] if arrays[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
		if indices.is_empty():
			for i in points.size(): indices.append(i)
		for i in range(0,indices.size(),3):
			var a := points[indices[i]]; var b := points[indices[i+1]]; var c := points[indices[i+2]]
			total += absf(Vector2(b.x-a.x,b.z-a.z).cross(Vector2(c.x-a.x,c.z-a.z))) * 0.5
	return total

func run() -> void:
	if DisplayServer.get_name()=="headless": quit(2); return
	var baseline := OS.get_cmdline_user_args().has("--baseline")
	output_dir = OUT.path_join("before" if baseline else "after")
	DirAccess.make_dir_recursive_absolute(output_dir)
	scene=load("res://demos/bluebird/street_corner.tscn").instantiate()
	root.add_child(scene);current_scene=scene
	scene.get_node("HUD").hide()
	scene.painterly.highlights.settings.enabled=false;scene.painterly.highlights.refresh()
	var r=scene.painterly.renderer
	var original: Mesh=load("res://demos/bluebird/assets/bluebird-street-ground.obj")
	var street: MeshInstance3D=scene.get_node("Streets/PaintedStreetGround")
	var rendered: MeshInstance3D
	for record in scene.painterly.records:
		if record.source==street: rendered=record.part
	verify(rendered!=null,"Actual rendered street surface found")
	if baseline:
		street.mesh=original;rendered.mesh=original;r.request_capture()
	var removed := area_xz(original)-area_xz(street.mesh)
	verify(absf(removed-(12.0*10.0-1.3*1.3*0.5))<0.001,"Street cutout matches actual chamfered floor area (119.155 square metres)")
	verify(street.mesh.get_aabb().is_equal_approx(original.get_aabb()),"Street outer dimensions and sidewalk height are preserved")
	var max_uv_error := 0.0
	var minimum_normal_y := 1.0
	for s in street.mesh.get_surface_count():
		var arrays := street.mesh.surface_get_arrays(s)
		for i in arrays[Mesh.ARRAY_VERTEX].size():
			var p: Vector3=arrays[Mesh.ARRAY_VERTEX][i]
			var expected:=Vector2((p.x+24.0)/48.0,(p.z+8.125)/32.0)
			max_uv_error=maxf(max_uv_error,arrays[Mesh.ARRAY_TEX_UV][i].distance_to(expected))
			minimum_normal_y=minf(minimum_normal_y,arrays[Mesh.ARRAY_NORMAL][i].y)
	verify(max_uv_error<0.001,"Cut edges retain the authored street UV mapping")
	verify(minimum_normal_y>0.9,"Triangle orientation and upward normals survive clipping")
	scene.camera.projection=Camera3D.PROJECTION_PERSPECTIVE;scene.camera.fov=70
	scene.camera.position=Vector3(2,1.6,4);scene.camera.look_at(Vector3(-1,1.5,-2),Vector3.UP)
	await capture("01-room")
	# Keep real depth occluders, isolate only the advertising-sign art proxies.
	var full: Array[AABB]=scene.painterly.architecture_brush_volumes.duplicate()
	var signs: Array[AABB]=[]
	for i in scene.painterly.control_manifest.brush_casters.size():
		if "SIGN" in scene.painterly.control_manifest.brush_casters[i].name: signs.append(full[i])
	r.set_brush_caster_volumes(signs,Transform3D.IDENTITY)
	await capture("02-room-sign-proxies")
	# Identify the actual visible street pixels, not a material flag or a test
	# quad. All geometry retains its position/depth; only diagnostic color changes.
	var dark:=ShaderMaterial.new();var dark_shader:=Shader.new()
	dark_shader.code="shader_type spatial; render_mode unshaded, fog_disabled, cull_disabled; void fragment(){ALBEDO=vec3(0.0);}"
	dark.shader=dark_shader
	var white:=ShaderMaterial.new();var white_shader:=Shader.new()
	white_shader.code=dark_shader.code.replace("vec3(0.0)","vec3(1.0)");white.shader=white_shader
	var saved: Array=[]
	for node in scene.find_children("*","MeshInstance3D",true,false):
		saved.append([node,node.material_override]);node.material_override=dark
	rendered.material_override=white
	var mask:=await capture("03-visible-street-mask")
	var street_pixels:=0
	for y in range(int(mask.get_height()*0.68),mask.get_height()):
		for x in range(int(mask.get_width()*0.05),int(mask.get_width()*0.95)):
			if mask.get_pixel(x,y).r>0.5: street_pixels+=1
	verify(street_pixels==0,"No street geometry or its sign/building shadows draws over the indoor floor")
	for item in saved:item[0].material_override=item[1]
	scene.camera.projection=Camera3D.PROJECTION_ORTHOGONAL
	scene.target=Vector3(1,1.8,3);scene.view_size=12;scene._update_camera()
	scene.painterly.set_lamp_shadows(true)
	await capture("04-street-windows")
	var report: Dictionary={"passed":failures.is_empty(),"checks":checks,"failures":failures,"removed_street_area_m2":removed,"visible_indoor_street_pixels":street_pixels,"engine":Engine.get_version_info().string,"renderer":RenderingServer.get_current_rendering_method()}
	FileAccess.open(output_dir.path_join("validation.json"),FileAccess.WRITE).store_string(JSON.stringify(report,"  ")+"\n")
	print("STREET_FOOTPRINT_QA ",JSON.stringify(report));quit(0 if failures.is_empty() else 1)
