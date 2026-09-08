extends Node
## Actual GPU integration checks against independent box ray intersections.
var failures: Array[String]=[]
var checks:=0
var metrics: Dictionary={}
var output="res://demos/painterly_lab/qa"

func check(ok: bool,message: String) -> void:
    checks+=1
    if not ok:
        failures.append(message)
        push_error(message)

func settle(lab: Node) -> void:
    for i in 180:
        await get_tree().process_frame
        if not lab.renderer.is_capture_pending() and lab.renderer.capture_count>0:
            break
    for i in 3:
        await RenderingServer.frame_post_draw

func frame(lab: Node,mode: int,filename: String="") -> Image:
    lab.renderer.debug_view=mode
    lab.debug_select.select(mode)
    lab.renderer.refresh_settings()
    await settle(lab)
    var img=get_viewport().get_texture().get_image()
    if filename!="":
        check(img.save_png(output.path_join(filename))==OK,"Save "+filename)
    return img

func sample(img: Image,lab: Node,point: Vector3) -> Color:
    var px: Vector2=lab.camera.unproject_position(point)-Vector2(0.5,0.5)
    var x=clampi(floori(px.x),0,img.get_width()-2)
    var y=clampi(floori(px.y),0,img.get_height()-2)
    return img.get_pixel(x,y).lerp(img.get_pixel(x+1,y),px.x-floorf(px.x)).lerp(
        img.get_pixel(x,y+1).lerp(img.get_pixel(x+1,y+1),px.x-floorf(px.x)),px.y-floorf(px.y))

func occluded(lab: Node,p: Vector3,d: Vector3) -> bool:
    for record in lab.renderer._surfaces:
        if record.mesh==lab.ground or not record.inputs.casts_shadow or not record.mesh.visible:
            continue
        var inv: Transform3D=record.mesh.global_transform.affine_inverse()
        var hit=record.mesh.mesh.get_aabb().intersects_ray(inv*p,inv.basis*d)
        if hit!=null:
            return true
    return false

