extends "res://demos/bluebird/tools/qa.gd"

func run(demo: Node3D) -> void:
    output_dir="res://demos/bluebird/qa/aui-vangogh"
    DirAccess.make_dir_recursive_absolute(output_dir)
    check(demo.painterly!=null,"Bluebird painterly adapter is active")
    var renderer=demo.painterly.renderer
    renderer.pressure_stamps_enabled=false
    check(renderer.procreate_shadows_enabled,"Bluebird uses Aui continuous deposition by default")
    demo.set_info_visible(false)
    renderer.procreate_shadows_enabled=false
    renderer.refresh_settings()
    await capture("01-legacy.png")
    renderer.procreate_shadows_enabled=true
    renderer.refresh_settings()
    await capture("02-aui-vangogh.png")
    demo.view_size=16
    demo.target=Vector3(3,0,3)
    demo._update_camera()
    await capture("03-closeup.png")
    demo.reset_view()
    demo.set_evening(true)
    await capture("04-evening.png")
    FileAccess.open(output_dir.path_join("validation.json"),FileAccess.WRITE).store_string(JSON.stringify({"failures":failures,"scope":"Actual Bluebird GPU integration and same-camera comparisons; no full-scene performance claim."},"  "))
    get_tree().quit(0 if failures.is_empty() else 1)
