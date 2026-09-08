class_name PainterlyRenderer
extends Node
## Diffuse NPR renderer. Explicit registration; leaves unrelated scene materials alone.
## A double-buffered light-space capture is committed with matching light parameters.

const SURFACE_SHADER = preload("res://rendering/painterly/shaders/surface.gdshader")
const DEPTH_SHADER = preload("res://rendering/painterly/shaders/depth.gdshader")
const INPUTS = preload("res://rendering/painterly/painterly_surface.gd")

enum DebugView {BEAUTY, BASE, SUN, INDIRECT, PHYSICAL_MASK, PAINTED_MASK, IMPORTANCE, FLOW, STROKES, COLOR_WEIGHT, RAW_LINEAR, MASK_DIFFERENCE, PIGMENT_OVERLAP, BRISTLES, SEAM_MASK, SEAM_SOURCE, SEAM_DIRECTION}

const SEAM_COMPILER = preload("res://rendering/painterly/seam_paint.gd")
@export var seam_enabled := true
@export var seam_seed := 71
@export_range(0,1) var seam_strength := 1.0
@export_range(0.001,0.10) var seam_contact_tolerance_m := 0.035
@export_range(0,0.15) var seam_coverage := 0.08
@export_range(0,8) var seam_max_drips := 2
@export var seam_overrides: Array[PainterlySeam] = []
var seam_paint = SEAM_COMPILER.new()
var _seam_dirty := false

signal capture_committed(revision: int)

@export var capture_center := Vector3.ZERO
@export_range(8, 128) var capture_span := 32.0
@export_range(256, 4096, 256) var capture_resolution := 2048
@export var capture_distance := 36.0
@export var capture_far := 72.0
@export var shadow_bias_m := 0.035
@export var edge_width_m := 0.65
@export var stroke_length_m := 1.3
@export var stroke_width_m := 0.24
@export var brush_strength := 1.0
@export var drag_length_m := 0.9
@export var gap_depth_m := 0.5
@export_range(0,0.25) var overlap_darkening := 0.14
@export_range(0,1) var bristle_strength := 0.55
@export_range(0.008,0.16) var bristle_spacing_m := 0.09
@export_range(0,1) var stroke_group_density := 0.52
@export_range(0,45) var stroke_angle_jitter_degrees := 22.0
@export_range(0,0.5) var stroke_arc_bend_m := 0.22
@export var brush_texture: Texture2D
@export var oil_brush_atlas: Texture2D
@export var oil_brush_region_px := Vector4(48,452,1172,476)
@export_range(0,8) var oil_atlas_max_lod := 6.0
# Each texture is one independent gesture; array layers prevent mip bleed.
@export var shadow_brush_textures: Array[Texture2D] = []
@export var texture_shadows_enabled := true
@export_range(0.08,2.0,0.01) var shadow_brush_width_m := 0.85
@export_range(0.2,2.0,0.01) var shadow_length_min := 0.8
@export_range(0.2,2.0,0.01) var shadow_length_max := 1.2
@export_range(0,0.45,0.01) var shadow_brush_overlap := 0.2
@export var shadow_brush_seed := 17.0
@export_range(0.05,0.6,0.01) var shadow_root_fill_m := 0.22
# Continuous deposition from the user's embedded Procreate grains.
@export var procreate_shadows_enabled := false
@export var pressure_stamps_enabled := true
@export var pressure_settings: PainterlyPressureSettings = preload("res://rendering/painterly/default_pressure.tres").duplicate(true)
@export var rectangle_shadows_enabled := false
@export var rectangle_settings: Resource = preload("res://rendering/painterly/rectangle_brushes/settings.gd").new()
var rectangle_layout=preload("res://rendering/painterly/rectangle_brushes/layout.gd").new()
var rectangle_debug := false
var _procreate_grains: Texture2DArray
var _procreate_parameters := PackedVector4Array()
var _procreate_dynamics := PackedVector4Array()