func run(lab: Node) -> void:
    if DisplayServer.get_name()=="headless":
        push_error("GPU QA requires a real display; headless cannot validate textures.")
        get_tree().quit(2)
        return
    await settle(lab)
    check(lab.renderer.capture_count>0,"Independent depth capture completed")
    check(lab.camera.projection==Camera3D.PROJECTION_ORTHOGONAL,"Orthographic projection")
    check(lab.renderer._surfaces.size()==10,"Ten test receivers registered")
    await frame(lab,0,"01-noon.png")
    lab.camera.size=15
    await frame(lab,0,"10-stroke-closeup.png")
    lab.camera.size=24
    lab.renderer.enabled=false
    await frame(lab,0,"02-unprocessed.png")
    lab.renderer.enabled=true
    var physical=await frame(lab,4,"03-physical-mask.png")
    var painted=await frame(lab,5,"04-painted-mask.png")
    await frame(lab,11,"05-edge-difference.png")
    var strokes=await frame(lab,8,"06-fixed-strokes.png")
    await frame(lab,6,"07-importance.png")
    var ray_checks:=0
    var disagreements:=0
    var shadow_samples:=0
    var modifications:=0
    var outward:=0
    var inward:=0
    var interiors_changed:=0
    for iz in 24:
        for ix in 50:
            var p=Vector3(-8+ix*0.32,0.015,1.7+iz*0.24)
            if occluded(lab,p,(lab.camera.position-p).normalized()):
                continue
            var expected=occluded(lab,p,lab.renderer.sun_direction)
            # Exclude geometry edges where raster sampling and finite precision differ.
            var stable=true
            for offset in [Vector3(.08,0,0),Vector3(-.08,0,0),Vector3(0,0,.08),Vector3(0,0,-.08)]:
                if occluded(lab,p+offset,lab.renderer.sun_direction)!=expected:stable=false
            var a=sample(physical,lab,p).r
            var b=sample(painted,lab,p).r
            if stable:
                ray_checks+=1
                if absf(a-(1.0 if expected else 0.0))>0.2:disagreements+=1
            if expected:shadow_samples+=1
            if absf(a-b)>0.07:modifications+=1
            if b-a>0.2:outward+=1
            if a-b>0.2:inward+=1
            # Far from all edges, broad shadow interiors should remain intact.
            if expected and occluded(lab,p+Vector3(1.0,0,0),lab.renderer.sun_direction) and occluded(lab,p-Vector3(1.0,0,0),lab.renderer.sun_direction) and occluded(lab,p+Vector3(0,0,1.0),lab.renderer.sun_direction) and occluded(lab,p-Vector3(0,0,1.0),lab.renderer.sun_direction):
                if absf(a-b)>.1:interiors_changed+=1
    metrics.ray_samples=ray_checks
    metrics.ray_disagreements=disagreements
    metrics.shadow_samples=shadow_samples
    metrics.modified_edge_samples=modifications
    metrics.interior_modifications=interiors_changed
    metrics.outward_stroke_samples=outward
    metrics.inward_gap_samples=inward
    check(ray_checks>500 and shadow_samples>10,"Oracle covers lit and shaded ground")
    check(disagreements<maxi(4,ray_checks/100),"GPU shadow agrees with independent geometric ray oracle")
    check(modifications>25,"Broad brush strokes are visible at game scale")
    check(outward>0 and inward>3,"Brush extends outwards AND cuts visible inward gaps")
    # With fixed overlap, nearby strokes may fully cover this small interior sample set.
    # Alpha gaps and independence from M0 are verified in isolated GPU checks below.
    var cap=lab.renderer.get_capture_texture().get_image()
    metrics.capture_image_format=cap.get_format()
    check(cap.get_format() in [Image.FORMAT_RGBH,Image.FORMAT_RGBAH,Image.FORMAT_RGBF,Image.FORMAT_RGBAF,Image.FORMAT_RGBE9995],"Depth capture is linear HDR")
    # Numeric depth of a known top-face point validates encoding, UV orientation and scale.
    var cam: Camera3D=lab.renderer._cameras[lab.renderer._active]
    var top=Vector3(-4,4.2,0.8)
    var uv: Vector2=cam.unproject_position(top)
    var packed=cap.get_pixel(roundi(uv.x),roundi(uv.y))
    var actual=packed.r+packed.g/64.0
    var view: Vector3=cam.global_transform.affine_inverse()*top
    var expected_depth=(-view.z-cam.near)/(cam.far-cam.near)
    metrics.depth_error=absf(actual-expected_depth)
    check(absf(actual-expected_depth)<0.002,"Capture stores numeric linear depth, without display gamma")
    var count=lab.renderer.capture_count
    var original_camera: Transform3D=lab.camera.transform
    lab.camera.position+=Vector3(0.8,0,0.2)
    lab.camera.size=21
    var moved=await frame(lab,8,"11-strokes-after-camera.png")
    check(lab.renderer.capture_count==count,"Camera pan/zoom does not recapture world shadows")
    var probe=Vector3(-5,0.005,5)
    var moved_value=sample(moved,lab,probe).r
    # The baseline image must be sampled using the camera that produced it.
    var moved_camera=lab.camera.transform
    lab.camera.transform=original_camera
    lab.camera.size=24
    var original_value=sample(strokes,lab,probe).r
    metrics.stroke_camera_difference=absf(original_value-moved_value)
    check(absf(original_value-moved_value)<0.04,"Brush pattern stays on surface during pan/zoom")
    lab.camera.transform=moved_camera
    lab.camera.size=21
    lab.camera.transform=original_camera
    lab.camera.size=24
    var record: Dictionary=lab.renderer._surfaces[0]
    var old_importance=record.inputs.default_importance
    record.inputs.default_importance=0.35
    lab.renderer.refresh_surface_inputs(lab.ground)
    await settle(lab)
    check(lab.renderer.capture_count==count,"Art-map/input changes do not recapture unchanged caster depth")
    record.inputs.default_importance=old_importance
    lab.renderer.refresh_surface_inputs(lab.ground)
    var direction: Vector3=lab.renderer.sun_direction
    lab.renderer.set_lighting(direction,Color.WHITE,1.1)
    var neutral=await frame(lab,9)
    check(lab.renderer.capture_count==count,"Sun color-only update reuses depth")
    var white_max:=0.0
    for panel in lab.panels:
        white_max=maxf(white_max,sample(neutral,lab,panel.position+Vector3(0,1.61,0)).r)
    check(white_max<0.01,"Neutral sun disables hue-dependent chroma enhancement")
    # Ambient-only orange light must not be mistaken for direct solar illumination.
    lab.renderer.set_lighting(direction,Color("f39b57"),0.0)
    lab.renderer.set_environment_light(Color("ff8f50"),0.8)
    var bounced=await frame(lab,9)
    check(sample(bounced,lab,Vector3(-5,0.005,5)).r<0.005,"Warm indirect light alone cannot trigger solar enhancement")
    var indirect=await frame(lab,3)
    check(sample(indirect,lab,Vector3(-5,0.005,5)).r>0.2,"Indirect buffer still contains bright warm light")
    lab.set_time(1.0)
    await settle(lab)
    check(lab.renderer.capture_count>count,"Sun direction updates capture")
    var sunset_strokes=await frame(lab,8)
    var directional_changes=0
    for iz in 24:
        for ix in 50:
            var p=Vector3(-8+ix*0.32,0.015,1.7+iz*0.24)
            if absf(sample(strokes,lab,p).r-sample(sunset_strokes,lab,p).r)>0.1:directional_changes+=1
    check(directional_changes>10,"Whole brush shadows follow the sun from their caster roots")
    await frame(lab,0,"08-sunset.png")
    var positive=await frame(lab,9,"09-color-weight.png")
    check(sample(positive,lab,lab.panels[2].position+Vector3(0,1.61,0)).r>0.04,"Warm direct light produces positive matching-color enhancement")
    count=lab.renderer.capture_count
    lab.panels[0].position.x+=0.5
    await settle(lab)
    check(lab.renderer.capture_count>count,"Moved caster updates capture automatically")
    lab.panels[0].position.x-=0.5
    await settle(lab)
    # Reversible registration lifecycle.
    var extra=MeshInstance3D.new()
    extra.mesh=BoxMesh.new()
    extra.position=Vector3(9,1,5)
    var previous=StandardMaterial3D.new()
    extra.material_override=previous
    lab.add_child(extra)
    lab.renderer.register_surface(extra,load("res://rendering/painterly/painterly_surface.gd").new())
    lab.renderer.unregister_surface(extra)
    check(extra.material_override==previous,"Unregistration restores original material")
    extra.queue_free()
    lab.set_time(0)
    await frame(lab,0)
    await pigment_checks(lab)
    await texture_checks(lab)
    await brush_layout_checks(lab)
    await color_gpu_checks()
    metrics.merge(lab.renderer.get_stats())
    var report={"passed":failures.is_empty(),"checks":checks,"failures":failures,"metrics":metrics,
        "engine":Engine.get_version_info().string,"display":DisplayServer.get_name(),
        "renderer":RenderingServer.get_current_rendering_method(),
        "scope":"GPU integration, numeric capture, ray oracle, shadow edge changes, color gating, camera/light stability, oil stroke alpha/mipmaps, whole-shadow isolation, automatic width-based counts, measured 80–120% lengths, authored gaps and stable layout, lifecycle. Generated brush art on synthetic geometry; no Bluebird art or native GI integration."}
    var file=FileAccess.open(output.path_join("validation.json"),FileAccess.WRITE)
    file.store_string(JSON.stringify(report,"\t")+"\n")
    print("PAINTERLY_QA ",JSON.stringify(report))
    get_tree().quit(0 if failures.is_empty() else 1)

