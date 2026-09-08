extends Node
## Opt-in viewport evidence for the less visible v11 component paintings.
var output_dir := "res://demos/bluebird/qa/material-v11"

func capture(demo: Node3D, filename: String) -> void:
	for i in 2: await get_tree().process_frame
	while demo.painterly.renderer.is_capture_pending(): await get_tree().process_frame
	for i in 4: await RenderingServer.frame_post_draw
	var picture := get_viewport().get_texture().get_image()
	assert(picture.save_png(output_dir.path_join(filename)) == OK)

func run(demo: Node3D) -> void:
	assert(demo.painterly != null and DisplayServer.get_name() != "headless")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_dir))
	demo.get_node("HUD").hide()
	demo.yaw=222.0
	demo.view_size=14.0
	demo._update_camera()
	await capture(demo,"01-rear-left.png")
	demo.pitch=78.0
	demo.yaw=42.0
	demo.view_size=14.0
	demo._update_camera()
	await capture(demo,"02-roofs.png")
	# Actual imported floor surfaces, isolated for material/UV inspection.
	for level in [0,1]:
		for child in demo.painterly.find_children("*","MeshInstance3D",true,false): child.hide()
		for record in demo.painterly.records:
			var metadata: Dictionary=record.source.get_meta("extras",{})
			if record.architecture and metadata.get("role","")=="floor" and int(metadata.get("floor",-1))==level:
				record.part.show()
		demo.target=demo.painterly._architecture.to_global(Vector3(6,0,-5) if level==0 else Vector3(3,3.2,-7))
		demo.pitch=89.9
		demo.yaw=0.0
		demo.view_size=14.0 if level==0 else 7.5
		demo._update_camera()
		await capture(demo,"03-floor-lower.png" if level==0 else "04-floor-upper.png")
	print("BLUEBIRD_MATERIAL_VIEWS_COMPLETE: rear/left, roof and both isolated floors")
	get_tree().quit()
