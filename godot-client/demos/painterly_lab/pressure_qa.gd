extends "res://demos/painterly_lab/aui_qa.gd"
const TIMING=preload("res://rendering/painterly/tests/render_timing.gd")

func run(lab: Node) -> void:
    get_viewport().gui_disable_input=true
    lab.set_process_unhandled_input(false)
    get_window().unresizable=true
    get_window().mode=Window.MODE_WINDOWED
    get_window().size=Vector2i(1280,720)
    get_window().content_scale_size=Vector2i(1280,720)
    output="res://demos/painterly_lab/qa/pressure"
    DirAccess.make_dir_recursive_absolute(output)
    if DisplayServer.get_name()=="headless":
        get_tree().quit(2)
        return
    await settle(lab)
    var r=lab.renderer
    await frame(lab,0,"01-controls.png")
    lab.pressure_controls.hide()
    r.pressure_stamps_enabled=false
    await frame(lab,0,"02-previous-beauty.png")
    var old_mask=await frame(lab,5,"02-previous-mask.png")
    r.pressure_stamps_enabled=true
    var mask=await frame(lab,5,"03-pressure-mask.png")
    await frame(lab,0,"03-pressure-beauty.png")
    check(old_mask.get_data()!=mask.get_data(),"Pressure stamps replace previous grain averaging")
    var again=await frame(lab,5)
    check(again.get_data()==mask.get_data(),"Stable stroke IDs reproduce the same pressure path each frame")
    var bias=r.shadow_bias_m
    r.shadow_bias_m=5
    again=await frame(lab,5)
    r.shadow_bias_m=bias
    var error=0.0
    var samples=0
    for iz in 24:
        for ix in 50:
            var point=Vector3(-8+ix*0.32,0.005,1.7+iz*0.24)
            if occluded(lab,point,(lab.camera.position-point).normalized()):continue
            if lab.camera.unproject_position(point).y<360:continue
            error=maxf(error,absf(sample(mask,lab,point).r-sample(again,lab,point).r))
            samples+=1
    metrics.bias_error=error
    metrics.bias_samples=samples
    check(samples>100 and error<0.005,"Pressure mask is independent of physical shadow bias")
    lab.camera.size=22
    var zoomed=await frame(lab,5)
    var zoom_error=0.0
    var zoom_samples=0
    for iz in 20:
        for ix in 40:
            var point=Vector3(-7+ix*0.35,0.005,2+iz*0.25)
            if occluded(lab,point,(lab.camera.position-point).normalized()):continue
            if lab.camera.unproject_position(point).y<380:continue
            lab.camera.size=24
            var a=sample(mask,lab,point).r
            lab.camera.size=22
            var b=sample(zoomed,lab,point).r
            if a>0.25 and b>0.25:
                zoom_error+=absf(a-b)
                zoom_samples+=1
    metrics.zoom_mean_error=zoom_error/maxi(zoom_samples,1)
    check(zoom_samples>10 and metrics.zoom_mean_error<0.08,"World-space paint stays attached during camera zoom")
    lab.camera.size=14
    await frame(lab,0,"04-pressure-closeup.png")
    lab.camera.size=24
    again=await frame(lab,5)
    check(again.get_data()==mask.get_data(),"Restoring the camera restores the same deposition")
    lab.set_time(1.0)
    var sunset=await frame(lab,5,"05-sunset-mask.png")
    check(sunset.get_data()!=mask.get_data(),"Changed sun projects the gesture in its new direction")
    await frame(lab,0,"05-sunset-beauty.png")
    lab.set_time(0.0)
    await settle(lab)
    await root_checks(lab)
    await stamp_checks(lab)
    var isolated=preload("res://rendering/painterly/default_pressure.tres").duplicate(true)
    var sibling=preload("res://rendering/painterly/default_pressure.tres").duplicate(true)
    isolated.pressure_curve.set_point_value(0,0.1)
    check(absf(sibling.pressure_curve.sample(0)-0.65)<0.001,"Separate renderer resources do not share mutable pressure curves")
    var values=isolated.uniforms()
    var curve_image: Image=values.pressure_curves.get_image()
    check(absf(curve_image.get_pixel(0,0).r-0.1)<0.001,"Edited pressure curves reach the shader LUT")
    await frame(lab,0)
    r.pressure_stamps_enabled=false
    r.refresh_settings()
    metrics.previous_timing=await TIMING.measure(get_viewport())
    r.pressure_stamps_enabled=true
    r.refresh_settings()
    metrics.pressure_timing=await TIMING.measure(get_viewport())
    var report={"checks":checks,"failures":failures,"metrics":metrics,"scope":"Pressure-driven procedural Shape plus original Aui Grain; geometry, integration, contact and main viewport timing. No proprietary bristle physics or wet mix."}
    FileAccess.open(output.path_join("validation.json"),FileAccess.WRITE).store_string(JSON.stringify(report,"  "))
    print("PRESSURE_QA "+JSON.stringify(report))
    get_tree().quit(0 if failures.is_empty() else 1)

func bounds(image_: Image, threshold: float=0.5) -> Rect2i:
    var lo=Vector2i(image_.get_width(),image_.get_height())
    var hi=Vector2i(-1,-1)
    for y in image_.get_height():
        for x in image_.get_width():
            if image_.get_pixel(x,y).r>threshold:
                lo=Vector2i(mini(lo.x,x),mini(lo.y,y))
                hi=Vector2i(maxi(hi.x,x),maxi(hi.y,y))
    return Rect2i(lo,hi-lo+Vector2i.ONE) if hi.x>=lo.x else Rect2i()

func render_preview(viewport: SubViewport) -> Image:
    for i in 3: await RenderingServer.frame_post_draw
    return viewport.get_texture().get_image()

