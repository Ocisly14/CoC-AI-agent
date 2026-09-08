class_name PainterlyHighlights
extends Node
## One extra material pass on the existing geometry. No per-frame work.
signal settings_changed
const SETTINGS = preload("res://rendering/painterly/highlights/settings.gd")
const SHADER = preload("res://rendering/painterly/highlights/highlight.gdshader")
const GROUPS = ["glass", "metal", "frame"]
var settings = SETTINGS.new()
var records: Array[Dictionary] = []
var brushes: Texture2DArray
var registration_count := 0
var direction_map_count := 0
var _direction_cache := {}

func load_brushes() -> bool:
	if brushes != null: return true
	var images: Array[Image] = []
	for group in GROUPS:
		for i in range(1, 5):
			var path := "res://rendering/painterly/highlights/textures/%s-%02d.png" % [group, i]
			if not ResourceLoader.exists(path):
				push_error("Missing oil highlight texture: " + path)
				return false
			var texture: Texture2D = load(path)
			var image := texture.get_image()
			if image.is_compressed(): image.decompress()
			image.convert(Image.FORMAT_RGBA8)
			# Full pages, including original transparent margins, never alpha-cropped.
			var fit := minf(960.0/image.get_width(), 336.0/image.get_height())
			image.resize(roundi(image.get_width()*fit), roundi(image.get_height()*fit), Image.INTERPOLATE_LANCZOS)
			var page := Image.create(1024, 384, false, Image.FORMAT_RGBA8)
			page.fill(Color(0,0,0,0))
			page.blit_rect(image, Rect2i(Vector2i.ZERO,image.get_size()), (page.get_size()-image.get_size())/2)
			page.generate_mipmaps()
			images.append(page)
	brushes = Texture2DArray.new()
	return brushes.create_from_images(images) == OK

func register_surface(mesh: MeshInstance3D, group: String, stable_id: String, original: Material = null, direction: Texture2D = null) -> void:
	if group not in GROUPS or mesh.mesh == null: return
	for record in records:
		if record.mesh == mesh: return
	if not load_brushes(): return
	var base: Material = mesh.material_override if mesh.material_override != null else mesh.get_active_material(0)
	if base == null: return
	var instance: Material = base.duplicate() if base is BaseMaterial3D else base
	if instance is BaseMaterial3D and group in ["glass", "metal"]:
		instance.roughness = maxf(instance.roughness, 0.4 if group == "glass" else 0.65)
	mesh.material_override = instance
	var pass_material := ShaderMaterial.new()
	pass_material.shader = SHADER
	# Preserve an existing next-pass chain and attach only our own final pass.
	var tail := instance
	while tail.next_pass != null:
		tail.next_pass = tail.next_pass.duplicate()
		tail = tail.next_pass
	tail.next_pass = pass_material
	var axis := Vector3.RIGHT
	var bounds := mesh.mesh.get_aabb().size
	if bounds.y > bounds.x and bounds.y > bounds.z: axis = Vector3.UP
	elif bounds.z > bounds.x: axis = Vector3.BACK
	pass_material.set_shader_parameter("default_axis", axis)
	pass_material.set_shader_parameter("object_scale", mesh.global_basis.get_scale().abs())
	pass_material.set_shader_parameter("brushes", brushes)
	pass_material.set_shader_parameter("brush_group", GROUPS.find(group))
	var source: Material = original if original != null else base
	if source is BaseMaterial3D:
		pass_material.set_shader_parameter("material_tint", source.albedo_color)
		pass_material.set_shader_parameter("base_alpha", source.albedo_color.a)
		pass_material.set_shader_parameter("base_texture", source.albedo_texture)
		pass_material.set_shader_parameter("use_base_texture", source.albedo_texture != null)
		pass_material.set_shader_parameter("base_uv_scale", Vector2(source.uv1_scale.x, source.uv1_scale.y))
		pass_material.set_shader_parameter("base_uv_offset", Vector2(source.uv1_offset.x, source.uv1_offset.y))
		if source.transparency == BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR:
			pass_material.set_shader_parameter("alpha_cutoff", source.alpha_scissor_threshold)
	if group == "frame" and direction == null: direction = direction_map(mesh.mesh)
	if direction != null:
		pass_material.set_shader_parameter("direction_map", direction)
		pass_material.set_shader_parameter("use_direction_map", true)
	records.append({"mesh": mesh, "group": group, "id": stable_id, "material": pass_material, "base": base, "instance": instance, "tail": tail, "direction_map": direction})
	registration_count += 1
	refresh()