func color_gpu_checks() -> void:
    var viewport=SubViewport.new()
    viewport.size=Vector2i(256,8)
    viewport.disable_3d=true
    viewport.use_hdr_2d=true
    viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS
    add_child(viewport)
    var rect=ColorRect.new()
    rect.size=Vector2(256,8)
    var shader=ShaderMaterial.new()
    shader.shader=load("res://demos/painterly_lab/color_probe.gdshader")
    rect.material=shader
    viewport.add_child(rect)
    for mode in 5:
        shader.set_shader_parameter("mode",mode)
        for frame_index in 3:
            await RenderingServer.frame_post_draw
        var img=viewport.get_texture().get_image()
        if mode==0:
            var c=img.get_pixel(128,4)
            check(absf(c.r-1)<0.002 and absf(c.g-0.5)<0.002 and absf(c.b-0.5)<0.002,"GPU Oklab reference white matches D65 neutral")
        elif mode==1:
            var c=img.get_pixel(128,4)
            check(absf(c.r-128.5/256)<0.005 and absf(c.g-.25)<0.005 and absf(c.b-.8)<0.005,"GPU Oklab round-trip retains linear RGB")
        elif mode==2:
            var valid=true
            var jump=0.0
            for x in 256:
                var c=img.get_pixel(x,4)
                for channel in [c.r,c.g,c.b]:
                    if not is_finite(channel) or channel < -0.001 or channel > 1.001:valid=false
                if x>0:
                    var before=img.get_pixel(x-1,4)
                    jump=maxf(jump,Vector3(c.r-before.r,c.g-before.g,c.b-before.b).length())
            check(valid,"HDR saturated hue sweep maps inside output sRGB without NaN")
            check(jump<0.08,"Gamut mapping preserves continuous hue sweep")
            metrics.gamut_sweep_max_step=jump
        elif mode==3:
            check(img.get_pixel(0,4).r<0.0001,"Neutral solar color confidence tends to zero")
            check(img.get_pixel(0,4).g<0.001 and img.get_pixel(255,4).g>0.8,"Material confidence varies smoothly from gray to chromatic")
        elif mode==4:
            var monotonic=true
            for x in range(1,256):
                if img.get_pixel(x,4).r<img.get_pixel(x-1,4).r:monotonic=false
            check(monotonic and img.get_pixel(255,4).r<0.2,"Soft limiting is monotonic and approaches its cap")
    viewport.queue_free()


