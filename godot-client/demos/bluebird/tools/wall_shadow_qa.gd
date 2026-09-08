extends "res://demos/bluebird/tools/qa.gd"
var checks: Array=[]

func verify(ok: bool,message: String) -> void:
    checks.append({"passed":ok,"message":message});check(ok,message)

func frame(viewport: Viewport) -> Image:
    await get_tree().process_frame
    for i in 4:await RenderingServer.frame_post_draw
    return viewport.get_texture().get_image()

func changed(a: Image,b: Image) -> int:
    var count_=0
    for y in a.get_height():
        for x in a.get_width():
            if absf(a.get_pixel(x,y).r-b.get_pixel(x,y).r)>0.015:count_+=1
    return count_

func peak(image_: Image) -> float:
    var value=0.0
    for y in range(0,image_.get_height(),2):
        for x in range(0,image_.get_width(),2):value=maxf(value,image_.get_pixel(x,y).r)
    return value

func run(demo: Node3D) -> void:
    if DisplayServer.get_name()=="headless":get_tree().quit(2);return
    get_viewport().gui_disable_input=true;demo.set_process_unhandled_input(false)
    get_window().size=Vector2i(1280,720);get_window().content_scale_size=Vector2i(1280,720)
    get_window().content_scale_mode=Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
    output_dir="res://demos/bluebird/qa/wall-shadow"
    DirAccess.make_dir_recursive_absolute(output_dir)
    var r=demo.painterly.renderer
    demo.set_info_visible(false);demo.art_debugger.hide();demo.set_evening(false)
    demo.painterly.highlights.settings.enabled=false;demo.painterly.highlights.refresh()
    var walls=0
    for record in demo.painterly.records:
        if record.architecture and record.inputs.map_plane!=0:
            walls+=1;verify(record.inputs.painterly_shadows,"Wall receives oil shadow: "+str(record.part.name))
    verify(walls>20,"Building wall surfaces are registered for brush shadows")
    demo.target=Vector3(5,1.8,3);demo.view_size=11;demo._update_camera()
    var sun=Vector3(1,0.35,0.4).normalized()
    demo.sun.look_at(demo.sun.global_position-sun,Vector3.UP)
    demo.painterly.sync_lighting(demo)
    r.rectangle_shadows_enabled=true;r.refresh_settings()
    await capture("01-painted-wall.png")
    # Reproduce the former wall opt-out on the same materials and light snapshot.
    for record in demo.painterly.records:
        if record.architecture and record.inputs.map_plane!=0:record.material.set_shader_parameter("painterly_shadows",false)
    await capture("02-previous-physical-wall.png")
    for record in demo.painterly.records:
        if record.architecture:record.material.set_shader_parameter("painterly_shadows",true)
    # Remove architecture proxies/depth casters only in the fixture so measured
    # wall changes can be attributed to lamps, rather than the building itself.
    demo.painterly.architecture_brush_volumes.clear()
    for record in r._surfaces:
        if record.mesh not in demo.painterly.lamp_casters:
            record.inputs.casts_shadow=false;r.refresh_surface_inputs(record.mesh)
    demo.painterly.set_lamp_shadows(true)
    r.debug_view=4;r.refresh_settings();await capture("03-lamp-physical-mask.png")
    var physical=get_viewport().get_texture().get_image()
    r.debug_view=5;r.refresh_settings();await capture("04-lamp-painted-mask.png")
    var painted=get_viewport().get_texture().get_image()
    verify(changed(physical,painted)>100,"Actual scene lamp mask differs from physical mesh silhouette")
    demo.painterly.set_lamp_shadows(false)
    await capture("05-lamps-disabled-mask.png")
    verify(changed(painted,get_viewport().get_texture().get_image())>100,"Lamp toggle removes projected brush contribution")

    # The production spatial shader on a vertical quad, deliberately using map
    # plane XZ: the old world-up/mapped-normal gates must not reject this face.
    var viewport=SubViewport.new();viewport.size=Vector2i(512,512);viewport.own_world_3d=true
    viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS;add_child(viewport)
    var camera=Camera3D.new();camera.projection=Camera3D.PROJECTION_ORTHOGONAL;camera.size=8
    viewport.add_child(camera)
    var wall=MeshInstance3D.new();var quad=QuadMesh.new();quad.size=Vector2(8,8);wall.mesh=quad
    viewport.add_child(wall)
    var mat: ShaderMaterial=r._surfaces[0].material.duplicate();mat.shader=PainterlyRenderer.SURFACE_SHADER
    wall.material_override=mat
    mat.set_shader_parameter("painterly_shadows",true);mat.set_shader_parameter("capture_valid",false)
    mat.set_shader_parameter("debug_view",5);mat.set_shader_parameter("receiver_stroke_id",-1.0)
    mat.set_shader_parameter("map_plane",0);mat.set_shader_parameter("alpha_cutoff",0.0)
    mat.set_shader_parameter("use_albedo_texture",false);mat.set_shader_parameter("brush_caster_count",1)
    var lows=PackedVector4Array();lows.resize(32)
    var highs=PackedVector4Array();highs.resize(32)
    var box=AABB(Vector3(-0.3,0,2),Vector3(0.6,4,0.6))
    var original_normal=Vector3(0,0,1)
    for orientation in [0,1,2]:
        var basis_=Basis.IDENTITY
        if orientation==1:basis_=Basis(Vector3.UP,PI/2)
        elif orientation==2:basis_=Basis(Vector3.RIGHT,deg_to_rad(25))
        wall.transform=Transform3D(basis_,basis_*Vector3(0,2,0))
        camera.position=basis_*Vector3(0,2,10);camera.look_at(wall.position,basis_*Vector3.UP)
        var transformed=Transform3D(basis_,Vector3.ZERO)*box
        lows[0]=Vector4(transformed.position.x,transformed.position.y,transformed.position.z,40)
        highs[0]=Vector4(transformed.end.x,transformed.end.y,transformed.end.z,0)
        mat.set_shader_parameter("brush_caster_min",lows);mat.set_shader_parameter("brush_caster_max",highs)
        mat.set_shader_parameter("sun_direction",basis_*Vector3(0,0.5,1).normalized())
        for mode in [false,true]:
            var label="plane-%d-%s"%[orientation,"rectangle" if mode else "pressure"]
            mat.set_shader_parameter("rectangle_shadows_enabled",mode)
            var ink=await frame(viewport);ink.save_png(output_dir.path_join(label+".png"))
            verify(peak(ink)>0.2,label+": non-horizontal face receives pressure brush")
            var same=await frame(viewport)
            verify(changed(ink,same)==0,label+": fixed view gives stable surface coverage")
            var points: Array=[];var values: Array=[]
            for iy in 28:
                for ix in 9:
                    var point=basis_*Vector3(-0.4+ix*0.1,-0.4+iy*0.12,0)
                    var pixel=Vector2i(camera.unproject_position(point))
                    var value=ink.get_pixelv(pixel).r
                    if value>0.15:points.append(point);values.append(value)
            camera.position=basis_*Vector3(3,2,10);camera.look_at(wall.position,basis_*Vector3.UP)
            var orbit=await frame(viewport);var error_=0.0
            for i in points.size():error_+=absf(orbit.get_pixelv(Vector2i(camera.unproject_position(points[i]))).r-values[i])
            verify(points.size()>10 and error_/maxi(points.size(),1)<0.09,label+": camera orbit preserves paint at reprojected wall points")
            camera.position=basis_*Vector3(0,2,10);camera.look_at(wall.position,basis_*Vector3.UP)
            mat.set_shader_parameter("sun_direction",basis_*Vector3(0.35,0.5,1).normalized())
            var moved=await frame(viewport)
            verify(changed(ink,moved)>100,label+": sun direction moves the wall projection")
            mat.set_shader_parameter("sun_direction",basis_*Vector3(0,0.5,1).normalized())
            mat.set_shader_parameter("pressure_scale",0.0)
            var empty=await frame(viewport)
            verify(peak(empty)<0.005,label+": zero pressure removes wall shadow; no physical fallback")
            mat.set_shader_parameter("pressure_scale",1.0)
            mat.set_shader_parameter("sun_direction",-(basis_*original_normal))
            empty=await frame(viewport)
            verify(peak(empty)<0.005,label+": backlit face has no independent brush contribution")
            mat.set_shader_parameter("sun_direction",basis_*Vector3(0,0.5,1).normalized())
    await root_boundary_checks(viewport,wall,camera,mat)
    viewport.queue_free()
    var report={"checks":checks,"failures":failures,"engine":Engine.get_version_info().string,"renderer":RenderingServer.get_current_rendering_method()}
    FileAccess.open(output_dir.path_join("validation.json"),FileAccess.WRITE).store_string(JSON.stringify(report,"  "))
    print("WALL_SHADOW_QA "+JSON.stringify(report));get_tree().quit(0 if failures.is_empty() else 1)

