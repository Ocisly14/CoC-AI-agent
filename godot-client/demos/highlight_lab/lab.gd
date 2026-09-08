extends Node3D
var highlights: PainterlyHighlights
var camera: Camera3D
var sun: DirectionalLight3D
var lamp: OmniLight3D
var blocker: MeshInstance3D
var pieces := {}
var hud: CanvasLayer

func _ready() -> void:
	get_window().title = "Oil highlights — glass / metal / frames"
	var environment := WorldEnvironment.new()
	environment.environment = Environment.new()
	environment.environment.background_mode = Environment.BG_COLOR
	environment.environment.background_color = Color("202b31")
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.environment.ambient_light_color = Color("8299ad")
	environment.environment.ambient_light_energy = 0.4
	environment.environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	add_child(environment)
	camera = Camera3D.new(); camera.projection = Camera3D.PROJECTION_ORTHOGONAL; camera.size = 6.3
	add_child(camera); camera.position = Vector3(0,0,10); camera.make_current()
	sun = DirectionalLight3D.new(); sun.light_energy = 1.5; sun.shadow_enabled = true; add_child(sun)
	lamp = OmniLight3D.new(); lamp.position = Vector3(0,0,3); lamp.omni_range = 8; lamp.shadow_enabled = true; lamp.light_energy = 0; add_child(lamp)
	highlights = PainterlyHighlights.new(); add_child(highlights)
	# A coloured backing makes preserved glass transparency readily visible.
	box("backing", Vector3(-2.0,0,-0.3), Vector3(2,2.7,0.1), Color("927348"))
	var glass := box("glass", Vector3(-2.0,0,0), Vector3(2,2.7,0.05), Color(0.2,0.42,0.39,0.23))
	glass.material_override.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	glass.material_override.cull_mode = BaseMaterial3D.CULL_DISABLED
	highlights.register_surface(glass,"glass","lab/glass")
	var second := box("second_glass", Vector3(-2.4,0.4,-0.12), Vector3(0.9,1.5,0.03), Color(0.2,0.35,0.5,0.18))
	second.material_override.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	second.material_override.cull_mode = BaseMaterial3D.CULL_DISABLED
	highlights.register_surface(second,"glass","lab/second-glass")
	var metal := box("metal", Vector3(0.4,0,0), Vector3(1.8,2.7,0.15), Color("7b795e"))
	metal.material_override.metallic = 1.0
	highlights.register_surface(metal,"metal","lab/metal")
	# A single ArrayMesh with disjoint UV regions: horizontal + vertical members.
	var combined := ArrayMesh.new()
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for entry in [[Vector3(2.4,1.05,0),Vector3(1.7,0.16,0.15),0], [Vector3(1.65,0,0),Vector3(0.16,2.1,0.15),1], [Vector3(3.15,0,0),Vector3(0.16,2.1,0.15),2], [Vector3(2.4,-1.05,0),Vector3(1.7,0.16,0.15),3]]:
		var primitive := BoxMesh.new(); primitive.size = entry[1]
		var arrays := primitive.surface_get_arrays(0)
		for index in arrays[Mesh.ARRAY_INDEX]:
			st.set_normal(arrays[Mesh.ARRAY_NORMAL][index])
			var uv: Vector2 = arrays[Mesh.ARRAY_TEX_UV][index]
			st.set_uv(Vector2((uv.x+entry[2])*0.25, uv.y))
			st.add_vertex(arrays[Mesh.ARRAY_VERTEX][index]+entry[0])
	st.commit(combined)
	var frame := MeshInstance3D.new(); frame.mesh = combined; frame.material_override = StandardMaterial3D.new(); frame.material_override.albedo_color = Color("71917c"); add_child(frame); pieces.frame = frame
	highlights.register_surface(frame,"frame","lab/frame")
	var cutout := box("cutout",Vector3(0.4,-2.15,0),Vector3(1.8,0.8,0.08),Color("907855"))
	var cutout_quad := QuadMesh.new(); cutout_quad.size = Vector2(1.8,0.8); cutout.mesh = cutout_quad
	var mask := Image.create(64,64,false,Image.FORMAT_RGBA8); mask.fill(Color.WHITE)
	mask.fill_rect(Rect2i(20,20,24,24),Color(1,1,1,0))
	cutout.material_override.albedo_texture = ImageTexture.create_from_image(mask)
	cutout.material_override.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
	cutout.material_override.alpha_scissor_threshold = 0.5
	highlights.register_surface(cutout,"metal","lab/cutout")
	blocker = box("shadow only", Vector3(0,0,1.5),Vector3(10,10,0.2),Color.BLACK)
	blocker.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY; blocker.hide()
	hud = CanvasLayer.new(); add_child(hud)
	var panel := PanelContainer.new(); panel.position = Vector2(12,12); hud.add_child(panel)
	var ui = preload("res://rendering/painterly/highlights/controls.gd").new(); panel.add_child(ui); ui.setup(highlights)
	var label := Label.new(); label.position = Vector2(380,25); label.text = "GLASS              METAL              PAINTED FRAME\nB: highlights   L: local light   ← / →: sun angle"; hud.add_child(label)
	if OS.get_cmdline_user_args().has("--highlight-qa"):
		var qa = preload("res://demos/highlight_lab/qa.gd").new(); add_child(qa); qa.call_deferred("run",self)

func box(id: String, pos: Vector3, size: Vector3, color: Color) -> MeshInstance3D:
	var node := MeshInstance3D.new(); var mesh := BoxMesh.new(); mesh.size = size; node.mesh = mesh
	var mat := StandardMaterial3D.new(); mat.albedo_color = color; mat.roughness = 0.25; node.material_override = mat
	add_child(node); node.position = pos; pieces[id] = node; return node

func _unhandled_key_input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo: return
	if event.keycode == KEY_B: highlights.settings.enabled = not highlights.settings.enabled; highlights.refresh()
	if event.keycode == KEY_L: lamp.light_energy = 0 if lamp.light_energy > 0 else 3; sun.light_energy = 0 if lamp.light_energy > 0 else 1.5
	if event.keycode == KEY_LEFT: sun.rotation_degrees.y -= 5
	if event.keycode == KEY_RIGHT: sun.rotation_degrees.y += 5
