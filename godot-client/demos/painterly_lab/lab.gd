extends Node3D
## Synthetic fixtures only. No Bluebird assets or simulation changes.
const RENDERER = preload("res://rendering/painterly/painterly_renderer.gd")
const SURFACE = preload("res://rendering/painterly/painterly_surface.gd")
var pressure_controls: PanelContainer
var renderer: Node
var camera: Camera3D
var title: Label
var status: Label
var debug_select: OptionButton
var panels: Array[MeshInstance3D] = []
var ground: MeshInstance3D
var time_slider: HSlider
var enable_toggle: CheckButton
var brush_mode_toggle: CheckButton
var bend_slider: HSlider
var gap_slider: HSlider
var drag_slider: HSlider
var orbit_target := Vector3(0,0.8,0)
var capture_enabled := false
var noon := true

func _ready() -> void:
    var env := WorldEnvironment.new()
    env.environment=RENDERER.neutral_environment(Color("262f34"))
    add_child(env)
    renderer=RENDERER.new()
    renderer.name="PainterlyRenderer"
    for variant in ["solid","asymmetric","offset-notch","knife","fine-tail"]:
        renderer.shadow_brush_textures.append(load("res://rendering/painterly/textures/oil-shadow-%s-preview-v1.png" % variant))
    renderer.use_aui_vangogh()
    add_child(renderer)
    camera=Camera3D.new()
    camera.projection=Camera3D.PROJECTION_ORTHOGONAL
    camera.size=24
    camera.position=Vector3(17,19,22)
    add_child(camera)
    camera.look_at(orbit_target)
    camera.make_current()
    var floor_inputs=SURFACE.new()
    floor_inputs.albedo=Color("a7a595")
    floor_inputs.map_origin=Vector2(-11,-9)
    floor_inputs.map_extent=Vector2(22,18)
    floor_inputs.importance_map=importance_fixture()
    floor_inputs.flow_map=flow_fixture()
    floor_inputs.contact_protection_map=contact_fixture()
    ground=box("Ground",Vector3(22,0.2,18),Vector3(0,-0.1,0),floor_inputs)
    # Various heights test actual receiver coordinates, not a single Y=0 projection.
    var raised=SURFACE.new()
    raised.albedo=Color("bbb29a")
    raised.default_importance=0.8
    box("RaisedReceiver",Vector3(7,0.55,5),Vector3(4,0.275,1.5),raised)
    var colors=["d9cdaa","c7a445","b76838","7f949d","504e49"]
    for i in 5:
        var inputs=SURFACE.new()
        inputs.albedo=Color(colors[i])
        inputs.default_importance=0.85 if i==2 else 0.2
        inputs.painterly_shadows=false
        var panel=box("Swatch%d"%i,Vector3(1.6,3.2,0.45),Vector3(-6+i*3,1.6,-3),inputs)
        panels.append(panel)
    var pillar=SURFACE.new()
    pillar.albedo=Color("9b9b89")
    pillar.painterly_shadows=false
    box("TallOccluder",Vector3(2.1,4.2,2.1),Vector3(-4,2.1,0.8),pillar)
    box("StepOccluder",Vector3(1.8,2.4,1.8),Vector3(3,1.75,0),pillar)
    # Warm indirect input: does not change the direct-sun gate.
    var bounce=SURFACE.new()
    bounce.albedo=Color("a48b70")
    bounce.indirect_tint=Color("ed773c")
    bounce.indirect_energy=0.3
    bounce.painterly_shadows=false
    box("IndirectFixture",Vector3(1.2,0.5,1.2),Vector3(-1,0.25,3),bounce)
    make_hud()
    set_time(0.0)
    if OS.get_cmdline_user_args().has("--pressure-qa"):
        var qa=load("res://demos/painterly_lab/pressure_qa.gd").new()
        add_child(qa)
        qa.call_deferred("run",self)
    if OS.get_cmdline_user_args().has("--aui-qa"):
        renderer.pressure_stamps_enabled=false
        pressure_controls.hide()
        get_viewport().gui_disable_input=true
        set_process_unhandled_input(false)
        renderer.refresh_settings()
        var qa=load("res://demos/painterly_lab/aui_qa.gd").new()
        add_child(qa)
        qa.call_deferred("run",self)
    if OS.get_cmdline_user_args().has("--painterly-qa"):
        renderer.procreate_shadows_enabled=false
        get_viewport().gui_disable_input=true
        set_process_unhandled_input(false)
        pressure_controls.hide()
        renderer.refresh_settings()
        var qa=load("res://demos/painterly_lab/qa.gd").new()
        add_child(qa)
        qa.call_deferred("run",self)

func box(label: String,size: Vector3,position_: Vector3,inputs: Resource) -> MeshInstance3D:
    var mesh=MeshInstance3D.new()
    mesh.name=label
    var geometry=BoxMesh.new()
    geometry.size=size
    mesh.mesh=geometry
    mesh.position=position_
    add_child(mesh)
    renderer.register_surface(mesh,inputs)
    return mesh

