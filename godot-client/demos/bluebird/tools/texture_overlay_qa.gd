extends "res://demos/bluebird/tools/qa.gd"

func run(demo: Node3D) -> void:
    get_viewport().gui_disable_input=true;demo.set_process_unhandled_input(false)
    get_window().size=Vector2i(1280,720);get_window().content_scale_size=Vector2i(1280,720)
    get_window().content_scale_mode=Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
    output_dir="res://demos/bluebird/qa/texture-overlay"
    DirAccess.make_dir_recursive_absolute(output_dir)
    var r=demo.painterly.renderer
    demo.set_info_visible(false);demo.reset_view();demo.set_evening(false)
    r.rectangle_shadows_enabled=true;r.rectangle_settings.painting_revision=0
    r.rectangle_settings.texture_overlay_enabled=false;r.refresh_settings()
    await capture("01-pressure-full.png")
    r.rectangle_settings.texture_overlay_enabled=true;r.refresh_settings()
    await capture("02-overlay-full.png")
    demo.view_size=16;demo.target=Vector3(3,0,3);demo._update_camera()
    r.rectangle_settings.texture_overlay_enabled=false;r.refresh_settings()
    await capture("03-pressure-root.png")
    var before=get_viewport().get_texture().get_image().get_data()
    r.rectangle_settings.texture_overlay_enabled=true;r.refresh_settings()
    await capture("04-overlay-root.png")
    check(before!=get_viewport().get_texture().get_image().get_data(),"Oil texture overlay changes visible pigment")
    r.debug_view=5;r.rectangle_settings.texture_overlay_enabled=false;r.refresh_settings()
    await capture("05-pressure-mask.png")
    var mask=get_viewport().get_texture().get_image().get_data()
    r.rectangle_settings.texture_overlay_enabled=true;r.refresh_settings()
    await capture("06-overlay-mask.png")
    check(mask==get_viewport().get_texture().get_image().get_data(),"Texture overlay preserves every pressure-mask pixel")
    var viewport=SubViewport.new();viewport.size=Vector2i(100,8);viewport.use_hdr_2d=true
    viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS;add_child(viewport)
    var rect=ColorRect.new();rect.size=Vector2(100,8);viewport.add_child(rect)
    var shader=Shader.new()
    shader.code='shader_type canvas_item;\n#include "res://rendering/painterly/shaders/rectangle_overlay_geometry.gdshaderinc"\nvoid fragment(){float i=floor(UV.x*5.0);float ratio=i<0.5?0.1:(i<1.5?0.5:(i<2.5?0.8:(i<3.5?1.2:4.0)));float length_=rectangle_overlay_length(0.85,3.0,0.85*3.0*ratio);COLOR=vec4(vec3(length_/(0.85*3.0*1.2)),1.0);}'
    var material=ShaderMaterial.new();material.shader=shader;rect.material=material
    for i in 4:await RenderingServer.frame_post_draw
    var lengths=viewport.get_texture().get_image()
    var measured: Array=[]
    for i in 5:
        var actual=lengths.get_pixel(i*20+10,4).r*1.2
        measured.append(actual)
        check(absf(actual-[0.5,0.5,0.8,1.2,1.2][i])<0.002,"GPU overlay length clamps to 50–120 percent, case %d"%i)
    viewport.queue_free()
    check(r._brush_native_aspects[0]>0.0,"Native image aspect is preserved separately from texture-array storage")
    r.debug_view=0;r.refresh_settings()
    var report={"failures":failures,"native_brush_aspects":Array(r._brush_native_aspects).slice(0,r.shadow_brush_textures.size()),
        "gpu_length_scales":measured,"overlay_count_per_rectangle":1,"scope":"First overlay comparison, no automatic aesthetic adjustment. Coverage invariant and shared GPU geometry clamp checked."}
    FileAccess.open(output_dir.path_join("validation.json"),FileAccess.WRITE).store_string(JSON.stringify(report,"  "))
    print("TEXTURE_OVERLAY_QA "+JSON.stringify(report))
    get_tree().quit(0 if failures.is_empty() else 1)
