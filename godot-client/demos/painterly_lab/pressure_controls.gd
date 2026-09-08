extends PanelContainer
## Editable pressure resource and GPU preview using exactly the runtime tip code.
var renderer: Node
var preview_material: ShaderMaterial
var source_select: OptionButton

func setup(renderer_: Node) -> void:
    renderer=renderer_
    position=Vector2(864,18)
    custom_minimum_size=Vector2(392,0)
    var margin=MarginContainer.new()
    for side in ["left","right","top","bottom"]: margin.add_theme_constant_override("margin_"+side,10)
    add_child(margin)
    var column=VBoxContainer.new()
    margin.add_child(column)
    var heading=Label.new()
    heading.text="压力行笔 / Shape + Grain"
    column.add_child(heading)
    source_select=OptionButton.new()
    source_select.add_item("上一版：颗粒铺色")
    source_select.add_item("新版：压力盖印")
    source_select.select(1 if renderer.pressure_stamps_enabled else 0)
    source_select.item_selected.connect(func(index):
        renderer.pressure_stamps_enabled=index==1
        renderer.refresh_settings())
    column.add_child(source_select)
    for setting in [["力度","pressure_scale",0.0,1.5],["压扁","squash_strength",0.0,1.0],["含漆量","paint_charge",0.0,2.0]]:
        var row=HBoxContainer.new()
        column.add_child(row)
        var label=Label.new()
        label.custom_minimum_size.x=55
        label.text=setting[0]
        row.add_child(label)
        var slider=HSlider.new()
        slider.custom_minimum_size.x=225
        slider.min_value=setting[2]
        slider.max_value=setting[3]
        slider.step=0.01
        slider.value=renderer.pressure_settings.get(setting[1])
        row.add_child(slider)
        var value_label=Label.new()
        value_label.text="%.2f"%slider.value
        row.add_child(value_label)
        var property: String=setting[1]
        slider.value_changed.connect(func(value):
            renderer.pressure_settings.set(property,value)
            renderer.refresh_settings()
            value_label.text="%.2f"%value
            refresh_preview())
    var label=Label.new()
    label.text="力度曲线 · 轻 / 中 / 重笔尖 · 单笔效果"
    column.add_child(label)
    var preview=ColorRect.new()
    preview.custom_minimum_size=Vector2(372,195)
    preview.mouse_filter=Control.MOUSE_FILTER_IGNORE
    preview_material=ShaderMaterial.new()
    preview_material.shader=load("res://rendering/painterly/shaders/pressure_preview.gdshader")
    preview.material=preview_material
    column.add_child(preview)
    refresh_preview()

func refresh_preview() -> void:
    var values: Dictionary=renderer.pressure_settings.uniforms()
    for key in values:
        preview_material.set_shader_parameter(key,values[key])
    preview_material.set_shader_parameter("procreate_grains",renderer._procreate_grains)
    preview_material.set_shader_parameter("procreate_parameters",renderer._procreate_parameters)
    preview_material.set_shader_parameter("procreate_dynamics",renderer._procreate_dynamics)
