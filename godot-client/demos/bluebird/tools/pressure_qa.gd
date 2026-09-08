extends "res://demos/bluebird/tools/qa.gd"
const TIMING=preload("res://rendering/painterly/tests/render_timing.gd")

func run(demo: Node3D) -> void:
    get_viewport().gui_disable_input=true
    demo.set_process_unhandled_input(false)
    var window=get_window()
    window.mode=Window.MODE_WINDOWED
    window.unresizable=true
    window.size=Vector2i(1280,720)
    window.content_scale_size=Vector2i(1280,720)
    window.content_scale_mode=Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
    var vulkan=OS.get_cmdline_user_args().has("--timing-vulkan")
    output_dir="res://demos/bluebird/qa/pressure-vulkan" if vulkan else "res://demos/bluebird/qa/pressure"
    DirAccess.make_dir_recursive_absolute(output_dir)
    check(demo.painterly!=null,"Bluebird painterly adapter is active")
    var renderer=demo.painterly.renderer
    check(renderer.pressure_stamps_enabled and renderer.procreate_shadows_enabled,"Pressure deposition is the Bluebird default")
    demo.set_info_visible(false)
    renderer.debug_view=0
    demo.debug_menu.select(0)
    demo.set_grading(true)
    demo.reset_view()
    demo.set_evening(false)
    var metrics={}
    renderer.pressure_stamps_enabled=false
    renderer.refresh_settings()
    await capture("01-previous.png")
    metrics.previous=await TIMING.measure(get_viewport(),45,120)
    renderer.pressure_stamps_enabled=true
    renderer.refresh_settings()
    await capture("02-pressure.png")
    metrics.pressure=await TIMING.measure(get_viewport(),45,120)
    # Reverse-order samples reduce first-run thermal/cache bias.
    metrics.pressure_repeat=await TIMING.measure(get_viewport(),20,120)
    renderer.pressure_stamps_enabled=false
    renderer.refresh_settings()
    metrics.previous_repeat=await TIMING.measure(get_viewport(),20,120)
    demo.view_size=16
    demo.target=Vector3(3,0,3)
    demo._update_camera()
    await capture("03-previous-closeup.png")
    renderer.pressure_stamps_enabled=true
    renderer.refresh_settings()
    await capture("04-pressure-closeup.png")
    demo.reset_view()
    demo.set_evening(true)
    await capture("05-evening.png")
    check(renderer.debug_view==0 and renderer.enabled,"Beauty channel and painterly processing stayed fixed during capture")
    check(get_viewport().get_visible_rect().size==Vector2(1280,720),"Fixed 1280 x 720 viewport during comparisons")
    var report={"failures":failures,"timing":metrics,"backend":"Vulkan (MoltenVK)" if vulkan else "Metal",
        "scope":"Same-camera Bluebird integration; main viewport GPU/render CPU/wall frame timings measured separately. GPU null means unavailable."}
    FileAccess.open(output_dir.path_join("validation.json"),FileAccess.WRITE).store_string(JSON.stringify(report,"  "))
    print("BLUEBIRD_PRESSURE_QA "+JSON.stringify(report))
    get_tree().quit(0 if failures.is_empty() else 1)
