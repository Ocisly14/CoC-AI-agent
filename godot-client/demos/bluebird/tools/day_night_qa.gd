extends "res://demos/bluebird/tools/art_debugger_qa.gd"

func run() -> void:
	DirAccess.make_dir_recursive_absolute(OUT)
	scene = load("res://demos/bluebird/street_corner.tscn").instantiate()
	root.add_child(scene); current_scene = scene
	panel = scene.art_debugger; renderer = scene.painterly.renderer
	var user_before = FileAccess.get_file_as_string(panel.PRESET_PATH)
	var exposure = renderer.exposure
	var initial = panel.snapshot().duplicate(true)
	var curve = scene.DAY_NIGHT
	for step_ in 97:
		var sample = curve.sample(step_ * 0.25)
		check(sample.energy >= 0.0 and sample.elevation >= 5.0, "Finite bounded light at quarter hour %d" % step_)
	check(curve.sample(0) == curve.sample(24), "Midnight wraps exactly")
	for boundary in [6.0, 18.0]:
		check(curve.sample(boundary - 0.001).energy < 0.0001 and curve.sample(boundary + 0.001).energy < 0.0001, "Handoff fades both sources to zero")
	for hour in [6.5, 12.0, 17.5, 0.0]:
		panel.time_slider.value = hour
		await frame("time-%04d" % int(hour * 100))
		var night = hour < 6 or hour >= 18
		check(scene.cycle_enabled, "Slider enables the time cycle")
		check(scene.moon.visible == night and scene.sun.visible != night, "Exactly one celestial light visible")
		check(renderer._published_direction.is_equal_approx(scene.active_celestial_light().global_basis.z.normalized()), "Shadow direction matches active source")
		check(is_equal_approx(renderer.exposure, exposure), "Time scrub preserves exposure")
		check(panel.valid_state(panel.snapshot()), "Time state validates")
	panel.set_baseline() # A = midnight moon.
	panel.change("time_of_day", 12.0)
	panel.toggle_compare(); check(scene.moon.visible and scene.time_of_day == 0, "A restores lunar state")
	panel.toggle_compare(); check(scene.sun.visible and scene.time_of_day == 12, "B restores solar state")
	panel.change("time_of_day", 22.25)
	var path = OUT.path_join("cycle-v3.json")
	check(panel.save_preset(path) == OK, "Time preset saves")
	panel.change("time_of_day", 10.0)
	check(panel.load_preset(path) == OK and scene.moon.visible and scene.time_of_day == 22.25, "Time preset restores moon and time")
	panel.change("sun_energy", 0.3)
	check(not scene.cycle_enabled and not scene.moon.visible and scene.sun.visible, "Manual lighting leaves cycle with one light")
	check(is_equal_approx(renderer.sun_energy, 0.3), "Manual energy remains usable after moon")
	panel.apply_state(initial)
	await frame()
	panel.change("time_of_day", 23.999)
	await frame()
	panel.playing = true; panel._process(0.2); panel.stop_playback()
	check(scene.time_of_day < 1.0, "Playback advances across midnight")
	# Old files restore manual lighting, and never leave a stale visible moon.
	var legacy = initial.duplicate(true)
	legacy.erase("cycle"); legacy.lighting.erase("background_color")
	var file = FileAccess.open(OUT.path_join("cycle-v2.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify({"version": 2, "state": legacy})); file.close()
	check(panel.load_preset(OUT.path_join("cycle-v2.json")) == OK and not scene.cycle_enabled and not scene.moon.visible, "V2 migration restores manual light")
	panel.change("time_of_day", 12.0)
	panel.message("时间条验证完成：拖动选择时刻，播放自动循环。")
	await frame("time-controls")
	check(FileAccess.get_file_as_string(panel.PRESET_PATH) == user_before, "Existing user preset remains unchanged")
	file = FileAccess.open(OUT.path_join("day-night-validation.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify({"failures": failures}, "  ")); file.close()
	print("DAY_NIGHT_QA ", JSON.stringify({"failures": failures}))
	quit(0 if failures.is_empty() else 1)
