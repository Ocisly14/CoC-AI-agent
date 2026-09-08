extends Node3D
## Static demo adapter: split draw surfaces, preserving source meshes, UVs and textures.
## Original colour atlases stay intact. Authored maps and painted signs use NPR.
## Glass/unsupported PBR stays native; brush shadows use architectural mass proxies.

var renderer: PainterlyRenderer
var records: Array[Dictionary] = []
var skipped: Array[String] = []
var _sources: Array[MeshInstance3D] = []
var _double_sided: Shader
var _clamped_shaders: Dictionary = {}
var _architecture: Node3D
var control_manifest: Dictionary
var control_profiles: Dictionary = {}
var control_textures: Dictionary = {}

func setup(demo: Node3D) -> void:
	renderer = PainterlyRenderer.new()
	renderer.name = "PainterlyRenderer"
	renderer.capture_center = Vector3(0, 3, 0)
	renderer.capture_span = 64.0
	renderer.capture_distance = 65.0
	renderer.capture_far = 130.0
	renderer.texture_shadows_enabled = true
	renderer.brush_strength = 1.0
	# Centimetre contact tolerance keeps the thin roof/rolled gutter rim from
	# collecting unrelated nearby channel facets as additional paint seams.
	renderer.seam_contact_tolerance_m = 0.01
	for variant in ["solid","asymmetric","offset-notch","knife","fine-tail"]:
		renderer.shadow_brush_textures.append(load("res://rendering/painterly/textures/oil-shadow-%s-preview-v1.png" % variant))
	renderer.detail_response = 0.22
	renderer.contrast_response = 0.18
	renderer.use_aui_vangogh()
	add_child(renderer)
	_architecture=demo.get_node("Bluebird/Architecture")
	control_manifest=JSON.parse_string(FileAccess.get_file_as_string("res://demos/bluebird/assets/control-maps/manifest.json"))
	for profile in control_manifest.profiles:
		control_profiles[profile.name]=profile
		for kind in ["importance","flow","indirect"]:
			control_textures[profile.name+"/"+kind]=load("res://demos/bluebird/assets/control-maps/"+profile.files[kind])
	var volumes: Array[AABB]=[]
	for volume in control_manifest.brush_casters:
		var lo=Vector3(volume.min[0],volume.min[1],volume.min[2])
		var hi=Vector3(volume.max[0],volume.max[1],volume.max[2])
		volumes.append(AABB(lo,hi-lo))
	renderer.set_brush_caster_volumes(volumes,_architecture.global_transform)
	_double_sided = Shader.new()
	_double_sided.code = PainterlyRenderer.SURFACE_SHADER.code.replace("render_mode unshaded, fog_disabled;", "render_mode unshaded, fog_disabled, cull_disabled;")
	for path in ["Bluebird/Architecture", "Streets", "Sidewalk", "RoadDetails"]:
		for source in demo.get_node(path).find_children("*", "MeshInstance3D", true, false):
			convert_mesh(source, path == "Bluebird/Architecture")