func use_aui_vangogh() -> void:
    const BASE = "res://rendering/painterly/textures/aui-vangogh/"
    var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(BASE+"manifest.json"))
    var images: Array[Image] = []
    _procreate_parameters.clear()
    _procreate_dynamics.clear()
    for brush_name in ["Aui - Vangogh 05", "Aui - Vangogh 02", "Aui - Vangogh 06"]:
        for recipe in manifest.recipes:
            if recipe.name != brush_name: continue
            var texture: Texture2D = load(BASE+recipe.grain_file)
            var img: Image = texture.get_image()
            if img.is_compressed(): img.decompress()
            img.convert(Image.FORMAT_RGBA8)
            img.resize(1024,1024,Image.INTERPOLATE_LANCZOS)
            img.generate_mipmaps()
            images.append(img)
            _procreate_parameters.append(Vector4(recipe.textureScale,recipe.textureBrightness,recipe.textureContrast,recipe.dynamicsGlazedFlow))
            _procreate_dynamics.append(Vector4(recipe.plotSpacing,recipe.plotJitter,recipe.textureRotation,recipe.grainDepth))
    _procreate_grains = Texture2DArray.new()
    var error := _procreate_grains.create_from_images(images)
    procreate_shadows_enabled = error == OK
    if error != OK: push_error("Cannot load Aui Vangogh grains: %s" % error)
    while _procreate_parameters.size()<4: _procreate_parameters.append(Vector4.ZERO)
    while _procreate_dynamics.size()<4: _procreate_dynamics.append(Vector4.ZERO)
    refresh_settings()

var _brush_layers: Texture2DArray
var _brush_regions := PackedVector4Array()

@export var enabled := true
@export var selective_color := true
@export var exposure := 1.1
@export var color_response := 1.0
@export var contrast_response := 0.15
@export var edge_response := 0.8
@export var detail_response := 0.4
@export var chroma_gain := 0.20
@export var lightness_gain := 0.025
@export var debug_view: DebugView = DebugView.BEAUTY

var sun_direction := Vector3(-0.55, 0.8, 0.35).normalized()
var sun_color := Color("fff1da")
var sun_energy := 1.05
var ambient_color := Color("a7bddb")
var ambient_energy := 0.42
var capture_count := 0
var committed_revision := 0
var last_capture_latency_ms := 0.0
var _surfaces: Array[Dictionary] = []
var _captures: Array[SubViewport] = []
var _cameras: Array[Camera3D] = []
var _active := -1
var _busy := false
var _dirty := false
var _requested := 0
var _published_direction := Vector3.ZERO
var _capture_matrix := Transform3D.IDENTITY
var _published_span := 32.0
var _published_far := 72.0
var _published_caster_min := PackedVector4Array()
var _published_caster_max := PackedVector4Array()
var _published_caster_count := 0
var _next_stroke_id := 1

# Optional artist-authored mass proxies for complex architecture. Independent of
# physical depth members; avoids taking the first 32 arbitrary material surfaces.
var _custom_brush_casters: Array[AABB] = []
var _brush_caster_transform := Transform3D.IDENTITY

func set_brush_caster_volumes(volumes: Array[AABB], transform_: Transform3D) -> void:
    if volumes.size()>32:
        push_error("Brush caster proxy set exceeds 32 volumes")
        return
    _custom_brush_casters=volumes.duplicate()
    _brush_caster_transform=transform_
    request_capture()

func rebuild_brush_textures() -> void:
    var images: Array[Image] = []
    _brush_regions.clear()
    for source in shadow_brush_textures.slice(0,16):
        if source == null: continue
        var img: Image = source.get_image()
        if img==null: continue
        if img.is_compressed() and img.decompress()!=OK: continue
        img.convert(Image.FORMAT_RGBA8)
        # Standardize layer storage only; retain authored alpha and full gesture.
        img.resize(1024,384,Image.INTERPOLATE_LANCZOS)
        # Generated alpha can contain almost invisible pixels throughout padding.
        # Fit the UV rectangle to visible paint, without changing its alpha data.
        var first := Vector2i(img.get_width(),img.get_height())
        var last := Vector2i(-1,-1)
        for y in img.get_height():
            for x in img.get_width():
                if img.get_pixel(x,y).a>0.1:
                    first=Vector2i(mini(first.x,x),mini(first.y,y))
                    last=Vector2i(maxi(last.x,x),maxi(last.y,y))
        if last.x<0: continue
        var rect := Rect2i(first,last-first+Vector2i.ONE)
        if not rect.has_area(): continue
        _brush_regions.append(Vector4(rect.position.x/1024.0,rect.position.y/384.0,rect.size.x/1024.0,rect.size.y/384.0))
        img.generate_mipmaps()
        images.append(img)
    _brush_layers = null
    if not images.is_empty():
        _brush_layers = Texture2DArray.new()
        var error := _brush_layers.create_from_images(images)
        if error != OK:
            push_error("Cannot build shadow brush layers: %s" % error)
            _brush_layers = null
    while _brush_regions.size()<16: _brush_regions.append(Vector4.ZERO)
    refresh_settings()

