extends SceneTree
## Explicit GPU integration check plus existing camera/picking/lighting regression.
const OUT = "res://demos/bluebird/qa/street-ground"

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	if DisplayServer.get_name() == "headless":
		push_error("Street ground verification needs a rendered viewport")
		quit(1)
		return
	DirAccess.make_dir_recursive_absolute(OUT)
	var demo = load("res://demos/bluebird/street_corner.tscn").instantiate()
	root.add_child(demo)
	current_scene = demo
	var qa = load("res://demos/bluebird/tools/qa.gd").new()
	demo.add_child(qa)
	qa.output_dir = OUT
	var ground: MeshInstance3D = demo.get_node("Streets/PaintedStreetGround")
	var material: StandardMaterial3D = ground.material_override
	qa.check(material.albedo_texture.get_size() == Vector2(1536, 1024), "Native street texture loads")
	qa.check(material.albedo_texture.get_image().has_mipmaps(), "Street mipmaps survive import")
	qa.check(not material.texture_repeat, "Street uses one complete texture")
	qa.check(ground.mesh.get_aabb().size.is_equal_approx(Vector3(48, 0.18, 32)), "Imported ground preserves physical dimensions")
	qa.check(demo.get_node("Bluebird").position.is_equal_approx(Vector3(-6, 0.18, 5)), "Building still rests at sidewalk height")
	qa.check(not demo.has_node("Streets/SideStreet") and demo.get_node("RoadDetails").get_child_count() == 0, "Legacy roads and duplicate painted markings are removed")
	# Verify imported geometry and texture orientation together, not just file presence.
	var arrays = ground.mesh.surface_get_arrays(0)
	var positions: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var uvs: PackedVector2Array = arrays[Mesh.ARRAY_TEX_UV]
	var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
	for i in positions.size():
		var expected = Vector2((positions[i].x + 24.0) / 48.0, (positions[i].z + 8.125) / 32.0)
		qa.check(uvs[i].distance_to(expected) < 0.001, "Street UV follows world X/Z without mirroring")
		qa.check(normals[i].y > 0.9, "Street faces upward after OBJ import")
	if demo.painterly != null:
		var found := false
		for record in demo.painterly.records:
			if record.source == ground:
				found = true
				qa.check(record.inputs.albedo_texture == material.albedo_texture, "Painterly adapter preserves authored street basecolor")
				qa.check(record.inputs.painterly_shadows, "Street receives current painterly shadows")
		qa.check(found, "Street participates in painterly pipeline")
	demo.target = Vector3(0, 0, 6)
	demo.view_size = 38.0
	demo._update_camera()
	await qa.capture("05-street-wide.png")
	demo.camera.position = Vector3(0, 60, 7.875)
	demo.camera.look_at(Vector3(0, 0, 7.875), Vector3.FORWARD)
	demo.camera.size = 50.0
	await qa.capture("06-topdown-alignment.png")
	demo.reset_view()
	await qa.run(demo)
