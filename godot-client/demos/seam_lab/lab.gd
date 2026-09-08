extends Node3D
## Geometry-only fixture proving seam rendering is independent of Bluebird.
var renderer: PainterlyRenderer
var camera: Camera3D
var surfaces: Dictionary={}
var checks:=0
var failures: Array[String]=[]
var output_dir:="res://demos/seam_lab/qa"

func check(ok: bool, label: String) -> void:
	checks+=1
	if not ok: failures.append(label);push_error(label)

func quad(id: String, bounds: Rect2, z: float, color: Color, order: int) -> MeshInstance3D:
	var mesh:=ArrayMesh.new()
	var a: Array=[];a.resize(Mesh.ARRAY_MAX)
	var x:=bounds.position.x;var y:=bounds.position.y;var w:=bounds.size.x;var h:=bounds.size.y
	a[Mesh.ARRAY_VERTEX]=PackedVector3Array([Vector3(x,y,z),Vector3(x+w,y,z),Vector3(x+w,y+h,z),Vector3(x,y+h,z)])
	a[Mesh.ARRAY_NORMAL]=PackedVector3Array([Vector3.BACK,Vector3.BACK,Vector3.BACK,Vector3.BACK])
	a[Mesh.ARRAY_TEX_UV]=PackedVector2Array([Vector2(0,1),Vector2(1,1),Vector2(1,0),Vector2(0,0)])
	a[Mesh.ARRAY_INDEX]=PackedInt32Array([0,2,1,0,3,2])
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,a)
	var node:=MeshInstance3D.new();node.name=id;node.mesh=mesh;add_child(node)
	var inputs:=PainterlySurface.new();inputs.albedo=color;inputs.paint_id=id;inputs.paint_order=order;inputs.painterly_shadows=false
	renderer.register_surface(node,inputs)
	surfaces[id]={"node":node,"inputs":inputs}
	return node

func _ready() -> void:
	var env:=WorldEnvironment.new();env.environment=PainterlyRenderer.neutral_environment(Color("252c31"));add_child(env)
	renderer=PainterlyRenderer.new();renderer.capture_resolution=512;renderer.capture_span=16;add_child(renderer)
	renderer.set_environment_light(Color.WHITE,0.9);renderer.set_lighting(Vector3(0,0.5,1),Color.WHITE,0.4)
	quad("red",Rect2(0,1,4,2),0,Color("c52a24"),20)
	quad("blue",Rect2(0,-1,4,2),0,Color("325baa"),10)
	quad("distant",Rect2(4.2,-1,2,2),0,Color("42965e"),0)
	quad("protected",Rect2(4,1,2,2),0,Color("edd096"),0)
	surfaces.protected.inputs.seam_protection=1.0
	camera=Camera3D.new();camera.projection=Camera3D.PROJECTION_ORTHOGONAL;camera.size=5.0
	camera.position=Vector3(3,1,8);add_child(camera);camera.look_at(Vector3(3,1,0));camera.make_current()
	if OS.get_cmdline_user_args().has("--seam-qa"): run.call_deferred()

func frame(filename: String="") -> Image:
	while renderer.is_capture_pending(): await get_tree().process_frame
	for i in 3: await RenderingServer.frame_post_draw
	var image:=get_viewport().get_texture().get_image()
	if filename!="": check(image.save_png(output_dir.path_join(filename))==OK,"Save "+filename)
	return image

func sample(image: Image, point: Vector3) -> Color:
	return image.get_pixelv(Vector2i(camera.unproject_position(to_global(point))))