func _ready() -> void:
    rebuild_brush_textures()
    if RenderingServer.get_current_rendering_method() != "forward_plus":
        push_error("PainterlyRenderer requires Forward+ and linear HDR viewport textures.")
        set_process(false)
        return
    for index in 2:
        var viewport := SubViewport.new()
        viewport.name = "LinearShadowCapture%d" % index
        viewport.size = Vector2i(capture_resolution, capture_resolution)
        viewport.own_world_3d = true
        viewport.use_hdr_2d = true
        viewport.msaa_3d = Viewport.MSAA_DISABLED
        viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
        add_child(viewport)
        var env_node := WorldEnvironment.new()
        env_node.environment = neutral_environment(Color.WHITE)
        viewport.add_child(env_node)
        var camera := Camera3D.new()
        camera.projection = Camera3D.PROJECTION_ORTHOGONAL
        camera.keep_aspect = Camera3D.KEEP_HEIGHT
        camera.near = 0.1
        viewport.add_child(camera)
        camera.make_current()
        _captures.append(viewport)
        _cameras.append(camera)
        RenderingServer.viewport_set_measure_render_time(viewport.get_viewport_rid(), true)

static func neutral_environment(background: Color) -> Environment:
    var env := Environment.new()
    env.background_mode = Environment.BG_COLOR
    env.background_color = background
    env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
    env.tonemap_exposure = 1.0
    env.adjustment_enabled = false
    env.ambient_light_source = Environment.AMBIENT_SOURCE_DISABLED
    env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
    env.glow_enabled = false
    return env

func register_surface(mesh: MeshInstance3D, inputs: Resource) -> ShaderMaterial:
    if _captures.is_empty() or mesh.mesh == null or not inputs is INPUTS:
        push_error("Register after the renderer is ready, using a MeshInstance3D and PainterlySurface.")
        return null
    for record in _surfaces:
        if record.mesh == mesh:
            push_error("A mesh can be registered only once; unregister it before replacing its inputs.")
            return null
    var material := ShaderMaterial.new()
    material.shader = SURFACE_SHADER
    var proxies: Array[MeshInstance3D] = []
    for i in 2:
        var proxy := MeshInstance3D.new()
        proxy.mesh = mesh.mesh
        var depth_material := ShaderMaterial.new()
        depth_material.shader = DEPTH_SHADER
        proxy.material_override = depth_material
        _captures[i].add_child(proxy)
        proxies.append(proxy)
    _surfaces.append({"mesh": mesh, "inputs": inputs, "material": material,
        "previous": mesh.material_override, "proxies": proxies,"stroke_id":_next_stroke_id,
        "transform": mesh.global_transform, "visible": mesh.is_visible_in_tree(), "geometry": mesh.mesh})
    mesh.material_override = material
    material.set_shader_parameter("receiver_stroke_id",float(_next_stroke_id))
    _next_stroke_id+=1
    _apply_inputs(_surfaces.back())
    _seam_dirty = true
    refresh_settings()
    request_capture()
    return material

func unregister_surface(mesh: MeshInstance3D) -> void:
    _seam_dirty = true
    for i in range(_surfaces.size()-1,-1,-1):
        var record := _surfaces[i]
        if record.mesh == mesh:
            if is_instance_valid(mesh) and mesh.material_override == record.material:
                mesh.material_override = record.previous
            for proxy in record.proxies:
                proxy.queue_free()
            _surfaces.remove_at(i)
    request_capture()

