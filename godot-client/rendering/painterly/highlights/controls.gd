extends VBoxContainer
var highlights: PainterlyHighlights
var widgets := {}
var syncing := false

func setup(system: PainterlyHighlights) -> void:
	highlights = system
	for pair in [["enabled", "油画高光 [B]"], ["glass_enabled", "玻璃宽刮亮斑"], ["metal_enabled", "金属亮笔"], ["frame_enabled", "近直射边框亮笔"]]:
		var key: String = pair[0]
		var check := CheckBox.new(); check.text = pair[1]; add_child(check); widgets[key] = check
		check.toggled.connect(func(value): if not syncing: highlights.settings.set(key,value); highlights.refresh())
	for spec in [["strength", "高光强度", 0.0, 4.0, 0.05], ["density", "笔触密度", 0.0, 1.0, 0.01], ["size_scale", "笔触尺寸", 0.1, 4.0, 0.05], ["direction_degrees", "方向偏转", -90.0, 90.0, 1.0]]:
		var key: String = spec[0]
		var label := Label.new(); label.text = spec[1]; add_child(label)
		var spin := SpinBox.new(); spin.min_value = spec[2]; spin.max_value = spec[3]; spin.step = spec[4]; add_child(spin); widgets[key] = spin
		spin.value_changed.connect(func(value): if not syncing: highlights.settings.set(key,value); highlights.refresh())
	var view := OptionButton.new()
	for title in ["成片", "笔触覆盖", "受光权重"]: view.add_item(title)
	add_child(view); widgets.debug_view = view
	view.item_selected.connect(func(index): if not syncing: highlights.settings.debug_view = index; highlights.refresh())
	var repaint := Button.new(); repaint.text = "重新排笔"; add_child(repaint)
	repaint.pressed.connect(func(): highlights.repaint(); sync())
	var seed := SpinBox.new(); seed.min_value = -2147483648; seed.max_value = 2147483647; seed.step = 1; seed.prefix = "种子 "; add_child(seed); widgets.seed = seed
	seed.value_changed.connect(func(value): if not syncing: highlights.settings.seed = int(value); highlights.refresh())
	var note := Label.new(); note.text = "边框：与法线夹角 30° 内渐显，15° 内充分显现。\n亮笔跟随光照和阴影；移动镜头不重新排笔。"; note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; add_child(note)
	sync()

func sync() -> void:
	if highlights == null: return
	syncing = true
	for key in widgets:
		var value = highlights.settings.get(key)
		if widgets[key] is CheckBox: widgets[key].set_pressed_no_signal(value)
		elif widgets[key] is SpinBox: widgets[key].set_value_no_signal(value)
		else: widgets[key].select(value)
	syncing = false
