extends "res://demos/bluebird/tools/qa.gd"
## Actual GPU coverage checks share the production caster and pressure shaders.
var checks: Array = []

func verify(ok: bool, message: String) -> void:
    checks.append({"passed":ok,"message":message})
    if not OS.get_cmdline_user_args().has("--root-baseline"):check(ok,message)

func frame(viewport: SubViewport) -> Image:
    await get_tree().process_frame
    for i in 4:await RenderingServer.frame_post_draw
    return viewport.get_texture().get_image()

func run(demo: Node3D) -> void:
    if DisplayServer.get_name()=="headless":
        push_error("Shadow root validation requires a real GPU viewport")
        get_tree().quit(2)
        return
    get_viewport().gui_disable_input=true;demo.set_process_unhandled_input(false)
    get_window().size=Vector2i(1280,720);get_window().content_scale_size=Vector2i(1280,720)
    get_window().content_scale_mode=Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
    var baseline=OS.get_cmdline_user_args().has("--root-baseline")
    output_dir="res://demos/bluebird/qa/shadow-root/"+("before" if baseline else "after")
    DirAccess.make_dir_recursive_absolute(output_dir)
    var r=demo.painterly.renderer
    demo.set_info_visible(false);demo.set_evening(false);demo.reset_view()
    demo.art_debugger.hide()
    for mode in [false,true]:
        r.rectangle_shadows_enabled=mode;r.refresh_settings()
        await capture(("rectangle" if mode else "pressure")+"-full.png")
        demo.view_size=16;demo.target=Vector3(3,0,3);demo._update_camera()
        await capture(("rectangle" if mode else "pressure")+"-root.png")
        demo.reset_view()
    var viewport=SubViewport.new();viewport.size=Vector2i(800,480);viewport.use_hdr_2d=true
    viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS;add_child(viewport)
    var rect=ColorRect.new();rect.size=viewport.size;viewport.add_child(rect)
    var shader=Shader.new()
    shader.code='shader_type canvas_item;\n#include "res://rendering/painterly/shaders/shadow.gdshaderinc"\nuniform vec3 test_sun=vec3(-0.70710678,0.70710678,0);\nuniform bool single_stroke=false;\nvoid fragment(){if(single_stroke){vec2 uv=vec2((UV.x*6.0-1.0)/4.0,(UV.y-0.5)*2.0+0.5);COLOR=vec4(vec3(aui_pressure_deposit(uv,4.0,1.0,vec2(40,2),0.0075,0.0).x),1.0);}else{vec3 p=vec3(UV.x*10.0-3.0,0.0,UV.y*6.0-3.0);COLOR=vec4(vec3(cast_brush_shadow(p,normalize(test_sun)).z),1.0);}}'
    var mat=ShaderMaterial.new();mat.shader=shader;rect.material=mat
    var source: ShaderMaterial=r._surfaces[0].material
    for param in shader.get_shader_uniform_list():
        var value=source.get_shader_parameter(param.name)
        if value!=null:mat.set_shader_parameter(param.name,value)
    mat.set_shader_parameter("receiver_stroke_id",-1.0)
    var lo=PackedVector4Array([Vector4(-1,0,-1,40)]);lo.resize(32)
    var hi=PackedVector4Array([Vector4(1,2,1,0)]);hi.resize(32)
    mat.set_shader_parameter("brush_caster_count",1)
    mat.set_shader_parameter("brush_caster_min",lo);mat.set_shader_parameter("brush_caster_max",hi)
    mat.set_shader_parameter("shadow_length_range",Vector2.ONE)
    var layout=load("res://rendering/painterly/rectangle_brushes/layout.gd").new()
    for diagonal in [false,true]:
        var sun=Vector3(-1,1,-0.65 if diagonal else 0).normalized()
        mat.set_shader_parameter("test_sun",sun)
        layout.rebuild(lo,hi,1,sun,0.85,r.rectangle_settings)
        mat.set_shader_parameter("rectangle_bands",layout.texture)
        mat.set_shader_parameter("rectangle_band_counts",layout.counts)
        for mode in [false,true]:
            mat.set_shader_parameter("rectangle_shadows_enabled",mode)
            mat.set_shader_parameter("pressure_charge",1.0)
            mat.set_shader_parameter("pressure_scale",1.0)
            var name_=("diagonal" if diagonal else "axis")+("-rectangle" if mode else "-pressure")
            var ink=await frame(viewport);ink.save_png(output_dir.path_join(name_+".png"))
            var upstream=0.0;var contact=0.0;var samples=0
            for y in range(1,479,2):
                for x in range(1,799,2):
                    var p=Vector2((x+0.5)/80.0-3.0,(y+0.5)/80.0-3.0)
                    if p.x< -1.025 and absf(p.y)<1.4:upstream=maxf(upstream,ink.get_pixel(x,y).r)
                    if p.x>1.02 and p.x<1.15 and absf(p.y)<0.65:
                        contact+=ink.get_pixel(x,y).r;samples+=1
            verify(upstream<0.002,name_+": no exposed paint ahead of the building root")
            verify(contact/maxi(samples,1)>0.2,name_+": brush still meets the shaded wall")
            var repeat=await frame(viewport)
            verify(ink.get_data()==repeat.get_data(),name_+": static coverage is stable")
            for zero in ["pressure_charge","pressure_scale"]:
                mat.set_shader_parameter(zero,0.0)
                var empty=await frame(viewport)
                var peak=0.0
                for y in range(0,480,4):
                    for x in range(0,800,4):peak=maxf(peak,empty.get_pixel(x,y).r)
                verify(peak<0.002,name_+": "+zero+" zero leaves no independent root fill")
                mat.set_shader_parameter(zero,1.0)
    lo[0].y=3.0;hi[0].y=5.0
    mat.set_shader_parameter("brush_caster_min",lo);mat.set_shader_parameter("brush_caster_max",hi)
    var raised_sun=Vector3(-1,1,0).normalized()
    mat.set_shader_parameter("test_sun",raised_sun)
    layout.rebuild(lo,hi,1,raised_sun,0.85,r.rectangle_settings)
    mat.set_shader_parameter("rectangle_bands",layout.texture)
    mat.set_shader_parameter("rectangle_band_counts",layout.counts)
    for mode in [false,true]:
        mat.set_shader_parameter("rectangle_shadows_enabled",mode)
        var raised=await frame(viewport)
        raised.save_png(output_dir.path_join("raised-"+("rectangle" if mode else "pressure")+".png"))
        var below_peak=0.0;var projected_peak=0.0
        for y in range(160,320,2):
            for x in range(160,320,2):below_peak=maxf(below_peak,raised.get_pixel(x,y).r)
            for x in range(440,600,2):projected_peak=maxf(projected_peak,raised.get_pixel(x,y).r)
        verify(below_peak<0.002,"Raised caster has no false contact below it, rectangle="+str(mode))
        verify(projected_peak>0.2,"Raised caster retains its displaced brush shadow, rectangle="+str(mode))
    mat.set_shader_parameter("single_stroke",true)
    var stroke=await frame(viewport);stroke.save_png(output_dir.path_join("rounded-start.png"))
    var center_start=800;var side_start=800
    for x in 800:
        if stroke.get_pixel(x,240).r>0.08:center_start=mini(center_start,x)
        if stroke.get_pixel(x,295).r>0.08:side_start=mini(side_start,x)
    verify(center_start<132,"Complete rounded tip extends before path start without a UV cut")
    verify(side_start>center_start+5,"Brush start curves back toward its sides")
    viewport.queue_free()
    FileAccess.open(output_dir.path_join("validation.json"),FileAccess.WRITE).store_string(JSON.stringify({"checks":checks,"failures":failures,"engine":Engine.get_version_info().string,"renderer":RenderingServer.get_current_rendering_method()},"  "))
    print("SHADOW_ROOT_QA "+JSON.stringify({"checks":checks,"failures":failures}))
    get_tree().quit(0 if failures.is_empty() else 1)