func _apply_inputs(record: Dictionary) -> void:
    var inputs: Resource = record.inputs
    var mat: ShaderMaterial = record.material
    record.caster_signature=[inputs.casts_shadow, inputs.albedo_texture if inputs.alpha_cutoff>0.0 else null,
        inputs.alpha_cutoff, inputs.albedo.a]
    mat.set_shader_parameter("base_color", inputs.albedo)
    for pair in [["albedo_texture","albedo_texture"],["importance_map","importance_map"],
                 ["flow_map","flow_map"],["indirect_map","indirect_map"],["contact_map","contact_protection_map"],["seam_protection_map","seam_protection_map"]]:
        var texture: Texture2D = inputs.get(pair[1])
        mat.set_shader_parameter(pair[0],texture)
        mat.set_shader_parameter("use_"+pair[0],texture != null)
    for key in ["default_importance","default_flow","map_plane","map_origin","map_extent","data_transform","indirect_alpha_occlusion","indirect_tint",
                "indirect_energy","painterly_shadows","contact_protection","alpha_cutoff"]:
        mat.set_shader_parameter(key, inputs.get(key))
    for proxy in record.proxies:
        proxy.visible = inputs.casts_shadow and record.mesh.is_visible_in_tree()
        proxy.material_override.set_shader_parameter("alpha_texture",inputs.albedo_texture)
        proxy.material_override.set_shader_parameter("use_alpha_texture",inputs.albedo_texture != null)
        proxy.material_override.set_shader_parameter("alpha_cutoff",inputs.alpha_cutoff)
        proxy.material_override.set_shader_parameter("base_alpha",inputs.albedo.a)

func refresh_surface_inputs(mesh: MeshInstance3D) -> void:
    _seam_dirty = true
    for record in _surfaces:
        if record.mesh == mesh:
            var previous_signature: Array=record.caster_signature.duplicate()
            _apply_inputs(record)
            if previous_signature != record.caster_signature:
                request_capture()

func set_lighting(direction_to_sun: Vector3, color: Color, energy: float) -> void:
    if direction_to_sun.length_squared() < 0.000001:
        push_error("Sun direction must be nonzero.")
        return
    var changed := not sun_direction.is_equal_approx(direction_to_sun.normalized())
    sun_direction = direction_to_sun.normalized()
    sun_color = color
    sun_energy = maxf(energy, 0.0)
    if changed or _active < 0:
        request_capture()
    elif not _busy:
        refresh_settings()

func set_environment_light(color: Color, energy: float) -> void:
    ambient_color = color
    ambient_energy = maxf(energy,0.0)
    refresh_settings()

