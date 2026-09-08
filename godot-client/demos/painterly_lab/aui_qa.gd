extends "res://demos/painterly_lab/qa.gd"

func run(lab: Node) -> void:
    output="res://demos/painterly_lab/qa/aui-vangogh"
    DirAccess.make_dir_recursive_absolute(output)
    if DisplayServer.get_name()=="headless":
        get_tree().quit(2)
        return
    await settle(lab)
    var r=lab.renderer
    check(r.procreate_shadows_enabled and r._procreate_grains.get_layers()==3,"Three original Aui grains loaded")
    for i in 3:
        check(r._procreate_grains.get_layer_data(i).has_mipmaps(),"Grain %d has mipmaps"%i)
    var after=await frame(lab,5,"02-grain-mask.png")
    await frame(lab,0,"02-grain-beauty.png")
    r.procreate_shadows_enabled=false
    await frame(lab,0,"01-legacy-beauty.png")
    var before=await frame(lab,5,"01-legacy-mask.png")
    check(before.get_data()!=after.get_data(),"Continuous grain deposition replaces finished stroke alpha")
    r.procreate_shadows_enabled=true
    var again=await frame(lab,5)
    check(again.get_data()==after.get_data(),"Seeded deposition is deterministic across frames and toggles")
    var bias=r.shadow_bias_m
    r.shadow_bias_m=5
    again=await frame(lab,5)
    var error=0.0
    var samples=0
    for iz in 24:
        for ix in 50:
            var point=Vector3(-8+ix*0.32,0.005,1.7+iz*0.24)
            if occluded(lab,point,(lab.camera.position-point).normalized()):continue
            if lab.camera.unproject_position(point).y<350:continue
            error=maxf(error,absf(sample(after,lab,point).r-sample(again,lab,point).r))
            samples+=1
    metrics.bias_samples=samples
    metrics.bias_error=error
    check(samples>100 and error<0.005,"Visible brush receiver is independent of physical depth bias")
    r.shadow_bias_m=bias
    lab.camera.size=14
    await frame(lab,0,"03-grain-closeup.png")
    lab.camera.size=24
    lab.set_time(1.0)
    var sunset=await frame(lab,5,"04-sunset-mask.png")
    check(sunset.get_data()!=after.get_data(),"Sun movement changes projected deposition")
    await frame(lab,0,"04-sunset-beauty.png")
    lab.set_time(0.0)
    await settle(lab)
    await root_checks(lab)
    var report={"checks":checks,"failures":failures,"metrics":metrics,"scope":"Original grain adaptation; bundled Procreate Shape and proprietary wet mixing unavailable. Real GPU captures and root isolation checks."}
    FileAccess.open(output.path_join("validation.json"),FileAccess.WRITE).store_string(JSON.stringify(report,"  "))
    print(JSON.stringify(report))
    get_tree().quit(0 if failures.is_empty() else 1)

func root_checks(lab: Node) -> void:
    var viewport=SubViewport.new()
    viewport.size=Vector2i(768,768)
    viewport.own_world_3d=true
    viewport.use_hdr_2d=true
    viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS
    add_child(viewport)
    var camera=Camera3D.new()
    camera.projection=Camera3D.PROJECTION_ORTHOGONAL
    camera.size=12
    camera.position=Vector3(0,12,2)
    viewport.add_child(camera)
    camera.look_at(Vector3(0,0,2),Vector3.FORWARD)
    var mesh=MeshInstance3D.new()
    var plane=PlaneMesh.new()
    plane.size=Vector2(16,16)
    mesh.mesh=plane
    viewport.add_child(mesh)
    var mat: ShaderMaterial=lab.renderer._surfaces[0].material.duplicate()
    mesh.material_override=mat
    mat.set_shader_parameter("debug_view",5)
    mat.set_shader_parameter("receiver_stroke_id",-1.0)
    mat.set_shader_parameter("brush_caster_count",1)
    var lows=PackedVector4Array()
    var highs=PackedVector4Array()
    lows.resize(32)
    highs.resize(32)
    var minimum=1.0
    var count=0
    var leaks=0
    for height in [0.0,0.55]:
        mesh.position.y=height
        lows[0]=Vector4(-1,height,-1,23)
        highs[0]=Vector4(1,height+4,1,0)
        mat.set_shader_parameter("brush_caster_min",lows)
        mat.set_shader_parameter("brush_caster_max",highs)
        for axis in [Vector2(0,1),Vector2(1,1).normalized(),Vector2(-1,0)]:
            mat.set_shader_parameter("sun_direction",Vector3(-axis.x,1,-axis.y).normalized())
            for seed in [17.0,43.0]:
                mat.set_shader_parameter("shadow_brush_seed",seed)
                for i in 3: await RenderingServer.frame_post_draw
                var img=viewport.get_texture().get_image()
                var side=Vector2(-axis.y,axis.x)
                var half_width=absf(side.x)+absf(side.y)
                for lane in 31:
                    var origin=side*lerpf(-half_width*0.9,half_width*0.9,lane/30.0)
                    var safe=Vector2(axis.x if absf(axis.x)>0.0001 else 0.0001,axis.y if absf(axis.y)>0.0001 else 0.0001)
                    var a=(Vector2(-1,-1)-origin)/safe
                    var b=(Vector2(1,1)-origin)/safe
                    var leave=minf(maxf(a.x,b.x),maxf(a.y,b.y))
                    for distance in [0.04,0.12,0.16]:
                        var point=origin+axis*(leave+distance)
                        var px=camera.unproject_position(Vector3(point.x,height,point.y)).round()
                        minimum=minf(minimum,img.get_pixel(int(px.x),int(px.y)).r)
                        count+=1
                var front=-axis*(1.0/maxf(absf(axis.x),absf(axis.y))+0.15)
                var px=camera.unproject_position(Vector3(front.x,height,front.y)).round()
                if img.get_pixel(int(px.x),int(px.y)).r>0.01:leaks+=1
                if height==0.0 and axis==Vector2(0,1) and seed==17.0:
                    img.save_png(output.path_join("05-isolated-root-mask.png"))
    metrics.root_samples=count
    metrics.minimum_root_coverage=minimum
    check(minimum>0.995,"Contact remains solid across grain gaps, light directions, seeds and receiver heights")
    check(leaks==0,"Root fill never spills onto the sun-facing side")
    # Raised caster leaves genuinely empty space below itself.
    mesh.position.y=0
    lows[0]=Vector4(-1,3,-1,23)
    highs[0]=Vector4(1,7,1,0)
    mat.set_shader_parameter("brush_caster_min",lows)
    mat.set_shader_parameter("brush_caster_max",highs)
    mat.set_shader_parameter("sun_direction",Vector3(0,1,-1).normalized())
    for i in 3: await RenderingServer.frame_post_draw
    var img=viewport.get_texture().get_image()
    var px=camera.unproject_position(Vector3(0,0,0)).round()
    check(img.get_pixel(int(px.x),int(px.y)).r<0.01,"Raised caster does not create a false contact bridge")
    viewport.queue_free()