func stamp_checks(lab: Node) -> void:
    var viewport=SubViewport.new()
    viewport.size=Vector2i(512,512)
    viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS
    viewport.use_hdr_2d=true
    add_child(viewport)
    var rect=ColorRect.new()
    rect.size=Vector2(512,512)
    viewport.add_child(rect)
    var mat=ShaderMaterial.new()
    mat.shader=load("res://rendering/painterly/shaders/pressure_preview.gdshader")
    rect.material=mat
    var settings=lab.renderer.pressure_settings.duplicate(true)
    var values: Dictionary=settings.uniforms()
    for key in values: mat.set_shader_parameter(key,values[key])
    mat.set_shader_parameter("procreate_grains",lab.renderer._procreate_grains)
    mat.set_shader_parameter("procreate_parameters",lab.renderer._procreate_parameters)
    mat.set_shader_parameter("procreate_dynamics",lab.renderer._procreate_dynamics)
    mat.set_shader_parameter("preview_mode",1)
    var silhouettes: Array[Rect2i]=[]
    for pressure in [0.2,0.5,0.9]:
        mat.set_shader_parameter("preview_pressure",pressure)
        var img=await render_preview(viewport)
        img.save_png(output.path_join("tip-%d.png"%roundi(pressure*100)))
        silhouettes.append(bounds(img))
    check(silhouettes[0].size.y<silhouettes[1].size.y and silhouettes[1].size.y<silhouettes[2].size.y,"Light / medium / heavy pressure measurably widen the actual tip silhouette")
    check(silhouettes[0].size.x>silhouettes[1].size.x and silhouettes[1].size.x>silhouettes[2].size.x,"Pressure measurably compresses the longitudinal silhouette")
    metrics.tip_extents_px=[]
    for box in silhouettes: metrics.tip_extents_px.append([box.size.x,box.size.y])
    mat.set_shader_parameter("preview_mode",2)
    mat.set_shader_parameter("preview_length",4.0)
    mat.set_shader_parameter("preview_pixel_m",4.0/512.0)
    var stroke=await render_preview(viewport)
    stroke.save_png(output.path_join("single-gesture.png"))
    var section_widths=[]
    for progress in [0.03,0.15,0.45,0.70,0.95]:
        var x=int(progress*511)
        var width=0
        for y in 512:
            if stroke.get_pixel(x,y).r>0.35:width+=1
        section_widths.append(width)
    metrics.stroke_section_widths_px=section_widths
    check(section_widths[1]>section_widths[0] and section_widths[3]>section_widths[4],"Stroke presses wider near the start and visibly narrows during lift-off")
    # Fixed-pressure dry run isolates shape coverage from the pressure curve.
    mat.set_shader_parameter("pressure_constant",0.8)
    mat.set_shader_parameter("pressure_consumption",0.0)
    var dense_a=await render_preview(viewport)
    mat.set_shader_parameter("pressure_stamp_spacing",0.08)
    var dense_b=await render_preview(viewport)
    var mean_error=0.0
    var count=0
    for y in range(180,332,2):
        for x in range(64,448,2):
            mean_error+=absf(dense_a.get_pixel(x,y).r-dense_b.get_pixel(x,y).r)
            count+=1
    metrics.spacing_mean_error=mean_error/count
    check(metrics.spacing_mean_error<0.025,"Changing stamp density preserves deposited opacity")
    mat.set_shader_parameter("pressure_stamp_spacing",0.1)
    mat.set_shader_parameter("preview_length",2.0)
    var short_stroke=await render_preview(viewport)
    mean_error=0.0; count=0
    for y in range(210,300,3):
        for x in range(100,350,2):
            mean_error+=absf(short_stroke.get_pixel(x,y).r-dense_a.get_pixel(x/2,y).r)
            count+=1
    metrics.length_texture_error=mean_error/count
    check(metrics.length_texture_error<0.07,"Extending the path does not stretch the grain")
    # Maximum-width stamps must survive outside the former +-0.5 UV strip.
    mat.set_shader_parameter("pressure_constant",1.0)
    mat.set_shader_parameter("pressure_width_range",Vector2(0.45,1.35))
    var wide=await render_preview(viewport)
    var wide_bounds=bounds(wide,0.35)
    check(wide_bounds.size.y>256,"Pressure silhouette extends beyond the old fixed-width strip without clipping")
    mat.set_shader_parameter("pressure_width_range",Vector2(0.45,1.2))
    mat.set_shader_parameter("pressure_constant",-1.0)
    mat.set_shader_parameter("preview_length",12.0)
    mat.set_shader_parameter("pressure_consumption",0.38)
    var buried_root=await render_preview(viewport)
    mat.set_shader_parameter("preview_root_offset",8.0)
    var visible_root=await render_preview(viewport)
    var buried_width=0
    var visible_width=0
    for y in 512:
        if buried_root.get_pixel(435,y).r>0.35:buried_width+=1
        if visible_root.get_pixel(435,y).r>0.35:visible_width+=1
    check(visible_width>buried_width*1.15,"Large caster pressure starts at the visible rear root, preserving loaded body paint")
    metrics.visible_root_widths_px=[buried_width,visible_width]
    mat.set_shader_parameter("pressure_scale",0.0)
    var empty=await render_preview(viewport)
    check(not bounds(empty,0.001).has_area(),"Zero pressure deposits no pigment")
    mat.set_shader_parameter("pressure_scale",1.0)
    mat.set_shader_parameter("pressure_charge",0.0)
    empty=await render_preview(viewport)
    check(not bounds(empty,0.001).has_area(),"Zero paint charge deposits no pigment independently of pressure")
    viewport.queue_free()
    for i in 3: await RenderingServer.frame_post_draw