func root_boundary_checks(viewport: SubViewport,wall: MeshInstance3D,camera: Camera3D,mat: ShaderMaterial) -> void:
    wall.transform=Transform3D.IDENTITY
    camera.position=Vector3(0,0,10);camera.look_at(Vector3.ZERO,Vector3.UP)
    mat.set_shader_parameter("sun_direction",Vector3(0,0.5,1).normalized())
    var lows=PackedVector4Array([Vector4(-1,-2,-0.2,40)]);lows.resize(32)
    var highs=PackedVector4Array([Vector4(1,2,0.2,0)]);highs.resize(32)
    mat.set_shader_parameter("brush_caster_min",lows);mat.set_shader_parameter("brush_caster_max",highs)
    # Known depth silhouette cuts through a crossing proxy's root. The actual
    # production shadow_at() reads it; no duplicate CPU projection algorithm.
    var depth=Image.create(64,64,false,Image.FORMAT_RGF)
    depth.fill(Color(0.9,0,0,1))
    for y in range(45,64):
        for x in range(0,32):depth.set_pixel(x,y,Color(0.1,0,0,1))
    mat.set_shader_parameter("shadow_depth",ImageTexture.create_from_image(depth))
    mat.set_shader_parameter("light_view",Transform3D(Basis.IDENTITY,Vector3(0,0,-10)))
    mat.set_shader_parameter("light_span",8.0);mat.set_shader_parameter("light_near",0.0)
    mat.set_shader_parameter("light_far",20.0)
    for mode in [false,true]:
        var label="root-boundary-"+("rectangle" if mode else "pressure")
        mat.set_shader_parameter("rectangle_shadows_enabled",mode)
        mat.set_shader_parameter("capture_valid",false)
        mat.set_shader_parameter("debug_view",5)
        var phantom=await frame(viewport)
        phantom.save_png(output_dir.path_join(label+"-unoccluded.png"))
        verify(peak(phantom)<0.005,label+": crossing proxy cannot paint a root on an unoccluded wall")
        mat.set_shader_parameter("capture_valid",true)
        mat.set_shader_parameter("debug_view",4)
        var physical=await frame(viewport)
        physical.save_png(output_dir.path_join(label+"-boundary.png"))
        mat.set_shader_parameter("debug_view",5)
        var clipped=await frame(viewport)
        clipped.save_png(output_dir.path_join(label+"-clipped.png"))
        var spill=0;var retained=0
        for y in 512:
            for x in 512:
                if clipped.get_pixel(x,y).r>0.01:
                    if physical.get_pixel(x,y).r<0.001:spill+=1
                    else:retained+=1
        verify(spill==0,label+": no root pixels cross the captured building boundary")
        verify(retained>50,label+": valid brush coverage survives inside the boundary")
        mat.set_shader_parameter("pressure_scale",0.0)
        var empty=await frame(viewport)
        verify(peak(empty)<0.005,label+": boundary clips paint without filling the physical silhouette")
        mat.set_shader_parameter("pressure_scale",1.0)