func run() -> void:
	if DisplayServer.get_name()=="headless": get_tree().quit(1);return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_dir))
	await frame()
	var report:=renderer.rebuild_seam_paint()
	check(report.errors.is_empty(),"Generic geometry compiles without errors")
	check(report.stamps>0,"Automatic detection finds touching red/blue surfaces")
	check(report.coverage_upper_bound<=0.15,"Coverage remains sparse")
	check(report.drips<=2,"Scene-wide drip cap")
	for stamp in renderer.seam_paint.stamps:
		check(stamp.source_id=="red" and stamp.receiver_id=="blue","Only higher red layer deposits into blue")
		check(stamp.color.is_equal_approx(Color("c52a24").srgb_to_linear()),"Raw source colour is linear and unlit")
	var original_layout:=str(renderer.seam_paint.stamps)
	renderer.debug_view=PainterlyRenderer.DebugView.BASE
	renderer.seam_enabled=false;renderer.refresh_settings()
	var before:=await frame("01-base-before.png")
	renderer.seam_enabled=true;renderer.refresh_settings()
	var after:=await frame("02-base-after.png")
	var changed:=0;var donor_changes:=0
	for y in range(0,get_viewport().get_visible_rect().size.y,2):
		for x in range(0,get_viewport().get_visible_rect().size.x,2):
			if before.get_pixel(x,y)!=after.get_pixel(x,y):
				changed+=1
				var world:=camera.project_position(Vector2(x,y),8)
				if world.y>1.01: donor_changes+=1
	check(changed>10,"Actual GPU pixels change on the receiving surface")
	check(donor_changes==0,"Actual donor pixels are unchanged")
	check(sample(before,Vector3(5,2,0))==sample(after,Vector3(5,2,0)),"Protected surface stays intact")
	renderer.debug_view=PainterlyRenderer.DebugView.SEAM_MASK;renderer.refresh_settings()
	var mask:=await frame("03-mask.png")
	check(sample(mask,Vector3(5,0,0)).r<0.01,"Non-contact geometry cannot receive paint")
	var protection_image:=Image.create(8,8,false,Image.FORMAT_RGBA8);protection_image.fill(Color.WHITE)
	surfaces.blue.inputs.seam_protection_map=ImageTexture.create_from_image(protection_image)
	renderer.refresh_surface_inputs(surfaces.blue.node)
	var protected_mask:=await frame()
	check(sample(protected_mask,renderer.seam_paint.stamps[0].center+Vector3(0,-0.02,0)).r<0.01,"Per-pixel protection map suppresses incoming pigment")
	surfaces.blue.inputs.seam_protection_map=null
	renderer.refresh_surface_inputs(surfaces.blue.node);await frame()

	var count: int=renderer.seam_paint.build_count
	camera.position.x+=0.5;await frame()
	check(renderer.seam_paint.build_count==count,"Camera motion does not rebuild seams")
	camera.position.x-=0.5
	renderer.set_lighting(Vector3(-0.5,0.8,1),Color("ffb675"),1.7)
	var lit_mask:=await frame()
	check(mask.get_data()==lit_mask.get_data(),"Light direction and colour do not change the pigment mask")
	position+=Vector3(12,3,-7);rotation.y=0.6
	await frame()
	check(renderer.seam_paint.build_count==count,"Rigid scene transform keeps the compiled paint")
	check(str(renderer.seam_paint.stamps)==original_layout,"Rigid movement preserves exact stamp layout")
	position=Vector3.ZERO;rotation=Vector3.ZERO;await frame()
	renderer.rebuild_seam_paint()
	check(str(renderer.seam_paint.stamps)==original_layout,"Explicit rebuild with the same seed is deterministic")
	renderer._surfaces.reverse();renderer.rebuild_seam_paint()
	check(str(renderer.seam_paint.stamps)==original_layout,"Registration order does not change seeded paint")
	renderer._surfaces.reverse();renderer.rebuild_seam_paint()
	renderer.seam_seed+=1;renderer.rebuild_seam_paint()
	check(str(renderer.seam_paint.stamps)!=original_layout,"New seed produces a different stable layout")
	# Rank inversion and local override both remain strictly one-way.
	surfaces.blue.inputs.paint_order=30
	renderer.refresh_surface_inputs(surfaces.blue.node);renderer.rebuild_seam_paint()
	check(renderer.seam_paint.stamps.size()>0,"Inverted ranks still discover the seam")
	for stamp in renderer.seam_paint.stamps: check(stamp.source_id=="blue" and stamp.receiver_id=="red","Layer inversion reverses deposition")
	var override:=PainterlySeam.new();override.source_id="red";override.receiver_id="blue"
	renderer.seam_overrides=[override];renderer.rebuild_seam_paint()
	for stamp in renderer.seam_paint.stamps: check(stamp.source_id=="red","Local artist direction overrides the layer default")
	var inverse:=PainterlySeam.new();inverse.source_id="blue";inverse.receiver_id="red"
	renderer.seam_overrides=[override,inverse]
	check(not renderer.rebuild_seam_paint().errors.is_empty(),"Bidirectional override is rejected")
	renderer.seam_overrides=[];surfaces.blue.inputs.paint_order=20
	check(renderer.rebuild_seam_paint().stamps==0,"Equal paint layers do not diffuse")
	surfaces.blue.inputs.paint_order=10
	# A gap beyond tolerance is a visual adjacency, not a physical seam.
	surfaces.blue.node.position.y=-0.15
	check(renderer.rebuild_seam_paint().stamps==0,"Separated geometry does not bleed across empty space")
	surfaces.blue.node.position.y=0
	renderer.rebuild_seam_paint();renderer.debug_view=PainterlyRenderer.DebugView.BEAUTY;renderer.refresh_settings()
	await frame("04-beauty.png")
	# Colour textures are separate sRGB inputs; they are decoded once before deposit.
	var texture_image:=Image.create(16,16,false,Image.FORMAT_RGBA8)
	texture_image.fill(Color("cc0000"));texture_image.generate_mipmaps()
	surfaces.red.inputs.albedo=Color.WHITE
	surfaces.red.inputs.albedo_texture=ImageTexture.create_from_image(texture_image)
	renderer.refresh_surface_inputs(surfaces.red.node);renderer.rebuild_seam_paint()
	var textured: Dictionary=renderer.seam_paint.stamps[0]
	check(absf(textured.color.r-0.603827)<0.001 and textured.color.g<0.0001,"Texture sRGB red is decoded exactly once")
	# UV island boundaries are welded geometrically; diagonal triangulation is not a seam.
	check(renderer.seam_paint.seams.size()==1,"Quad triangulation does not create artificial seams")
	# Exercise both rare drip shapes with seeds, without asset-specific positions.
	var shapes: Dictionary={}
	for seed_ in 150:
		renderer.seam_seed=seed_;renderer.rebuild_seam_paint()
		for stamp in renderer.seam_paint.stamps:
			if stamp.drip_length>0 and not shapes.has(stamp.long_drip): shapes[stamp.long_drip]=stamp.duplicate(true)
		if shapes.size()==2: break
	check(shapes.size()==2,"Stable random seeds can produce both short and long sparse drips")
	for long_ in shapes:
		var drip: Dictionary=shapes[long_]
		var record: Dictionary=renderer._surfaces[1]
		var own: Array[Dictionary]=[drip]
		renderer.seam_paint.upload(record,Transform3D.IDENTITY,own,renderer)
		renderer.debug_view=PainterlyRenderer.DebugView.SEAM_MASK;renderer.refresh_settings()
		camera.size=0.65;camera.position=drip.center+Vector3(0,-0.12,8)
		var with_drip:=await frame("06-long-drip.png" if long_ else "05-short-drip.png")
		drip.drip_length=0.0
		renderer.seam_paint.upload(record,Transform3D.IDENTITY,own,renderer)
		var without_drip:=await frame()
		check(with_drip.get_data()!=without_drip.get_data(),"GPU drip shape contributes visible pixels: "+str(long_))
	camera.size=5.0;camera.position=Vector3(3,1,8)
	# Perpendicular contact in a face interior is a T-junction, not a shared boundary.
	var compiler=renderer.seam_paint
	var edge:={"a":Vector3(0,1,0),"b":Vector3(2,1,0),"tri":{"normal":Vector3.UP}}
	var tri:={"p":[Vector3(-1,-1,0),Vector3(5,-1,0),Vector3(-1,5,0)],"normal":Vector3.BACK}
	var contact: Dictionary=compiler.match_face(edge,tri,0.035)
	check(not contact.is_empty() and contact.inward.dot(Vector3.DOWN)>0.99,"Perpendicular T-junction computes a receiving direction")
	edge.a.z=0.15;edge.b.z=0.15
	check(compiler.match_face(edge,tri,0.035).is_empty(),"T-junction does not bridge an air gap")
	# Closed solid meshes expose creases, while coplanar triangulation stays welded.
	var box:=MeshInstance3D.new();box.mesh=BoxMesh.new();add_child(box)
	var box_geometry: Dictionary=compiler.geometry({"mesh":box},Transform3D.IDENTITY)
	check(box_geometry.edges.size()==24,"Closed box provides two receiving faces per geometric crease")
	box.queue_free()
	renderer.rebuild_seam_paint();renderer.debug_view=PainterlyRenderer.DebugView.BEAUTY;renderer.refresh_settings()
	renderer.unregister_surface(surfaces.red.node)
	await frame()
	check(surfaces.blue.node.material_override.get_shader_parameter("seam_stamp_count")==0,"Unregistering a donor removes its deposited colour")
	var result:={"passed":failures.is_empty(),"checks":checks,"failures":failures,"engine":Engine.get_version_info().string,"renderer":RenderingServer.get_current_rendering_method(),"compiler":report,"scope":"Independent geometry fixture; GPU one-way paint, protection, contact, seed stability, movement, sunlight, rank inversion, override rejection and sparse coverage."}
	var file:=FileAccess.open(output_dir.path_join("validation.json"),FileAccess.WRITE);file.store_string(JSON.stringify(result,"\t")+"\n")
	print("SEAM_QA ",JSON.stringify(result));get_tree().quit(0 if failures.is_empty() else 1)