func importance_fixture() -> Texture2D:
    var img=Image.create(128,128,false,Image.FORMAT_RF)
    for y in 128:
        for x in 128:
            var uv=Vector2(x,y)/127.0
            var focus=exp(-pow((uv-Vector2(0.65,0.65)).length()/0.2,2.0))
            img.set_pixel(x,y,Color(0.15+focus*0.8,0,0))
    img.generate_mipmaps()
    return ImageTexture.create_from_image(img)

func flow_fixture() -> Texture2D:
    var img=Image.create(64,64,false,Image.FORMAT_RGB8)
    for y in 64:
        for x in 64:
            var angle=0.2+0.22*sin(float(y)/63.0*PI)
            img.set_pixel(x,y,Color(cos(2*angle)*0.5+0.5,sin(2*angle)*0.5+0.5,0))
    img.generate_mipmaps()
    return ImageTexture.create_from_image(img)

func contact_fixture() -> Texture2D:
    var img=Image.create(256,256,false,Image.FORMAT_RF)
    for y in 256:
        for x in 256:
            var world=Vector2(x/255.0*22-11,y/255.0*18-9)
            var delta=(world-Vector2(-4,0.8)).abs()-Vector2(1.05,1.05)
            var distance=Vector2(maxf(delta.x,0),maxf(delta.y,0)).length()
            img.set_pixel(x,y,Color(1.0-smoothstep(0.04,0.16,distance),0,0))
    return ImageTexture.create_from_image(img)

func make_hud() -> void:
    var hud=CanvasLayer.new()
    add_child(hud)
    var panel=PanelContainer.new()
    panel.position=Vector2(22,18)
    panel.size=Vector2(520,124)
    hud.add_child(panel)
    pressure_controls=load("res://demos/painterly_lab/pressure_controls.gd").new()
    hud.add_child(pressure_controls)
    pressure_controls.setup(renderer)
    var margin=MarginContainer.new()
    for side in ["left","right","top","bottom"]:
        margin.add_theme_constant_override("margin_"+side,12)
    panel.add_child(margin)
    var column=VBoxContainer.new()
    margin.add_child(column)
    title=Label.new()
    title.text="PAINTERLY / 渲染实验室"
    title.add_theme_font_size_override("font_size",23)
    column.add_child(title)
    var desc=Label.new()
    desc.text="Aui Vangogh 油画颗粒 · 根部铺色 · 连续行笔收尾"
    column.add_child(desc)
    var row=HBoxContainer.new()
    column.add_child(row)
    for item in [["晴天",0.0],["夕阳",1.0]]:
        var button=Button.new()
        button.text=item[0]
        var hour: float=item[1]
        button.pressed.connect(func(): time_slider.value=hour)
        row.add_child(button)
    var toggle=CheckButton.new()
    enable_toggle=toggle
    toggle.text="油画处理"
    toggle.button_pressed=true
    toggle.toggled.connect(func(value): renderer.enabled=value; renderer.refresh_settings())
    row.add_child(toggle)
    debug_select=OptionButton.new()
    for label in ["最终画面","固有色","未遮挡阳光 S0","环境 / 间接光 B","原始遮罩 M0","笔刷遮罩 Mp","重要度","表面流向","固定笔触","彩度增强权重","线性合成","遮罩差异","笔触积色","毛刷纹理"]:
        debug_select.add_item(label)
    debug_select.item_selected.connect(func(index): renderer.debug_view=index; renderer.refresh_settings())
    row.add_child(debug_select)
    time_slider=HSlider.new()
    time_slider.min_value=0
    time_slider.max_value=1
    time_slider.step=0.005
    time_slider.custom_minimum_size=Vector2(300,20)
    time_slider.value_changed.connect(set_time)
    column.add_child(time_slider)
    var brush_row=HBoxContainer.new()
    column.add_child(brush_row)
    for setting in [["拖刷", "drag_length_m", 1.6],["缺口", "gap_depth_m", 1.0]]:
        var label=Label.new()
        label.text=setting[0]
        brush_row.add_child(label)
        var slider=HSlider.new()
        slider.min_value=0
        slider.max_value=setting[2]
        slider.step=0.02
        slider.value=renderer.get(setting[1])
        slider.custom_minimum_size=Vector2(130,20)
        if setting[1]=="drag_length_m":
            drag_slider=slider
            label.text="原型拖刷"
            slider.editable=false
        if setting[1]=="gap_depth_m":
            gap_slider=slider
            label.text="原型缺口"
            slider.editable=false
        var property: String=setting[1]
        slider.value_changed.connect(func(value): renderer.set(property,value); renderer.refresh_settings())
        brush_row.add_child(slider)
    var pigment_row=HBoxContainer.new()
    column.add_child(pigment_row)
    for setting in [["积色", "overlap_darkening", 0.25],["毛刷", "bristle_strength", 1.0]]:
        var label=Label.new()
        label.text=setting[0]
        pigment_row.add_child(label)
        var slider=HSlider.new()
        slider.min_value=0
        slider.max_value=setting[2]
        slider.step=0.01
        slider.value=renderer.get(setting[1])
        slider.custom_minimum_size=Vector2(130,20)
        var property: String=setting[1]
        slider.value_changed.connect(func(value): renderer.set(property,value); renderer.refresh_settings())
        pigment_row.add_child(slider)
    var group_row=HBoxContainer.new()
    column.add_child(group_row)
    for setting in [["笔宽 m", "shadow_brush_width_m", 2.0, 0.01],["笔刷重叠", "shadow_brush_overlap", 0.45, 0.01]]:
        var label=Label.new()
        label.text=setting[0]
        group_row.add_child(label)
        var slider=HSlider.new()
        slider.min_value=0
        if setting[1]=="shadow_brush_width_m":slider.min_value=0.08
        slider.max_value=setting[2]
        slider.step=setting[3]
        slider.value=renderer.get(setting[1])
        slider.custom_minimum_size=Vector2(85,20)
        if setting[1]=="stroke_arc_bend_m":
            bend_slider=slider
            label.text="原型弧度"
            slider.editable=false
        slider.tooltip_text="%s: %.2f"%[setting[0],slider.value]
        var property: String=setting[1]
        slider.value_changed.connect(func(value):
            renderer.set(property,value)
            renderer.refresh_settings()
            slider.tooltip_text="%s: %.2f"%[label.text,value])
        group_row.add_child(slider)
    var length_row=HBoxContainer.new()
    column.add_child(length_row)
    for property in ["shadow_length_min","shadow_length_max"]:
        var label=Label.new()
        label.text="最短 %" if property=="shadow_length_min" else "最长 %"
        length_row.add_child(label)
        var value_box=SpinBox.new()
        value_box.min_value=20
        value_box.max_value=200
        value_box.step=1
        value_box.value=renderer.get(property)*100.0
        value_box.value_changed.connect(func(value): renderer.set(property,value/100.0); renderer.refresh_settings())
        length_row.add_child(value_box)
    var aui_toggle=CheckButton.new()
    aui_toggle.text="Aui 油画笔刷（关闭对比旧贴图）"
    aui_toggle.button_pressed=true
    aui_toggle.toggled.connect(func(active: bool):
        renderer.procreate_shadows_enabled=active
        renderer.refresh_settings())
    column.add_child(aui_toggle)
    brush_mode_toggle=CheckButton.new()
    brush_mode_toggle.text="笔刷替代整片阴影（关闭对比原型）"
    brush_mode_toggle.button_pressed=true
    brush_mode_toggle.toggled.connect(set_brush_source)
    column.add_child(brush_mode_toggle)
    status=Label.new()
    status.position=Vector2(24,667)
    hud.add_child(status)
    var help=Label.new()
    help.text="滚轮缩放 · 中键平移 · 1 晴天 / 2 夕阳 · P 开关 · D 切换通道"
    help.position=Vector2(24,691)
    hud.add_child(help)

