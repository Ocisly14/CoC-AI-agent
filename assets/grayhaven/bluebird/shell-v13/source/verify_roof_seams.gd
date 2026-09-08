extends SceneTree
## Verify the geometry edit keeps both roofs connected to the global paint pass.
func _initialize() -> void:
	call_deferred("run")
func run() -> void:
	var demo=load("res://demos/bluebird/street_corner.tscn").instantiate()
	root.add_child(demo)
	for i in 12: await RenderingServer.frame_post_draw
	var renderer=demo.painterly.renderer
	while renderer.is_capture_pending(): await process_frame
	var stats=renderer.rebuild_seam_paint()
	var by_id={}
	for record in demo.painterly.records: by_id[record.inputs.paint_id]=record
	var roof_to_wall={"L0_LOW_ROOF":0,"L1_ROOF":0}
	for stamp in renderer.seam_paint.stamps:
		var donor=by_id[stamp.source_id]
		var receiver=by_id[stamp.receiver_id]
		var donor_name=str(donor.source.name)
		if donor_name in roof_to_wall and receiver.source.get_meta("extras",{}).get("role","")=="wall":
			roof_to_wall[donor_name]+=1
	var passed=stats.errors.is_empty() and roof_to_wall.L0_LOW_ROOF>0 and roof_to_wall.L1_ROOF>0
	var report={"passed":passed,"contact_tolerance_m":renderer.seam_contact_tolerance_m,"roof_to_wall_stamps":roof_to_wall,"compiler":stats,"scope":"Actual imported v13 model retains one-way roof colour at wall contacts after the roof fitting edit."}
	var file=FileAccess.open("res://../assets/grayhaven/bluebird/shell-v13/source/roof-seam-audit.json",FileAccess.WRITE)
	if file==null:
		file=FileAccess.open(ProjectSettings.globalize_path("res://").path_join("../assets/grayhaven/bluebird/shell-v13/source/roof-seam-audit.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"\t")+"\n")
	print("V13_ROOF_SEAM_QA ",JSON.stringify(report))
	quit(0 if passed else 1)