func refresh_settings() -> void:
    if pressure_settings == null: pressure_settings=preload("res://rendering/painterly/pressure_settings.gd").new()
    var pressure_uniforms: Dictionary = pressure_settings.uniforms()
    var rectangle_values: Dictionary=rectangle_settings.shader_values()
    if rectangle_shadows_enabled and _active>=0:
        rectangle_layout.rebuild(_published_caster_min,_published_caster_max,_published_caster_count,_published_direction,shadow_brush_width_m,rectangle_settings)
    for record in _surfaces:
        var mat: ShaderMaterial = record.material
        mat.set_shader_parameter("rectangle_shadows_enabled",rectangle_shadows_enabled and rectangle_layout.texture!=null)
        mat.set_shader_parameter("rectangle_debug",rectangle_debug)
        mat.set_shader_parameter("rectangle_seed",float(rectangle_settings.seed+rectangle_settings.painting_revision*7919))
        if rectangle_layout.texture!=null:
            mat.set_shader_parameter("rectangle_bands",rectangle_layout.texture)
            mat.set_shader_parameter("rectangle_band_counts",rectangle_layout.counts)
        for key in rectangle_values:mat.set_shader_parameter(key,rectangle_values[key])
        mat.set_shader_parameter("pressure_stamps_enabled",pressure_stamps_enabled)
        for key in pressure_uniforms: mat.set_shader_parameter(key,pressure_uniforms[key])
        mat.set_shader_parameter("seam_enabled",seam_enabled)
        mat.set_shader_parameter("seam_strength",seam_strength)
        for key in ["enabled","selective_color","exposure","color_response","contrast_response",
                    "edge_response","detail_response","chroma_gain","lightness_gain","debug_view",
                    "shadow_bias_m","edge_width_m","stroke_length_m","stroke_width_m","brush_strength","drag_length_m","gap_depth_m","overlap_darkening","bristle_strength","bristle_spacing_m",
                    "stroke_group_density","stroke_angle_jitter_degrees","stroke_arc_bend_m"]:
            mat.set_shader_parameter(key,get(key))
        mat.set_shader_parameter("brush_texture",brush_texture)
        mat.set_shader_parameter("use_brush_texture",brush_texture != null)
        mat.set_shader_parameter("procreate_shadows_enabled",procreate_shadows_enabled and _procreate_grains != null)
        mat.set_shader_parameter("procreate_grains",_procreate_grains)
        mat.set_shader_parameter("procreate_parameters",_procreate_parameters)
        mat.set_shader_parameter("procreate_dynamics",_procreate_dynamics)
        mat.set_shader_parameter("oil_brush_atlas",oil_brush_atlas)
        mat.set_shader_parameter("oil_brush_region_px",oil_brush_region_px)
        mat.set_shader_parameter("shadow_brush_layers",_brush_layers)
        mat.set_shader_parameter("shadow_brush_regions",_brush_regions)
        mat.set_shader_parameter("shadow_brush_variant_count",_brush_layers.get_layers() if _brush_layers else 0)
        mat.set_shader_parameter("shadow_brush_width_m",maxf(shadow_brush_width_m,0.08))
        mat.set_shader_parameter("shadow_length_range",Vector2(clampf(minf(shadow_length_min,shadow_length_max),0.2,2.0),clampf(maxf(shadow_length_min,shadow_length_max),0.2,2.0)))
        mat.set_shader_parameter("shadow_brush_overlap",clampf(shadow_brush_overlap,0,0.45))
        mat.set_shader_parameter("shadow_brush_seed",shadow_brush_seed)
        mat.set_shader_parameter("shadow_root_fill_m",clampf(shadow_root_fill_m,0.05,0.6))
        mat.set_shader_parameter("oil_atlas_max_lod",oil_atlas_max_lod)
        mat.set_shader_parameter("use_oil_brush_atlas",texture_shadows_enabled and ((procreate_shadows_enabled and _procreate_grains != null) or _brush_layers != null or oil_brush_atlas != null))
        mat.set_shader_parameter("ambient_color",ambient_color)
        mat.set_shader_parameter("ambient_energy",ambient_energy)
        if _active >= 0:
            mat.set_shader_parameter("brush_caster_count",_published_caster_count)
            mat.set_shader_parameter("brush_caster_min",_published_caster_min)
            mat.set_shader_parameter("brush_caster_max",_published_caster_max)
            mat.set_shader_parameter("capture_valid",true)
            mat.set_shader_parameter("shadow_depth",_captures[_active].get_texture())
            mat.set_shader_parameter("light_view",_capture_matrix)
            mat.set_shader_parameter("light_span",_published_span)
            mat.set_shader_parameter("light_far",_published_far)
            mat.set_shader_parameter("sun_direction",_published_direction)
            # Only update color immediately when it belongs to the published direction.
            if sun_direction.is_equal_approx(_published_direction):
                mat.set_shader_parameter("sun_color",sun_color)
                mat.set_shader_parameter("sun_energy",sun_energy)

func request_capture() -> void:
    if _captures.is_empty():
        return
    _dirty = true
    _requested += 1
    if not _busy:
        _busy = true
        _capture_loop.call_deferred()