func direction_map(mesh: Mesh) -> Texture2D:
	var key := mesh.get_rid()
	if _direction_cache.has(key): return _direction_cache[key]
	# Bake each rectangular face's longest local axis into its existing UV domain.
	# This distinguishes vertical and horizontal joinery within one imported mesh.
	var image := Image.create(256, 256, false, Image.FORMAT_RGB8)
	image.fill(Color(1, 0.5, 0.5))
	for surface in mesh.get_surface_count():
		var arrays := mesh.surface_get_arrays(surface)
		var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var uv: PackedVector2Array = arrays[Mesh.ARRAY_TEX_UV] if arrays[Mesh.ARRAY_TEX_UV] != null else PackedVector2Array()
		if uv.is_empty(): continue
		var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX] if arrays[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
		if indices.is_empty():
			for i in vertices.size(): indices.append(i)
		for i in range(0, indices.size()-2, 3):
			var a := indices[i]; var b := indices[i+1]; var c := indices[i+2]
			var extent := vertices[a].max(vertices[b]).max(vertices[c]) - vertices[a].min(vertices[b]).min(vertices[c])
			var direction := Vector3.ZERO
			direction[extent.max_axis_index()] = 1.0
			var color := Color(direction.x*0.5+0.5, direction.y*0.5+0.5, direction.z*0.5+0.5)
			var p := uv[a]*255; var q := uv[b]*255; var r := uv[c]*255
			var determinant := (q-p).cross(r-p)
			if absf(determinant) < 0.001: continue
			var lo := p.min(q).min(r).floor().clamp(Vector2.ZERO, Vector2(255,255))
			var hi := p.max(q).max(r).ceil().clamp(Vector2.ZERO, Vector2(255,255))
			for y in range(int(lo.y), int(hi.y)+1):
				for x in range(int(lo.x), int(hi.x)+1):
					var point := Vector2(x,y)-p
					var u := point.cross(r-p)/determinant
					var v := (q-p).cross(point)/determinant
					if u >= -0.015 and v >= -0.015 and u+v <= 1.015: image.set_pixel(x,y,color)
	var texture := ImageTexture.create_from_image(image)
	_direction_cache[key] = texture
	direction_map_count += 1
	return texture

func refresh() -> void:
	for record in records:
		if not is_instance_valid(record.mesh): continue
		var active: bool = settings.enabled and settings.get(record.group + "_enabled")
		# Detaching the pass makes OFF a real draw-call baseline.
		record.tail.next_pass = record.material if active else null
		var mat: ShaderMaterial = record.material
		mat.set_shader_parameter("effect_enabled", active)
		mat.set_shader_parameter("seed", float(posmod(hash(record.id) + settings.seed * 131, 32749)))
		mat.set_shader_parameter("strength", settings.strength)
		mat.set_shader_parameter("density", settings.density)
		mat.set_shader_parameter("debug_view", settings.debug_view)
		mat.set_shader_parameter("direction_angle", deg_to_rad(settings.direction_degrees))
		var size: Vector2 = {"glass": Vector2(1.0,0.38), "metal": Vector2(0.55,0.12), "frame": Vector2(0.65,0.09)}[record.group]
		mat.set_shader_parameter("stroke_size", size * settings.size_scale)
		var angles: Vector2 = settings.get(record.group + "_angles")
		var low := cos(deg_to_rad(maxf(angles.x, angles.y)))
		var high := cos(deg_to_rad(minf(angles.x, angles.y)))
		mat.set_shader_parameter("angle_cosines", Vector2(low, maxf(low+0.0001, high)))
	settings_changed.emit()

func repaint() -> void:
	settings.seed += 1
	refresh()

func get_stats() -> Dictionary:
	var groups := {"glass":0, "metal":0, "frame":0}
	var active := 0
	for record in records:
		if not is_instance_valid(record.mesh): continue
		groups[record.group] += 1
		if settings.enabled and settings.get(record.group+"_enabled") and record.mesh.is_visible_in_tree(): active += 1
	return {"registered":records.size(), "groups":groups, "active_passes":active, "registration_count":registration_count, "direction_maps":direction_map_count, "generated_meshes":0, "gpu_readbacks":0, "seed":settings.seed}
