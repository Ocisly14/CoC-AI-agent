extends VBoxContainer
var renderer: Node
var select: OptionButton
var controls: Dictionary={}
var syncing := false
func setup(r: Node) -> void:
    renderer=r
    var title=Label.new();title.text="矩形笔带 · 随机重叠 30%–60%";add_child(title)
    var row=HBoxContainer.new();add_child(row)
    var repaint=Button.new();repaint.text="🌟 重新叠画";row.add_child(repaint)
    repaint.pressed.connect(func():renderer.rectangle_settings.painting_revision+=1;renderer.refresh_settings())
    var order=CheckButton.new();order.text="顺时针";order.button_pressed=true;row.add_child(order)
    order.toggled.connect(func(value):renderer.rectangle_settings.clockwise=value;renderer.refresh_settings())
    var rects=CheckButton.new();rects.text="笔带";row.add_child(rects)
    rects.toggled.connect(func(value):renderer.rectangle_debug=value;renderer.refresh_settings())
    var overlay=CheckButton.new();overlay.text="油画贴图叠画 · 单笔 50%–120%";add_child(overlay)
    overlay.button_pressed=renderer.rectangle_settings.texture_overlay_enabled
    overlay.toggled.connect(func(value):renderer.rectangle_settings.texture_overlay_enabled=value;renderer.refresh_settings())
    var strength=HSlider.new();strength.max_value=1.0;strength.step=0.01;strength.value=renderer.rectangle_settings.texture_overlay_strength;add_child(strength)
    strength.tooltip_text="贴图叠画强度"
    strength.value_changed.connect(func(value):renderer.rectangle_settings.texture_overlay_strength=value;renderer.refresh_settings())
    select=OptionButton.new();add_child(select)
    renderer.rectangle_settings.ensure_defaults()
    for group in renderer.rectangle_settings.groups:select.add_item(group.label)
    select.item_selected.connect(func(_index):sync())
    for field in [["probability","落笔概率",1.0],["opacity","覆盖",1.0],["pigment_gain","积色",2.0]]:
        var line=HBoxContainer.new();add_child(line)
        var label=Label.new();label.text=field[1];label.custom_minimum_size.x=65;line.add_child(label)
        var slider=HSlider.new();slider.max_value=field[2];slider.step=0.01;slider.custom_minimum_size.x=225;line.add_child(slider)
        var key: String=field[0];controls[key]=slider
        slider.value_changed.connect(func(value):
            if not syncing:renderer.rectangle_settings.groups[select.selected].set(key,value);renderer.refresh_settings())
    var save=Button.new();save.text="保存笔刷组配置";add_child(save)
    save.pressed.connect(func():ResourceSaver.save(renderer.rectangle_settings,"user://rectangle-brushes.tres"))
    sync()
func sync() -> void:
    syncing=true
    var group=renderer.rectangle_settings.groups[maxi(0,select.selected)]
    for key in controls:controls[key].value=group.get(key)
    syncing=false