func set_brush_source(use_atlas: bool) -> void:
    renderer.texture_shadows_enabled=use_atlas
    renderer.refresh_settings()
    if bend_slider:bend_slider.editable=not use_atlas
    if gap_slider:gap_slider.editable=not use_atlas
    if drag_slider:drag_slider.editable=not use_atlas
    if brush_mode_toggle:brush_mode_toggle.set_pressed_no_signal(use_atlas)

func set_time(value: float) -> void:
    noon=value<0.5
    if time_slider:time_slider.set_value_no_signal(value)
    renderer.set_lighting(Vector3(-0.6,0.95-0.58*value,-0.55+0.1*value).normalized(),
        Color("fff6e5").lerp(Color("f39b57"),value),lerpf(1.1,0.82,value))
    renderer.set_environment_light(Color("a7bddb").lerp(Color("9caccb"),value),0.42)

func _process(_delta: float) -> void:
    if status:
        status.text="%s · 捕获 %d 次 · %d² 阴影 · %s"%["晴天" if noon else "夕阳",renderer.capture_count,
            renderer.capture_resolution,"同步光照中" if renderer.is_capture_pending() else "世界坐标固定"]

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventMouseButton and event.pressed:
        if event.button_index==MOUSE_BUTTON_WHEEL_UP: camera.size=maxf(12,camera.size/1.1)
        elif event.button_index==MOUSE_BUTTON_WHEEL_DOWN: camera.size=minf(36,camera.size*1.1)
    elif event is InputEventMouseMotion and event.button_mask & MOUSE_BUTTON_MASK_MIDDLE:
        var delta=(-camera.global_basis.x*event.relative.x+camera.global_basis.y*event.relative.y)*camera.size/get_viewport().get_visible_rect().size.y
        camera.position+=delta
    elif event is InputEventKey and event.pressed and not event.echo:
        match event.keycode:
            KEY_1: time_slider.value=0
            KEY_2: time_slider.value=1
            KEY_P:
                renderer.enabled=not renderer.enabled
                enable_toggle.set_pressed_no_signal(renderer.enabled)
                renderer.refresh_settings()
            KEY_D:
                renderer.debug_view=(renderer.debug_view+1)%14
                debug_select.select(renderer.debug_view)
                renderer.refresh_settings()