func convert_mesh(source: MeshInstance3D, architecture: bool) -> void:
	if source.mesh == null: return
	for index in source.mesh.get_surface_count():
		var original: Material = source.get_active_material(index)
		var part := MeshInstance3D.new()
		part.name = "%s_Surface%d" % [source.name, index]
		# Keep raw imported vertex buffers; rebuilding compressed arrays can re-quantize UVs.
		var geometry: Mesh = source.mesh
		if source.mesh is ArrayMesh:
			geometry = source.mesh.duplicate()
			for other in range(geometry.get_surface_count()-1, -1, -1):
				if other != index: geometry.surface_remove(other)
		part.mesh = geometry
		part.material_override = original
		add_child(part)
		part.global_transform = source.global_transform
		part.visible = source.is_visible_in_tree()
		var inputs := PainterlySurface.new()
		inputs.painterly_shadows = false
		inputs.default_importance = importance_for(source.name, original.resource_name if original else "", architecture)
		var procedural: bool = original is ShaderMaterial and original.shader.resource_path == "res://demos/bluebird/ground.gdshader"
		if original is BaseMaterial3D:
			if original.transparency not in [BaseMaterial3D.TRANSPARENCY_DISABLED,BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR] or original.metallic > 0.0 or original.normal_enabled or original.emission_enabled or original.uv1_scale != Vector3.ONE or original.uv1_offset != Vector3.ZERO:
				skipped.append("%s | %s" % [part.name, original.resource_name if original else "missing"])
				continue
			inputs.albedo = original.albedo_color
			inputs.albedo_texture = original.albedo_texture
			if original.transparency == BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR: inputs.alpha_cutoff=original.alpha_scissor_threshold
		elif procedural:
			inputs.albedo = original.get_shader_parameter("base_color")
		else:
			skipped.append("%s | %s" % [part.name, original.resource_name if original else "missing"])
			continue
		# Scene art settings only. Geometry discovery and pigment placement are global.
		inputs.paint_id = str(source.name)+"/"+str(index)
		var role: String = str(source.get_meta("extras",{}).get("role",""))
		inputs.paint_order = 30 if role=="roof" else (12 if role=="frame" else 10)
		var material_name: String = original.resource_name.to_lower()
		inputs.seam_protection = 1.0 if not architecture or source.get_meta("extras",{}).get("paintedLettering",false) or "sign" in str(source.name).to_lower() or "plaster" in material_name or "floor" in material_name else 0.0
		apply_control_maps(source,part,inputs,architecture)
		var material := renderer.register_surface(part, inputs)
		if original is BaseMaterial3D and original.cull_mode == BaseMaterial3D.CULL_DISABLED:
			material.shader = _double_sided
		# Whole-ground atlases must not wrap the opposite edge into their mip samples.
		if original is BaseMaterial3D and not original.texture_repeat:
			var key := material.shader.get_instance_id()
			if not _clamped_shaders.has(key):
				var clamped := Shader.new()
				clamped.code = material.shader.code.replace("source_color, filter_linear_mipmap_anisotropic, repeat_enable", "source_color, filter_linear_mipmap_anisotropic, repeat_disable")
				_clamped_shaders[key] = clamped
			material.shader = _clamped_shaders[key]
		if procedural:
			material.set_shader_parameter("procedural_ground", true)
			material.set_shader_parameter("secondary_color", original.get_shader_parameter("secondary_color"))
			material.set_shader_parameter("paving", original.get_shader_parameter("paving"))
		records.append({"source":source, "index":index, "part":part, "original":original, "inputs":inputs, "material":material, "architecture":architecture})
	_sources.append(source)
	source.hide()

func apply_control_maps(source: MeshInstance3D, part: MeshInstance3D, inputs: PainterlySurface, architecture: bool) -> void:
	var profile_name="ground"
	var extras: Dictionary=source.get_meta("extras",{})
	if architecture:
		var level=int(extras.get("floor",1 if source.name.begins_with("L1_") or source.name.begins_with("D1_") else 0))
		var side=str(extras.get("side","front"))
		var role=str(extras.get("role",""))
		if role in ["roof","floor"]: side="roof"
		elif side=="corner": side="front"
		elif side not in ["front","right","rear","left"]: return
		profile_name=side+"_"+str(level)
	if not control_profiles.has(profile_name): return
	var profile: Dictionary=control_profiles[profile_name]
	part.set_meta("control_profile",profile_name)
	inputs.map_plane=int(profile.plane)
	inputs.map_origin=Vector2(profile.origin[0],profile.origin[1])
	inputs.map_extent=Vector2(profile.extent[0],profile.extent[1])
	inputs.data_transform=_architecture.global_transform.affine_inverse()*part.global_transform
	inputs.importance_map=control_textures[profile_name+"/importance"]
	inputs.flow_map=control_textures[profile_name+"/flow"]
	inputs.indirect_map=control_textures[profile_name+"/indirect"]
	inputs.indirect_alpha_occlusion=true
	inputs.indirect_energy=1.0
	# Sign paint uses its own sharp alpha; retain its small letter detail.
	if extras.get("paintedLettering",false):
		inputs.importance_map=null
		inputs.default_importance=1.0
	inputs.painterly_shadows=not architecture or profile_name.begins_with("roof_")

func importance_for(mesh_name: String, material_name: String, architecture: bool) -> float:
	if not architecture: return 0.10
	var key := (mesh_name + " " + material_name).to_lower()
	if "sign" in key or "door" in key or "teal" in key: return 0.85
	if "roof" in key or "flue" in key or "vent" in key: return 0.20
	if "trim" in key or "frame" in key: return 0.50
	return 0.35

func sync_lighting(demo: Node3D) -> void:
	renderer.exposure = 1.45 if demo.evening else 1.20
	renderer.set_environment_light(demo.environment.ambient_light_color, demo.environment.ambient_light_energy)
	renderer.set_lighting(demo.sun.global_basis.z, demo.sun.light_color, demo.sun.light_energy)
	renderer.refresh_settings()

func _exit_tree() -> void:
	for source in _sources:
		if is_instance_valid(source): source.show()
