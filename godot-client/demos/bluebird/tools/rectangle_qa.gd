extends "res://demos/bluebird/tools/qa.gd"
const TIMING=preload("res://rendering/painterly/tests/render_timing.gd")
func run(demo: Node3D) -> void:
    get_viewport().gui_disable_input=true;demo.set_process_unhandled_input(false)
    get_window().size=Vector2i(1280,720)
    get_window().content_scale_size=Vector2i(1280,720)
    get_window().content_scale_mode=Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
    output_dir="res://demos/bluebird/qa/rectangle-pressure"
    DirAccess.make_dir_recursive_absolute(output_dir)
    var r=demo.painterly.renderer
    demo.set_info_visible(false);demo.reset_view();demo.set_evening(false)
    r.rectangle_shadows_enabled=false;r.refresh_settings()
    await capture("01-pressure-full.png")
    var metrics={"pressure":await TIMING.measure(get_viewport(),20,120)}
    r.rectangle_shadows_enabled=true;r.refresh_settings()
    await capture("02-rectangle-full.png")
    metrics.rectangle=await TIMING.measure(get_viewport(),20,120)
    var ranges: Array=[];var ordered:=true
    for bands in r.rectangle_layout.bands:
        var spatial: Array=bands.duplicate();spatial.sort_custom(func(a,b):return a.index<b.index)
        for i in range(1,spatial.size()):
            var overlap=1-(spatial[i].center-spatial[i-1].center)/spatial[i].width
            ranges.append(overlap)
            check(overlap>=0.29999 and overlap<=0.60001,"Adjacent rectangles overlap 30–60 percent")
        for i in range(1,bands.size()):ordered=ordered and bands[i].angle>=bands[i-1].angle
    check(ordered,"Rectangles publish in clockwise root-angle order")
    check(r._procreate_grains!=null,"Original pressure brush Grain array is available")
    metrics.overlap_min=ranges.min() if not ranges.is_empty() else null
    metrics.overlap_max=ranges.max() if not ranges.is_empty() else null
    demo.view_size=16;demo.target=Vector3(3,0,3);demo._update_camera()
    r.rectangle_shadows_enabled=false;r.refresh_settings();await capture("03-pressure-root.png")
    r.rectangle_shadows_enabled=true;r.refresh_settings();await capture("04-rectangle-root.png")
    var before=r.rectangle_layout.texture.get_image().get_data()
    r.refresh_settings()
    check(before==r.rectangle_layout.texture.get_image().get_data(),"Static layout remains stable")
    r.rectangle_debug=true;r.refresh_settings();await capture("05-rectangles.png")
    r.rectangle_debug=false;r.rectangle_settings.painting_revision+=1;r.refresh_settings()
    await capture("06-random-root.png")
    check(before!=r.rectangle_layout.texture.get_image().get_data(),"Repaint changes the stable random layout")
    var report={"failures":failures,"metrics":metrics,"scope":"First visual draft. No automatic aesthetic iteration; screenshots await user discussion."}
    FileAccess.open(output_dir.path_join("validation.json"),FileAccess.WRITE).store_string(JSON.stringify(report,"  "))
    print("RECTANGLE_QA "+JSON.stringify(report))
    get_tree().quit(0 if failures.is_empty() else 1)