func _capture_loop() -> void:
    while _dirty and is_inside_tree():
        _dirty = false
        var revision := _requested
        var index := 1 if _active == 0 else 0
        var viewport := _captures[index]
        var camera := _cameras[index]
        var direction := sun_direction
        var color := sun_color
        var energy := sun_energy
        var span := maxf(capture_span,1.0)
        var far_distance := maxf(capture_far,1.0)
        viewport.size = Vector2i(capture_resolution,capture_resolution)
        camera.size = span
        camera.far = far_distance
        camera.position = capture_center+direction*capture_distance
        camera.look_at(capture_center, Vector3.FORWARD if absf(direction.y)>0.99 else Vector3.UP)
        var caster_min=PackedVector4Array()
        var caster_max=PackedVector4Array()
        for record in _surfaces:
            if not is_instance_valid(record.mesh):
                continue
            var proxy: MeshInstance3D = record.proxies[index]
            proxy.mesh = record.mesh.mesh
            proxy.global_transform = record.mesh.global_transform
            proxy.visible = record.inputs.casts_shadow and record.mesh.is_visible_in_tree()
            if proxy.visible and _custom_brush_casters.is_empty() and caster_min.size()<32:
                var bounds: AABB=proxy.global_transform*proxy.mesh.get_aabb()
                var lo=bounds.position
                var hi=bounds.end
                caster_min.append(Vector4(lo.x,lo.y,lo.z,float(record.stroke_id)))
                caster_max.append(Vector4(hi.x,hi.y,hi.z,0))
            proxy.material_override.set_shader_parameter("capture_far",far_distance)
        for i in _custom_brush_casters.size():
            var bounds: AABB=_brush_caster_transform*_custom_brush_casters[i]
            caster_min.append(Vector4(bounds.position.x,bounds.position.y,bounds.position.z,-100.0-float(i)))
            caster_max.append(Vector4(bounds.end.x,bounds.end.y,bounds.end.z,0))
        var start := Time.get_ticks_usec()
        var caster_count=caster_min.size()
        caster_min.resize(32)
        caster_max.resize(32)
        viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
        await RenderingServer.frame_post_draw
        if not is_inside_tree():
            return
        # Commit texture AND its camera/light snapshot together for the next main frame.
        _active = index
        _capture_matrix = camera.global_transform.affine_inverse()
        _published_direction = direction
        _published_span = span
        _published_far = far_distance
        _published_caster_min=caster_min
        _published_caster_max=caster_max
        _published_caster_count=caster_count
        for record in _surfaces:
            record.material.set_shader_parameter("sun_color",color)
            record.material.set_shader_parameter("sun_energy",energy)
        capture_count += 1
        committed_revision = revision
        last_capture_latency_ms = (Time.get_ticks_usec()-start)/1000.0
        refresh_settings()
        capture_committed.emit(revision)
        if _dirty:
            await get_tree().process_frame
    _busy = false

func rebuild_seam_paint() -> Dictionary:
    _seam_dirty = false
    return seam_paint.rebuild(self,_surfaces)

func _process(_delta: float) -> void:
    if _seam_dirty or seam_paint.needs_rebuild(self,_surfaces):
        var seam_report := rebuild_seam_paint()
        for error in seam_report.get("errors",[]): push_error(error)
    for i in range(_surfaces.size()-1,-1,-1):
        var record := _surfaces[i]
        if not is_instance_valid(record.mesh):
            for proxy in record.proxies:
                proxy.queue_free()
            _surfaces.remove_at(i)
            request_capture()
            continue
        var mesh: MeshInstance3D = record.mesh
        if record.transform != mesh.global_transform or record.visible != mesh.is_visible_in_tree() or record.geometry != mesh.mesh:
            record.transform = mesh.global_transform
            record.visible = mesh.is_visible_in_tree()
            record.geometry = mesh.mesh
            request_capture()

func is_capture_pending() -> bool:
    return _busy or _dirty

func get_capture_texture() -> Texture2D:
    return _captures[_active].get_texture() if _active>=0 else null

func get_stats() -> Dictionary:
    var gpu_ms := 0.0
    if _active>=0:
        gpu_ms = RenderingServer.viewport_get_measured_render_time_gpu(_captures[_active].get_viewport_rid())
    return {"seam_paint":seam_paint.stats,"registered_surfaces":_surfaces.size(),"capture_count":capture_count,
        "resolution":capture_resolution,"last_capture_latency_ms":last_capture_latency_ms,
        "last_capture_gpu_ms":gpu_ms if gpu_ms>0.0 else null,"committed_revision":committed_revision,
        "capture_color_storage_upper_bound_mib":2.0*capture_resolution*capture_resolution*8/1048576.0}

func _exit_tree() -> void:
    for record in _surfaces:
        if is_instance_valid(record.mesh) and record.mesh.material_override == record.material:
            record.mesh.material_override = record.previous