func pigment_checks(lab: Node) -> void:
    var r=lab.renderer
    var old_overlap=r.overlap_darkening
    var old_bristles=r.bristle_strength
    var old_contrast=r.contrast_response
    var captures=r.capture_count
    r.contrast_response=0
    r.overlap_darkening=0
    r.bristle_strength=0
    var plain=await frame(lab,10)
    r.overlap_darkening=old_overlap
    var loaded=await frame(lab,10)
    var overlaps=await frame(lab,12,"12-pigment-overlap.png")
    var mask=await frame(lab,5)
    var compared=0
    var max_error=0.0
    var max_darkening=0.0
    var lit_leaks=0
    for iz in 24:
        for ix in 50:
            var p=Vector3(-8+ix*0.32,0.005,1.7+iz*0.24)
            if occluded(lab,p,(lab.camera.position-p).normalized()):continue
            var m=sample(mask,lab,p).r
            var overlap=sample(overlaps,lab,p).srgb_to_linear().r
            if m<0.001 and overlap>0.005:lit_leaks+=1
            if m>0.999 and overlap>0.15:
                var a=sample(plain,lab,p).srgb_to_linear()
                var b=sample(loaded,lab,p).srgb_to_linear()
                if a.r>0.01:
                    var ratio=b.r/a.r
                    max_darkening=maxf(max_darkening,1.0-ratio)
                    max_error=maxf(max_error,absf(ratio-(1.0-old_overlap*overlap)))
                    compared+=1
    metrics.pigment_overlap_samples=compared
    metrics.pigment_ratio_error=max_error
    metrics.pigment_max_darkening=max_darkening
    check(compared>10,"Oil pigment and overlapping finite stamps affect multiple shaded samples")
    check(max_error<0.035,"Overlapping pigment darkens by its bounded coverage, not caster count")
    check(max_darkening>0.02 and max_darkening<0.18,"Pigment accumulation is visible but restrained")
    check(lit_leaks==0,"Overlap does not dirty unshadowed ground")
    r.bristle_strength=old_bristles
    r.contrast_response=old_contrast
    lab.camera.size=15
    await frame(lab,13,"13-bristle-detail.png")
    await frame(lab,0,"14-pigment-bristles-closeup.png")
    lab.camera.size=24
    var hairs=await frame(lab,13)
    var on_mask=await frame(lab,5)
    var hair_samples=0
    var hair_leaks=0
    for iz in 24:
        for ix in 50:
            var p=Vector3(-8+ix*0.32,0.005,1.7+iz*0.24)
            if occluded(lab,p,(lab.camera.position-p).normalized()):continue
            var h=sample(hairs,lab,p).r
            if h>0.05:hair_samples+=1
            if sample(on_mask,lab,p).r<0.001 and h>0.01:hair_leaks+=1
    metrics.bristle_samples=hair_samples
    check(hair_samples>5,"Directional interrupted bristles remain visible at normal scale")
    check(hair_leaks==0,"Dry-brush hair channels stay inside painted shadows")
    check(r.capture_count==captures,"Pigment and bristle controls reuse the same geometry capture")
    await frame(lab,0)

func texture_checks(lab: Node) -> void:
    var r=lab.renderer
    var captures=r.capture_count
    check(r.oil_brush_atlas==null,"Approved collection replaces the old single shadow atlas")
    check(r._brush_layers!=null and r._brush_layers.get_layers()==5,"Five approved rectangular / knife brush layers loaded")
    for i in 5:
        var source: Image=r.shadow_brush_textures[i].get_image()
        var layer: Image=r._brush_layers.get_layer_data(i)
        check(source.get_format()==Image.FORMAT_RGBA8 and source.detect_alpha()!=Image.ALPHA_NONE,"Approved source %d has genuine alpha" % (i+1))
        check(layer.has_mipmaps() and layer.detect_alpha()!=Image.ALPHA_NONE,"Brush %d preserves transparent gaps and mipmaps" % (i+1))
    var painted=await frame(lab,5)
    var physical=await frame(lab,4)
    var old_bias=r.shadow_bias_m
    r.shadow_bias_m=5.0
    var moved_physical=await frame(lab,4)
    var unchanged_paint=await frame(lab,5)
    r.shadow_bias_m=old_bias
    var old_width=r.shadow_brush_width_m
    r.shadow_brush_width_m=2.0
    var one_group=await frame(lab,5)
    r.shadow_brush_width_m=old_width
    var physical_changes=0
    var paint_error=0.0
    var group_changes=0
    for iz in 24:
        for ix in 50:
            var p=Vector3(-8+ix*0.32,0.005,1.7+iz*0.24)
            if occluded(lab,p,(lab.camera.position-p).normalized()):continue
            if lab.camera.unproject_position(p).y<300:continue
            if absf(sample(physical,lab,p).r-sample(moved_physical,lab,p).r)>0.2:physical_changes+=1
            paint_error=maxf(paint_error,absf(sample(painted,lab,p).r-sample(unchanged_paint,lab,p).r))
            if absf(sample(painted,lab,p).r-sample(one_group,lab,p).r)>0.1:group_changes+=1
    metrics.physical_bias_probe_changes=physical_changes
    metrics.complete_brush_bias_error=paint_error
    metrics.brush_group_changes=group_changes
    check(physical_changes>25,"Physical-mask perturbation actually changes M0 for the isolation test")
    check(paint_error<0.005,"Whole texture shadow is independent of M0: no physical underlay or edge clipping")
    check(group_changes>10,"Brush width changes automatic lane count and painted footprint")
    lab.camera.size=15
    lab.set_brush_source(false)
    await frame(lab,0,"15-procedural-comparison.png")
    lab.set_brush_source(true)
    await frame(lab,0,"16-oil-texture-closeup.png")
    await frame(lab,5,"17-complete-brush-mask.png")
    for child in lab.get_children():
        if child is CanvasLayer: child.hide()
    await frame(lab,0,"18-approved-rooted-noon.png")
    await frame(lab,5,"19-approved-rooted-mask.png")
    check(r.capture_count==captures,"Brush source and width controls reuse geometry capture")
    lab.set_time(1.0)
    await frame(lab,0,"20-approved-rooted-sunset.png")
    lab.set_time(0.0)
    await settle(lab)
    for child in lab.get_children():
        if child is CanvasLayer: child.show()
    lab.camera.size=24
    await frame(lab,0)

# Isolate the actual surface shader from scene geometry, art alpha and the HUD.
# A solid stamp lets GPU readback measure gesture count and support endpoints.
func brush_layout_checks(lab: Node) -> void:
    var viewport := SubViewport.new()
    viewport.size=Vector2i(1024,1024)
    viewport.own_world_3d=true
    viewport.use_hdr_2d=true
    viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS
    add_child(viewport)
    var camera := Camera3D.new()
    camera.projection=Camera3D.PROJECTION_ORTHOGONAL
    camera.size=10
    camera.position=Vector3(0,12,3)
    viewport.add_child(camera)
    camera.look_at(Vector3(0,0,3),Vector3.FORWARD)
    var floor_mesh := MeshInstance3D.new()
    var plane := PlaneMesh.new()
    plane.size=Vector2(12,12)
    floor_mesh.mesh=plane
    floor_mesh.position.z=3
    var mat: ShaderMaterial=lab.renderer._surfaces[0].material.duplicate()
    floor_mesh.material_override=mat
    viewport.add_child(floor_mesh)
    var stamp := Image.create(64,64,false,Image.FORMAT_RGBA8)
    stamp.fill(Color(0.2,0.2,0.2,1))
    stamp.generate_mipmaps()
    mat.set_shader_parameter("oil_brush_atlas",ImageTexture.create_from_image(stamp))
    mat.set_shader_parameter("oil_brush_region_px",Vector4(0,0,64,64))
    mat.set_shader_parameter("shadow_brush_variant_count",0)
    mat.set_shader_parameter("debug_view",5)
    mat.set_shader_parameter("receiver_stroke_id",-1.0)
    mat.set_shader_parameter("stroke_angle_jitter_degrees",0.0)
    mat.set_shader_parameter("shadow_brush_overlap",0.2)
    mat.set_shader_parameter("sun_direction",Vector3(0,1,-1).normalized())
    mat.set_shader_parameter("brush_caster_count",1)
    var lows := PackedVector4Array()
    var highs := PackedVector4Array()
    lows.resize(32)
    highs.resize(32)
    lows[0]=Vector4(-1,0,-1,23)
    highs[0]=Vector4(1,4,1,0)
    mat.set_shader_parameter("brush_caster_min",lows)
    mat.set_shader_parameter("brush_caster_max",highs)
    var observed: Array[float]=[]
    for width in [0.5,1.0]:
        mat.set_shader_parameter("shadow_brush_width_m",width)
        mat.set_shader_parameter("shadow_length_range",Vector2(0.8,1.2))
        for i in 3: await RenderingServer.frame_post_draw
        var img := viewport.get_texture().get_image()
        var row := roundi(camera.unproject_position(Vector3(0,0,3.0)).y)
        var runs: Array[Vector2i]=[]
        var start := -1
        for x in img.get_width():
            var covered := img.get_pixel(x,row).r>0.5
            if covered and start<0: start=x
            if not covered and start>=0:
                runs.append(Vector2i(start,x-1))
                start=-1
        check(runs.size()==1,"Overlapping stamps form a continuous body (%s m)" % width)
        var count := ceili((2.0/width-1.0)/0.8)+1
        var fitted_width := 2.0/(1.0+(count-1)*0.8)
        for lane in count:
            var lateral := (lane+0.5-count*0.5)*fitted_width*0.8
            var x := roundi(camera.unproject_position(Vector3(lateral,0,3)).x)
            var end_z := -1.0
            for y in img.get_height():
                if img.get_pixel(x,y).r>0.5:
                    var world := camera.project_position(Vector2(x,y),12.0)
                    end_z=maxf(end_z,world.z)
            var ratio := (end_z+1.0)/6.0
            observed.append(ratio)
            check(ratio>=0.797 and ratio<=1.203,"GPU stroke support remains within 80–120 percent (pixel tolerance)")
        mat.set_shader_parameter("debug_view",12)
        for i in 3: await RenderingServer.frame_post_draw
        var density := viewport.get_texture().get_image()
        var density_row := roundi(camera.unproject_position(Vector3(0,0,2.0)).y)
        var max_density := 0.0
        var min_density := 1.0
        for x in range(runs[0].x+2,runs[0].y-1):
            var value := density.get_pixel(x,density_row).r
            max_density=maxf(max_density,value)
            min_density=minf(min_density,value)
        var overlap_pixels := 0
        var overlap_runs := 0
        var in_overlap := false
        for x in range(runs[0].x+2,runs[0].y-1):
            var overlap := density.get_pixel(x,density_row).r>(max_density+min_density)*0.5
            if overlap: overlap_pixels+=1
            if overlap and not in_overlap: overlap_runs+=1
            in_overlap=overlap
        var measured_overlap := (overlap_pixels/float(count-1))/(fitted_width/10.0*1024.0)
        check(overlap_runs==count-1,"GPU overlap bands confirm automatic stroke count")
        check(absf(measured_overlap-0.2)<0.025,"GPU adjacent stamp overlap measures 20 percent of brush width")
        metrics["overlap_ratio_at_width_%s" % width]=measured_overlap
        mat.set_shader_parameter("debug_view",5)
        for i in 3: await RenderingServer.frame_post_draw
        # The same pixels must remain stable across frames.
        await RenderingServer.frame_post_draw
        check(img.get_data()==viewport.get_texture().get_image().get_data(),"Random brush layout stays identical across frames")
    metrics.measured_stroke_length_ratios=observed
    check(observed.min()<1.0 and observed.max()>1.0,"Random lengths include both shorter and longer gestures")
    # Equal bounds remove length jitter; even a large legacy drag cannot extend it.
    mat.set_shader_parameter("shadow_length_range",Vector2(1,1))
    mat.set_shader_parameter("drag_length_m",10.0)
    for i in 3: await RenderingServer.frame_post_draw
    var exact := viewport.get_texture().get_image()
    var beyond := camera.unproject_position(Vector3(0,0,5.08))
    var leaked := 0
    for x in exact.get_width():
        if exact.get_pixel(x,roundi(beyond.y)).r>0.01: leaked+=1
    check(leaked==0,"Length maximum cannot be exceeded by the old additive drag setting")
    # Restore authored textures and prove internal alpha holes survive shading.
    mat.set_shader_parameter("shadow_brush_layers",lab.renderer._brush_layers)
    mat.set_shader_parameter("shadow_brush_regions",lab.renderer._brush_regions)
    mat.set_shader_parameter("shadow_brush_variant_count",5)
    for i in 3: await RenderingServer.frame_post_draw
    var authored := viewport.get_texture().get_image()
    var holes := 0
    for y in range(0,1024,2):
        for x in range(0,1024,2):
            if exact.get_pixel(x,y).r>0.9 and authored.get_pixel(x,y).r<0.1: holes+=1
    metrics.authored_alpha_gap_pixels=holes
    check(holes>100,"Authored transparent gaps remain open within the stamp support")
    # Root coverage is independent of texture holes, lane gaps, orientation,
    # seed and receiver elevation. Sample just beyond the actual rear silhouette.
    var root_samples := 0
    var root_min := 1.0
    var outside_leaks := 0
    for height in [0.0,0.55]:
        floor_mesh.position.y=height
        lows[0]=Vector4(-1,height,-1,23)
        highs[0]=Vector4(1,height+4,1,0)
        mat.set_shader_parameter("brush_caster_min",lows)
        mat.set_shader_parameter("brush_caster_max",highs)
        for sun in [Vector3(0,1,-1).normalized(),Vector3(-0.6,0.35,-0.8).normalized()]:
            mat.set_shader_parameter("sun_direction",sun)
            var trail := -Vector2(sun.x,sun.z).normalized()
            var side := Vector2(-trail.y,trail.x)
            var half_width := absf(side.x)+absf(side.y)
            for brush_seed in [17.0,43.0]:
                mat.set_shader_parameter("shadow_brush_seed",brush_seed)
                mat.set_shader_parameter("shadow_brush_overlap",0.2)
                for i in 3: await RenderingServer.frame_post_draw
                var rooted := viewport.get_texture().get_image()
                for lane in 39:
                    var lateral := lerpf(-half_width*0.96,half_width*0.96,lane/38.0)
                    var origin := side*lateral
                    var safe := Vector2(trail.x if absf(trail.x)>0.0001 else 0.0001,trail.y if absf(trail.y)>0.0001 else 0.0001)
                    var a := (Vector2(-1,-1)-origin)/safe
                    var b := (Vector2(1,1)-origin)/safe
                    var leave := minf(maxf(a.x,b.x),maxf(a.y,b.y))
                    for distance in [0.025,0.08,0.16]:
                        var p: Vector2 = origin+trail*(leave+distance)
                        var px := camera.unproject_position(Vector3(p.x,height,p.y)).round()
                        root_min=minf(root_min,rooted.get_pixel(int(px.x),int(px.y)).r)
                        root_samples+=1
                # Light-facing edge must not acquire a halo from contact filling.
                var front := -trail*(1.0/maxf(absf(trail.x),absf(trail.y))+0.1)
                var front_px := camera.unproject_position(Vector3(front.x,height,front.y)).round()
                if rooted.get_pixel(int(front_px.x),int(front_px.y)).r>0.05: outside_leaks+=1
    metrics.root_coverage_samples=root_samples
    metrics.minimum_root_coverage=root_min
    check(root_samples==936 and root_min>0.995,"Root is completely filled across gaps, diagonal light and raised receivers")
    check(outside_leaks==0,"Root protection does not spill in front of the object")
    # A raised caster must not manufacture a contact shadow below empty space.
    floor_mesh.position.y=0
    lows[0]=Vector4(-1,2,-1,23)
    highs[0]=Vector4(1,6,1,0)
    mat.set_shader_parameter("brush_caster_min",lows)
    mat.set_shader_parameter("brush_caster_max",highs)
    mat.set_shader_parameter("sun_direction",Vector3(0,1,-1).normalized())
    for i in 3: await RenderingServer.frame_post_draw
    var floating := viewport.get_texture().get_image()
    var below := camera.unproject_position(Vector3(0,0,0)).round()
    check(floating.get_pixel(int(below.x),int(below.y)).r<0.01,"Floating casters do not get a false contact fill on the floor")
    viewport.queue_free()
