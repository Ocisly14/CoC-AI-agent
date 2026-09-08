# 轮廓颜料带 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `PainterlyRenderer` 的跨表面叠色从"接触缝的材质阶段"改成"边的绘画几何"，让固定正交相机下的可见轮廓（含对天空）能承载失边与边缘并值。

**Architecture:** 两个边源（几何接触 + 屏幕空间深度断层）产出同一种世界空间边曲线，交给同一个笔触编译器生成每接收面一条 `ArrayMesh`，由 `ribbon.gdshader` 在运行期跑两遍光照算出并值与失边宽度。材质阶段的 `apply_seam_paint()` 最终拆除。

**Tech Stack:** Godot 4.7.2 / Forward+ / GDScript / Godot Shading Language。无第三方依赖。

**Spec:** `docs/superpowers/specs/2026-09-08-silhouette-paint-ribbon-design.md`

## Global Constraints

- **不自动提交。** 全部改动最后合成**一次**提交，且只在用户明确说提交时才提交。任务步骤里没有 commit 步。
- **不自动运行。** 所有 `Godot --path ...` 验收命令由用户运行。计划里写明命令和期望输出，执行者写完代码后请用户运行并回报结果。
- QA 需要真实 Forward+ 窗口，headless 会明确失败（`demos/seam_lab/lab.gd:53` 已有该判断）。
- 时间字段、命名、注释语言沿用现有文件风格：代码与标识符英文，说明性注释英文，文档中文。
- **Phase B（Task 6–9）当前被阻塞**：`godot-client/rendering/painterly/painterly_renderer.gd`、`shaders/surface.gdshader`、`shaders/shadow.gdshaderinc`、`demos/painterly_lab/lab.gd`、`demos/bluebird/street_corner.gd` 正被另一处（rectangle brushes 子系统）同时修改。Phase B 开工前必须由用户确认那批改动已落定。
- Phase A（Task 1–5）只碰新文件与 `demos/seam_lab/lab.gd`、`rendering/painterly/seam_paint.gd`，与上述文件零重叠。
- 每个笔触的稳定随机必须只依赖 `hash(stable_id) ^ renderer.seam_seed`，不得引入时间、相机位置或注册顺序。

## File Structure

| 文件 | 职责 | Phase |
| --- | --- | --- |
| `rendering/painterly/shaders/ribbon.gdshader` | 新建。颜料带材质 | A |
| `rendering/painterly/paint_ribbon.gd` | 由 `seam_paint.gd` 改名演化。边检测 + 笔触编译 + 建网格 | A |
| `rendering/painterly/shaders/surface_id.gdshader` | 新建。轮廓捕获用，深度 + 表面索引 | A |
| `rendering/painterly/silhouette_extractor.gd` | 新建。捕获、回读、断层扫描、折线追踪、反投影 | A |
| `rendering/painterly/shaders/lighting.gdshaderinc` | 新建。共享光照与选择性上色 | A（创建）/ B（surface 切换） |
| `demos/seam_lab/lab.gd` | 验收重做 | A |
| `rendering/painterly/painterly_renderer.gd` | 接线、新属性、改名、DebugView | B |
| `rendering/painterly/shaders/surface.gdshader` | 拆材质阶段、改用共享 include | B |
| `rendering/painterly/shaders/seam_paint.gdshaderinc` | 删除 | B |
| `demos/bluebird/street_corner.gd` | 接缝验收重做 | B |
| `shaders/shadow.gdshaderinc` | 只被 `ribbon.gdshader` include，本身不改 | B |
| `rendering/painterly/SEAM_PAINT.md` → `PAINT_RIBBON.md`、`README.md` | 文档 | B |

---

# Phase A — 不冲突的子集

## Task 1: ribbon 网格与最简材质（CONTACT mode）

把接触缝笔触从 uniform 数组换成 `ArrayMesh`，先用最简材质证明"quad 能画出来、颜色来自 donor、单向性不变"。此任务**不碰** `painterly_renderer.gd`：`seam_lab` 直接调用编译器并自己挂载网格。

**Files:**
- Create: `godot-client/rendering/painterly/shaders/ribbon.gdshader`
- Create: `godot-client/rendering/painterly/paint_ribbon.gd`（由 `seam_paint.gd` 复制演化；`seam_paint.gd` 暂时保留不动，Phase B 才删）
- Test: `godot-client/demos/seam_lab/lab.gd`

**Interfaces:**
- Consumes: `PainterlyRenderer` 的只读属性 `seam_seed`、`seam_coverage`、`seam_strength`、`seam_enabled`、`seam_contact_tolerance_m`、`seam_overrides`；`PainterlySurface` 的 `paint_id` / `paint_order` / `seam_participation` / `seam_protection`。
- Produces:
  - `PaintRibbon.rebuild(renderer: Node, records: Array) -> Dictionary`（统计字典，键见步骤 3）
  - `PaintRibbon.attach(anchor: Node3D) -> void`（按 `paint_id` 创建/更新 `MeshInstance3D` 子节点）
  - `PaintRibbon.build_mesh(own: Array[Dictionary], camera_forward: Vector3) -> ArrayMesh`
  - `PaintRibbon.stamps: Array[Dictionary]`，每个笔触新增键 `mode`（`MODE_CONTACT` / `MODE_SILHOUETTE` / `MODE_SKY`）、`length`、`max_width`、`depth_offset`、`receiver_albedo`、`importance`
  - 常量 `PaintRibbon.MODE_CONTACT = 0.0`、`MODE_SILHOUETTE = 1.0`、`MODE_SKY = 2.0`

- [ ] **Step 1: 复制编译器并改名**

```bash
cd /Users/sunyining/project_SentiEdge/CoC-AI-agent/godot-client/rendering/painterly
cp seam_paint.gd paint_ribbon.gd
```

`seam_paint.gd` 原地保留（Phase B 才删），这样 `painterly_renderer.gd` 现在依然能跑，不受本任务影响。

- [ ] **Step 2: 在 `paint_ribbon.gd` 顶部替换头部声明**

把文件开头的 `const MAX_STAMPS := 128` 那一段替换为：

```gdscript
extends RefCounted
## Scene-wide one-way paint compiled into world-anchored ribbon geometry.
## Two edge sources (geometric contact, screen-space silhouette) produce the
## same shape of data: a world-space polyline plus (donor, receiver) identity.

const RIBBON_SHADER = preload("res://rendering/painterly/shaders/ribbon.gdshader")
const BRUSH_NAMES := ["solid", "asymmetric", "offset-notch", "knife", "fine-tail"]
const MODE_CONTACT := 0.0
const MODE_SILHOUETTE := 1.0
const MODE_SKY := 2.0

var brush_layers: Texture2DArray
var brush_regions := PackedVector4Array()
var stamps: Array[Dictionary] = []
var seams: Array[Dictionary] = []
var ribbons := {}          # paint_id -> MeshInstance3D
var stats := {}
var errors: Array[String] = []
var _images := {}
var _geometry := {}
var _signature := ""
var build_count := 0
```

注意 `MAX_STAMPS` 被删除——几何没有 128 笔上限。

- [ ] **Step 3: 用 `build_mesh()` + `attach()` 替换 `upload()`**

删除 `paint_ribbon.gd` 末尾整个 `func upload(...)`，替换为：

```gdscript
func build_mesh(own: Array[Dictionary], camera_forward: Vector3) -> ArrayMesh:
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	var uvs := PackedVector2Array()
	var uv2s := PackedVector2Array()
	var colors := PackedColorArray()
	var custom0 := PackedFloat32Array()
	var custom1 := PackedFloat32Array()
	var indices := PackedInt32Array()
	for stamp in own:
		var t: Vector3 = stamp.tangent
		var c: Vector3 = stamp.center
		var u: Vector3
		if stamp.mode == MODE_CONTACT:
			u = stamp.normal.cross(t).normalized()
			c += stamp.normal * stamp.depth_offset
		else:
			u = t.cross(camera_forward).normalized()
			c -= camera_forward * stamp.depth_offset
		if u.length_squared() < 0.000001: continue
		var half_t: Vector3 = t * (stamp.length * 0.5)
		var half_u: Vector3 = u * (stamp.max_width * 0.5)
		var base := verts.size()
		verts.append_array(PackedVector3Array([c-half_t-half_u, c+half_t-half_u, c+half_t+half_u, c-half_t+half_u]))
		for i in 4: normals.append(stamp.normal)
		uvs.append_array(PackedVector2Array([Vector2(0,0), Vector2(1,0), Vector2(1,1), Vector2(0,1)]))
		for i in 4: uv2s.append(Vector2(stamp.variant, stamp.mode))
		var ink: Color = stamp.color
		for i in 4: colors.append(Color(ink.r, ink.g, ink.b, stamp.opacity))
		var dn: Vector3 = stamp.donor_normal
		var ra: Color = stamp.receiver_albedo
		for i in 4:
			custom0.append_array(PackedFloat32Array([dn.x, dn.y, dn.z, 0.0]))
			custom1.append_array(PackedFloat32Array([ra.r, ra.g, ra.b, stamp.importance]))
		indices.append_array(PackedInt32Array([base, base+1, base+2, base, base+2, base+3]))
	if verts.is_empty(): return null
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_TEX_UV2] = uv2s
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_CUSTOM0] = custom0
	arrays[Mesh.ARRAY_CUSTOM1] = custom1
	arrays[Mesh.ARRAY_INDEX] = indices
	var flags := (Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT) \
		| (Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM1_SHIFT)
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {}, flags)
	return mesh

func anchor_node(renderer: Node) -> Node3D:
	var node: Node = renderer
	while node != null and not node is Node3D: node = node.get_parent()
	return node

func attach(renderer: Node) -> void:
	var anchor := anchor_node(renderer)
	if anchor == null:
		errors.append("PainterlyRenderer has no Node3D ancestor to anchor ribbons to")
		return
	var wanted := {}
	for stamp in stamps:
		if not wanted.has(stamp.receiver_id): wanted[stamp.receiver_id] = []
		wanted[stamp.receiver_id].append(stamp)
	for id in ribbons.keys():
		if not wanted.has(id):
			ribbons[id].queue_free()
			ribbons.erase(id)
	var forward: Vector3 = _camera_forward
	for id in wanted:
		var mesh := build_mesh(wanted[id], forward)
		if mesh == null: continue
		var node: MeshInstance3D = ribbons.get(id)
		if node == null or not is_instance_valid(node):
			node = MeshInstance3D.new()
			node.name = "Ribbon_" + id.replace("/", "_")
			node.material_override = ShaderMaterial.new()
			node.material_override.shader = RIBBON_SHADER
			anchor.add_child(node)
			ribbons[id] = node
		node.transform = Transform3D.IDENTITY
		node.mesh = mesh
		node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var mat: ShaderMaterial = node.material_override
		mat.set_shader_parameter("brushes", brush_layers)
		mat.set_shader_parameter("seam_enabled", renderer.seam_enabled)
		mat.set_shader_parameter("seam_strength", renderer.seam_strength)
		mat.render_priority = clampi(int(_paint_orders.get(id, 0)), -128, 127)
```

`PainterlyRenderer` 继承 `Node` 而不是 `Node3D`，所以 ribbon 不能直接挂在 renderer 下——`anchor_node()` 找的是 renderer 最近的 `Node3D` 祖先，与 `anchor_transform()` 用的是同一个节点，这样笔触的 anchor 空间坐标与 ribbon 的父节点变换一致。

在 Step 2 的变量块末尾追加两个成员：

```gdscript
var _camera_forward := Vector3.FORWARD
var _paint_orders := {}    # paint_id -> paint_order，attach() 用来排 render_priority
```

- [ ] **Step 4: 在 `rebuild()` 里补齐笔触的新字段**

在 `rebuild()` 内构造 `stamp` 的那一行（现有 `var stamp: Dictionary={"id":stable_id+":"+str(i), ...}`）之后，紧接着补写新字段，并记录接收面颜色与 `paint_order`：

```gdscript
		stamp.mode = MODE_CONTACT
		# length runs along the seam, max_width reaches inward onto the receiver.
		stamp.length = stamp.width
		stamp.max_width = stamp.reach
		stamp.depth_offset = 0.004
		stamp.donor_normal = _geometry[seam.source_id].triangles[0].normal
		stamp.receiver_albedo = target.inputs.albedo.srgb_to_linear()
		stamp.importance = target.inputs.default_importance
		stamp.tangent = seam.tangent
		stamp.normal = seam.normal
```

注意轴的对应：`build_mesh()` 里 `t = stamp.tangent`（沿缝）乘 `length`，`u = normal × tangent`（即 `inward`）乘 `max_width`。所以 `length` 取原 `width`（沿缝的铺开量），`max_width` 取原 `reach`（向接收面的侵入量）。Task 4 会把 `max_width` 改成 `edge_width_max_m`，让侵入量在运行期可变。

在 `rebuild()` 的表面注册循环里（`registry[id]=record` 之后）追加：

```gdscript
		_paint_orders[id] = inputs.paint_order
```

并在 `rebuild()` 开头清空处（`errors.clear(); stamps.clear(); ...` 那一行）加上 `_paint_orders.clear()`。

- [ ] **Step 5: 把 `rebuild()` 末尾的上传循环换成建网格**

删掉现有的这一段：

```gdscript
	var receivers:=0
	for id in registry:
		var own: Array[Dictionary]=[]
		for stamp in stamps:
			if stamp.receiver_id==id: own.append(stamp)
		if own.size()>MAX_STAMPS: errors.append("More than 128 seam stamps on "+id)
		if not own.is_empty():
			receivers+=1
			upload(registry[id],_geometry[id].transform,own.slice(0,MAX_STAMPS),renderer)
	if not errors.is_empty():
		for record in records: record.material.set_shader_parameter("seam_stamp_count",0)
```

换成：

```gdscript
	var receivers := {}
	for stamp in stamps: receivers[stamp.receiver_id] = true
	if not stamps.is_empty(): load_brushes()
```

并把 `stats` 字典里的 `"receivers":receivers` 改为 `"receivers":receivers.size()`，追加 `"vertices":stamps.size()*4`、`"truncated":0`、`"contact_stamps":stamps.size()`、`"silhouette_stamps":0`、`"sky_stamps":0`。`"drips"` 键**本步保持不动**（滴的删除在 Task 5，提前删会让 `seam_lab` 现有的 drip cap 检查报错）。

同时删除 `rebuild()` 末尾的 `_images.clear();_geometry.clear()` 中的 `_geometry.clear()`——`attach()` 不再需要 `_geometry`，但 Task 3 的轮廓反投影需要它保留到 `attach()` 之后。改为只 `_images.clear()`，并在 `attach()` 末尾清 `_geometry`。

- [ ] **Step 6: 写最简 `ribbon.gdshader`**

Create `godot-client/rendering/painterly/shaders/ribbon.gdshader`:

```glsl
shader_type spatial;
render_mode blend_mix, unshaded, fog_disabled, depth_draw_never, cull_disabled;

uniform bool seam_enabled = true;
uniform float seam_strength = 1.0;
uniform sampler2DArray brushes : filter_linear_mipmap, repeat_disable;

varying vec3 donor_albedo;
varying vec3 donor_normal;
varying vec3 receiver_albedo;
varying float importance;
varying float opacity;
varying float variant;
varying float mode;

void vertex() {
    donor_albedo = COLOR.rgb;
    opacity = COLOR.a;
    donor_normal = normalize(CUSTOM0.xyz);
    receiver_albedo = CUSTOM1.rgb;
    importance = CUSTOM1.a;
    variant = UV2.x;
    mode = UV2.y;
}

void fragment() {
    if (!seam_enabled) { discard; }
    float a = texture(brushes, vec3(UV, variant)).a;
    if (a < 0.001) { discard; }
    ALBEDO = donor_albedo;
    ALPHA = a * opacity * seam_strength;
}
```

`donor_normal`、`receiver_albedo`、`importance`、`mode` 本任务不用，但先接好通道，Task 4 直接用。

- [ ] **Step 7: 在 `seam_lab` 里加失败的检查**

Modify `godot-client/demos/seam_lab/lab.gd`。在 `run()` 里 `var report:=renderer.rebuild_seam_paint()` 那一行**之前**插入一段独立的 ribbon 检查（不干扰现有材质阶段的检查）：

```gdscript
	# --- ribbon geometry (Task 1) ---
	var ribbon = preload("res://rendering/painterly/paint_ribbon.gd").new()
	var ribbon_report: Dictionary = ribbon.rebuild(renderer, renderer._surfaces)
	check(ribbon_report.errors.is_empty(), "Ribbon compiler runs without errors")
	check(ribbon_report.stamps > 0, "Ribbon compiler finds the red/blue contact")
	check(ribbon_report.get("vertices", 0) == ribbon_report.stamps * 4, "Every stamp becomes one quad")
	for stamp in ribbon.stamps:
		check(stamp.mode == ribbon.MODE_CONTACT, "Contact stamps carry CONTACT mode")
		check(stamp.source_id == "red" and stamp.receiver_id == "blue", "Ribbon keeps one-way deposition")
	ribbon.attach(renderer)
	check(ribbon.ribbons.has("blue"), "A ribbon mesh is attached for the receiving surface")
	check(not ribbon.ribbons.has("red"), "The donor surface gets no ribbon")
	var blue_ribbon: MeshInstance3D = ribbon.ribbons["blue"]
	check(blue_ribbon.mesh != null and blue_ribbon.mesh.get_surface_count() == 1, "Ribbon mesh has one surface")
	check(blue_ribbon.mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX].size() == ribbon.stamps.size() * 4, "Vertex count matches stamp count")
	var ribbon_before := await frame()
	ribbon.attach(renderer)
	var ribbon_after := await frame()
	check(ribbon_before.get_data() == ribbon_after.get_data(), "Re-attaching the same compile is idempotent on screen")
	for node in ribbon.ribbons.values(): node.queue_free()
	ribbon.ribbons.clear()
	await frame()
```

- [ ] **Step 8: 请用户运行验收，确认新检查先失败再通过**

请用户运行：

```sh
Godot --path godot-client --scene res://demos/seam_lab/lab.tscn -- --seam-qa
```

期望：`SEAM_QA` 输出的 `checks` 比改动前多 8 项，`failures` 为空。若 `Every stamp becomes one quad` 失败，检查 Step 5 的 `stats.vertices`；若 `Ribbon mesh has one surface` 失败，检查 Step 3 的 `flags` 是否同时声明了 CUSTOM0 与 CUSTOM1 的格式。

---

## Task 2: 轮廓提取器

从固定正交相机取一张深度 + 表面索引图，扫出断层，链成折线，反投影成世界空间边曲线。此任务只产出边数据，不生成笔触。

**Files:**
- Create: `godot-client/rendering/painterly/shaders/surface_id.gdshader`
- Create: `godot-client/rendering/painterly/silhouette_extractor.gd`
- Test: `godot-client/demos/seam_lab/lab.gd`

**Interfaces:**
- Consumes: `PaintRibbon` 无；本任务独立。
- Produces:
  - `SilhouetteExtractor.extract(host: Node, source_camera: Camera3D, records: Array, anchor_inverse: Transform3D, resolution_scale: float, depth_threshold_m: float, min_length_m: float) -> Array[Dictionary]`
  - 每条边：`{"a": Vector3, "b": Vector3, "tangent": Vector3, "near_id": String, "far_id": String, "kind": "silhouette"|"sky", "normal": Vector3}`；`far_id` 为 `""` 表示背景，此时 `kind == "sky"`。
  - `SilhouetteExtractor.stats: Dictionary`，键 `capture_ms`、`scan_ms`、`trace_ms`、`boundary_pixels`、`chains`、`edges`。
  - `SilhouetteExtractor.last_error: String`，空串表示成功。

- [ ] **Step 1: 写 `surface_id.gdshader`**

Create `godot-client/rendering/painterly/shaders/surface_id.gdshader`:

```glsl
shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled;
uniform float capture_near = 0.1;
uniform float capture_far = 180.0;
uniform float surface_index = 0.0;
uniform sampler2D alpha_texture : source_color, filter_linear_mipmap, repeat_enable;
uniform bool use_alpha_texture = false;
uniform float base_alpha = 1.0;
uniform float alpha_cutoff = 0.0;
void fragment() {
    float a = use_alpha_texture ? texture(alpha_texture, UV).a : 1.0;
    if (a * base_alpha < alpha_cutoff) { discard; }
    // Same high/low split as depth.gdshader; RGBA16F holds the index exactly.
    float depth = clamp((-VERTEX.z - capture_near) / (capture_far - capture_near), 0.0, 1.0);
    ALBEDO = vec3(floor(depth * 64.0) / 64.0, fract(depth * 64.0), surface_index);
}
```

- [ ] **Step 2: 写提取器骨架与捕获**

Create `godot-client/rendering/painterly/silhouette_extractor.gd`:

```gdscript
extends RefCounted
## Screen-space silhouette extraction for a locked orthographic camera.
## Runs once at load; the curves it returns are anchored in world space, so
## panning and zooming never move them.

const ID_SHADER = preload("res://rendering/painterly/shaders/surface_id.gdshader")

var stats := {}
var last_error := ""
var _viewport: SubViewport
var _camera: Camera3D
var _proxies: Array[MeshInstance3D] = []

func _capture(host: Node, source_camera: Camera3D, records: Array, scale: float) -> Image:
	var base := source_camera.get_viewport().get_visible_rect().size
	var size := Vector2i(mini(int(base.x * scale), 4096), mini(int(base.y * scale), 4096))
	if _viewport == null:
		_viewport = SubViewport.new()
		_viewport.name = "SilhouetteCapture"
		_viewport.own_world_3d = true
		_viewport.use_hdr_2d = true
		_viewport.msaa_3d = Viewport.MSAA_DISABLED
		_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
		host.add_child(_viewport)
		var env := WorldEnvironment.new()
		# Background must stay pure black so index 0 means "no surface".
		env.environment = host.neutral_environment(Color.BLACK)
		_viewport.add_child(env)
		_camera = Camera3D.new()
		_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
		_camera.keep_aspect = Camera3D.KEEP_HEIGHT
		_viewport.add_child(_camera)
		_camera.make_current()
	_viewport.size = size
	_camera.global_transform = source_camera.global_transform
	_camera.size = source_camera.size
	_camera.near = source_camera.near
	_camera.far = source_camera.far
	for proxy in _proxies: proxy.queue_free()
	_proxies.clear()
	for i in records.size():
		var record: Dictionary = records[i]
		if not is_instance_valid(record.mesh) or record.mesh.mesh == null: continue
		if not record.mesh.is_visible_in_tree(): continue
		var proxy := MeshInstance3D.new()
		proxy.mesh = record.mesh.mesh
		proxy.global_transform = record.mesh.global_transform
		var mat := ShaderMaterial.new()
		mat.shader = ID_SHADER
		mat.set_shader_parameter("capture_near", _camera.near)
		mat.set_shader_parameter("capture_far", _camera.far)
		mat.set_shader_parameter("surface_index", float(i + 1))
		mat.set_shader_parameter("alpha_texture", record.inputs.albedo_texture)
		mat.set_shader_parameter("use_alpha_texture", record.inputs.albedo_texture != null)
		mat.set_shader_parameter("alpha_cutoff", record.inputs.alpha_cutoff)
		mat.set_shader_parameter("base_alpha", record.inputs.albedo.a)
		proxy.material_override = mat
		_viewport.add_child(proxy)
		_proxies.append(proxy)
	_viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
	await RenderingServer.frame_post_draw
	return _viewport.get_texture().get_image()
```

- [ ] **Step 3: 写断层扫描与折线追踪**

追加到 `silhouette_extractor.gd`:

```gdscript
func _decode_depth(pixel: Color) -> float:
	return pixel.r + pixel.g / 64.0

func _scan(image: Image, threshold: float, near: float, far: float) -> Dictionary:
	# key: "x,y" of the near-side pixel -> {near_index, far_index, dir}
	var found := {}
	var span := far - near
	var w := image.get_width()
	var h := image.get_height()
	for y in h - 1:
		for x in w - 1:
			var here := image.get_pixel(x, y)
			for offset in [Vector2i(1, 0), Vector2i(0, 1)]:
				var there := image.get_pixel(x + offset.x, y + offset.y)
				var ia := int(round(here.b))
				var ib := int(round(there.b))
				var da := _decode_depth(here) * span + near
				var db := _decode_depth(there) * span + near
				var boundary := false
				if ia != ib: boundary = true
				elif ia != 0 and absf(da - db) > threshold: boundary = true
				if not boundary: continue
				if ia == 0 and ib == 0: continue
				var near_px := Vector2i(x, y)
				var near_index := ia
				var far_index := ib
				if ia == 0 or (ib != 0 and db < da):
					near_px = Vector2i(x + offset.x, y + offset.y)
					near_index = ib
					far_index = ia
				var key := "%d,%d" % [near_px.x, near_px.y]
				if not found.has(key):
					found[key] = {"px": near_px, "near_index": near_index, "far_index": far_index,
						"depth": _decode_depth(image.get_pixelv(near_px)) * span + near}
	return found

func _trace(found: Dictionary) -> Array:
	# 8-neighbour chains, grouped by (near_index, far_index).
	var groups := {}
	for key in found:
		var entry: Dictionary = found[key]
		var gk := "%d>%d" % [entry.near_index, entry.far_index]
		if not groups.has(gk): groups[gk] = {}
		groups[gk][key] = entry
	var chains := []
	for gk in groups:
		var pool: Dictionary = groups[gk]
		while not pool.is_empty():
			var start_key: String = pool.keys()[0]
			var chain := [pool[start_key]]
			pool.erase(start_key)
			var grew := true
			while grew:
				grew = false
				var tail: Dictionary = chain[-1]
				for dy in [-1, 0, 1]:
					for dx in [-1, 0, 1]:
						if dx == 0 and dy == 0: continue
						var nk := "%d,%d" % [tail.px.x + dx, tail.px.y + dy]
						if pool.has(nk):
							chain.append(pool[nk])
							pool.erase(nk)
							grew = true
							break
					if grew: break
			chains.append(chain)
	return chains

func _simplify(points: Array, epsilon: float) -> Array:
	if points.size() < 3: return points
	var dmax := 0.0
	var index := 0
	var first: Vector2 = points[0]
	var last: Vector2 = points[-1]
	var axis := last - first
	var length := axis.length()
	for i in range(1, points.size() - 1):
		var p: Vector2 = points[i]
		var d: float = (p - first).length() if length < 0.000001 \
			else absf(axis.cross(p - first)) / length
		if d > dmax:
			dmax = d
			index = i
	if dmax <= epsilon: return [first, last]
	var left := _simplify(points.slice(0, index + 1), epsilon)
	var right := _simplify(points.slice(index), epsilon)
	return left.slice(0, left.size() - 1) + right
```

- [ ] **Step 4: 写反投影与 `extract()` 入口**

追加到 `silhouette_extractor.gd`:

```gdscript
func extract(host: Node, source_camera: Camera3D, records: Array, anchor_inverse: Transform3D,
		resolution_scale: float, depth_threshold_m: float, min_length_m: float) -> Array[Dictionary]:
	last_error = ""
	stats = {}
	var t0 := Time.get_ticks_usec()
	var image: Image = await _capture(host, source_camera, records, resolution_scale)
	if image == null or image.get_width() == 0:
		last_error = "Silhouette capture returned no image"
		return []
	var t1 := Time.get_ticks_usec()
	var found := _scan(image, depth_threshold_m, source_camera.near, source_camera.far)
	var t2 := Time.get_ticks_usec()
	var chains := _trace(found)
	var t3 := Time.get_ticks_usec()
	var base := source_camera.get_viewport().get_visible_rect().size
	var sx := base.x / float(image.get_width())
	var sy := base.y / float(image.get_height())
	var forward := -source_camera.global_transform.basis.z
	var edges: Array[Dictionary] = []
	for chain in chains:
		var screen := []
		for entry in chain: screen.append(Vector2(entry.px.x, entry.px.y))
		var simplified := _simplify(screen, 2.0)
		for i in simplified.size() - 1:
			var pa: Vector2 = simplified[i]
			var pb: Vector2 = simplified[i + 1]
			var da: float = chain[0].depth
			var wa: Vector3 = anchor_inverse * source_camera.project_position(Vector2(pa.x * sx, pa.y * sy), da)
			var wb: Vector3 = anchor_inverse * source_camera.project_position(Vector2(pb.x * sx, pb.y * sy), da)
			if wa.distance_to(wb) < min_length_m: continue
			var near_record: Dictionary = records[chain[0].near_index - 1]
			var far_id := ""
			if chain[0].far_index > 0:
				far_id = _id_of(records[chain[0].far_index - 1], host)
			edges.append({
				"a": wa, "b": wb, "tangent": (wb - wa).normalized(),
				"near_id": _id_of(near_record, host), "far_id": far_id,
				"kind": "sky" if far_id == "" else "silhouette",
				"normal": (anchor_inverse.basis * forward) * -1.0,
			})
	stats = {"capture_ms": (t1-t0)/1000.0, "scan_ms": (t2-t1)/1000.0, "trace_ms": (t3-t2)/1000.0,
		"boundary_pixels": found.size(), "chains": chains.size(), "edges": edges.size()}
	return edges

func _id_of(record: Dictionary, host: Node) -> String:
	var inputs: Resource = record.inputs
	return inputs.paint_id if inputs.paint_id != "" else str(host.get_path_to(record.mesh))
```

- [ ] **Step 5: 在 `seam_lab` 里加一个有间隙的 fixture 并检查**

Modify `godot-client/demos/seam_lab/lab.gd`。`_ready()` 里现有四片 quad 之后追加一片**悬空**的 quad，它与任何东西都不接触，因此接触编译器看不到它，但轮廓提取器必须看到它对背景的边：

```gdscript
	quad("floating", Rect2(0.5, 3.6, 2, 1), 0, Color("8f6fb0"), 40)
```

在 Task 1 加的 ribbon 检查段之后追加：

```gdscript
	# --- silhouette extraction (Task 2) ---
	var extractor = preload("res://rendering/painterly/silhouette_extractor.gd").new()
	var edges: Array[Dictionary] = await extractor.extract(self, camera, renderer._surfaces,
		Transform3D.IDENTITY, 2.0, 0.15, 0.25)
	check(extractor.last_error == "", "Silhouette extraction succeeds on a real GPU window")
	check(edges.size() > 0, "Silhouette extraction finds edges")
	var sky_edges := 0
	var floating_sky := 0
	for edge in edges:
		if edge.kind == "sky":
			sky_edges += 1
			if edge.near_id == "floating": floating_sky += 1
		check(edge.near_id != "", "Every silhouette edge names a near surface")
		check(edge.a.distance_to(edge.b) >= 0.25, "Short chains are dropped")
	check(sky_edges > 0, "Edges against the background are found")
	check(floating_sky > 0, "The floating quad, which touches nothing, still yields sky edges")
	check(extractor.stats.boundary_pixels > 0, "Scan reports boundary pixels")
```

- [ ] **Step 6: 请用户运行验收**

请用户运行：

```sh
Godot --path godot-client --scene res://demos/seam_lab/lab.tscn -- --seam-qa
```

期望 `failures` 为空。若 `The floating quad ... still yields sky edges` 失败，先看 `extractor.stats.boundary_pixels`：为 0 说明捕获图的 B 通道没写进索引（检查 `WorldEnvironment` 背景是否为纯黑、`use_hdr_2d` 是否为 true）。

---

## Task 3: 轮廓边接进编译器（SILHOUETTE / SKY mode）

把提取器产出的边喂给同一个笔触编译器，生成相机平面内的 quad。

**Files:**
- Modify: `godot-client/rendering/painterly/paint_ribbon.gd`
- Modify: `godot-client/rendering/painterly/shaders/ribbon.gdshader`
- Test: `godot-client/demos/seam_lab/lab.gd`

**Interfaces:**
- Consumes: `SilhouetteExtractor.extract(...) -> Array[Dictionary]`（Task 2 的返回结构）；`PaintRibbon.build_mesh(own, camera_forward)`（Task 1）。
- Produces: `PaintRibbon.rebuild(renderer, records, silhouette_edges: Array = [], camera_forward: Vector3 = Vector3.FORWARD) -> Dictionary`，`stats` 新增 `silhouette_stamps` / `sky_stamps` 真值。

- [ ] **Step 1: 扩展 `rebuild()` 签名并保存相机朝向**

把 `paint_ribbon.gd` 的 `func rebuild(renderer: Node, records: Array) -> Dictionary:` 改为：

```gdscript
func rebuild(renderer: Node, records: Array, silhouette_edges: Array = [], camera_forward: Vector3 = Vector3.FORWARD) -> Dictionary:
	_camera_forward = camera_forward.normalized() if camera_forward.length_squared() > 0.000001 else Vector3.FORWARD
```

- [ ] **Step 2: 在接触笔触生成之后追加轮廓笔触生成**

在 `rebuild()` 里现有的 `for seam in seams:` 循环**结束之后**、`drip_candidates.sort_custom(...)` 之前插入：

```gdscript
	# Silhouette edges reuse the same stable random vocabulary as contact seams.
	var silhouette_count := 0
	var sky_count := 0
	for edge in silhouette_edges:
		if not registry.has(edge.near_id): continue
		var length_: float = edge.a.distance_to(edge.b)
		var donor: Dictionary = registry[edge.near_id]
		var receiver: Dictionary = registry[edge.far_id] if registry.has(edge.far_id) else donor
		var is_sky: bool = edge.kind == "sky"
		var receiver_id: String = edge.far_id if not is_sky else edge.near_id
		var stable_id := edge.near_id + ">" + (edge.far_id if not is_sky else "sky") + ":" + key_point(edge.a) + "|" + key_point(edge.b)
		var rng := RandomNumberGenerator.new()
		rng.seed = hash(stable_id) ^ renderer.seam_seed
		var count := maxi(1, roundi(length_ / 1.6))
		var width: float = minf(0.45, length_ * clampf(renderer.seam_coverage, 0, 0.15) / count * 4.0)
		if width < 0.02: continue
		for i in count:
			var distance_: float = length_ * (i + rng.randf_range(0.22, 0.78)) / count
			var center: Vector3 = edge.a + edge.tangent * distance_
			var ink: Color = sample_source(donor, _geometry[edge.near_id], center, edge.tangent)
			var stamp := {
				"id": stable_id + ":" + str(i),
				"source_id": edge.near_id, "receiver_id": receiver_id,
				"center": center, "tangent": edge.tangent, "normal": edge.normal,
				"inward": edge.normal, "width": width, "reach": 0.0,
				"length": length_ / count * rng.randf_range(0.8, 1.2),
				"max_width": width * rng.randf_range(0.72, 1.0),
				"depth_offset": 0.004,
				"opacity": rng.randf_range(0.78, 0.98) * (1.0 - donor.inputs.seam_protection),
				"color": ink,
				"variant": 0 if rng.randf() < 0.55 else rng.randi_range(1, 4),
				"tilt": rng.randf_range(-0.20, 0.20),
				"drip_length": 0.0, "drip_width": 0.0, "drip_direction": Vector3.ZERO,
				"drip_priority": 1.0, "long_drip": false,
				"order": donor.inputs.paint_order,
				"mode": MODE_SKY if is_sky else MODE_SILHOUETTE,
				"donor_normal": _geometry[edge.near_id].triangles[0].normal,
				"receiver_albedo": receiver.inputs.albedo.srgb_to_linear(),
				"importance": receiver.inputs.default_importance,
			}
			stamps.append(stamp)
			if is_sky: sky_count += 1
			else: silhouette_count += 1
```

`SKY` mode 的 `receiver_id` 取近侧自己——它没有别的接收面，ribbon 挂在近侧表面的网格下，`receiver_albedo` 由 Task 4 在着色时用背景参考色覆盖。

- [ ] **Step 3: 更新 stats**

把 Task 1 Step 5 里写死的 `"contact_stamps":stamps.size()`、`"silhouette_stamps":0`、`"sky_stamps":0` 改为：

```gdscript
		"contact_stamps": stamps.size() - silhouette_count - sky_count,
		"silhouette_stamps": silhouette_count,
		"sky_stamps": sky_count,
		"vertices": stamps.size() * 4,
```

- [ ] **Step 4: 让 `ribbon.gdshader` 按 mode 分支采样**

`ribbon.gdshader` 的 `fragment()` 暂不需要改（两种 mode 采样方式相同），但要确认 `mode` varying 已接好。本步只在 fragment 开头加一行调试友好的保护：

```glsl
void fragment() {
    if (!seam_enabled) { discard; }
    float a = texture(brushes, vec3(UV, variant)).a;
    if (a < 0.001) { discard; }
    ALBEDO = donor_albedo;
    ALPHA = a * opacity * seam_strength;
}
```

保持不变。几何差异全部在 `build_mesh()` 里，着色不需要知道。

- [ ] **Step 5: 在 `seam_lab` 里检查两类笔触**

把 Task 2 那段检查之后追加：

```gdscript
	# --- silhouette stamps (Task 3) ---
	var mixed: Dictionary = ribbon.rebuild(renderer, renderer._surfaces, edges, -camera.global_transform.basis.z)
	check(mixed.contact_stamps > 0, "Contact stamps survive alongside silhouette stamps")
	check(mixed.silhouette_stamps + mixed.sky_stamps > 0, "Silhouette edges produce stamps")
	check(mixed.vertices == mixed.stamps * 4, "Mixed compile still emits one quad per stamp")
	var modes := {}
	for stamp in ribbon.stamps: modes[stamp.mode] = true
	check(modes.has(ribbon.MODE_CONTACT), "CONTACT mode present")
	check(modes.has(ribbon.MODE_SKY), "SKY mode present")
	var camera_plane_ok := true
	for stamp in ribbon.stamps:
		if stamp.mode == ribbon.MODE_CONTACT: continue
		var u: Vector3 = stamp.tangent.cross(-camera.global_transform.basis.z)
		if absf(u.dot(-camera.global_transform.basis.z)) > 0.001: camera_plane_ok = false
	check(camera_plane_ok, "Silhouette quads lie in the camera plane")
	ribbon.attach(renderer)
	var with_silhouette := await frame("07-silhouette.png")
	check(with_silhouette != null, "Silhouette ribbons render")
	for node in ribbon.ribbons.values(): node.queue_free()
	ribbon.ribbons.clear()
	await frame()
```

- [ ] **Step 6: 请用户运行验收**

```sh
Godot --path godot-client --scene res://demos/seam_lab/lab.tscn -- --seam-qa
```

期望 `failures` 为空，且 `demos/seam_lab/qa/07-silhouette.png` 里能看到悬空紫色 quad 边缘出现颜料。

---

## Task 4: 运行期光照、并值与失边宽度

让 ribbon 自己受光，并把两侧明度差变成宽度和中间色。

**Files:**
- Create: `godot-client/rendering/painterly/shaders/lighting.gdshaderinc`
- Modify: `godot-client/rendering/painterly/shaders/ribbon.gdshader`
- Modify: `godot-client/rendering/painterly/paint_ribbon.gd`
- Test: `godot-client/demos/seam_lab/lab.gd`

**Interfaces:**
- Consumes: `color.gdshaderinc` 的 `to_oklab` / `from_oklab` / `luminance` / `confidence` / `soft_limit` / `output_map`。
- Produces: `lighting.gdshaderinc` 导出 `vec3 painterly_light(vec3 albedo, vec3 normal, vec3 sun_dir, vec3 sun_rgb, float sun_e, vec3 ambient_rgb, float ambient_e, bool selective, float importance, float chroma_g, float lightness_g, float material_knee, float sun_knee, float color_resp)`。

> **注意：本任务只创建 `lighting.gdshaderinc` 并让 `ribbon.gdshader` 使用它，不改 `surface.gdshader`。** 短期内光照数学有两份拷贝，这是为了避开正在被改的 `surface.gdshader`。Task 6（Phase B）负责把 surface 切过来并消除重复。执行者必须在 `lighting.gdshaderinc` 顶部写明这一点。

- [ ] **Step 1: 抽出共享光照 include**

Create `godot-client/rendering/painterly/shaders/lighting.gdshaderinc`:

```glsl
// Shared diffuse + selective-colour maths.
// NOTE: surface.gdshader still carries its own copy until the rectangle-brush
// work lands; Task 6 of the silhouette-paint-ribbon plan removes that duplicate.
#include "res://rendering/painterly/shaders/color.gdshaderinc"

vec3 painterly_light(vec3 albedo, vec3 normal, vec3 sun_dir, vec3 sun_rgb, float sun_e,
        vec3 ambient_rgb, float ambient_e, bool selective, float importance,
        float chroma_g, float lightness_g, float material_knee, float sun_knee, float color_resp) {
    float ndotl = max(dot(normalize(normal), sun_dir), 0.0);
    vec3 s0 = albedo * sun_rgb * (ndotl * sun_e);
    vec3 indirect = albedo * ambient_rgb * ambient_e;
    vec3 styled = s0;
    if (selective && sun_e > 0.000001) {
        vec3 material_lab = to_oklab(albedo);
        vec3 solar_lab = to_oklab(sun_rgb / max(luminance(sun_rgb), 0.000001));
        float cm = length(material_lab.yz), cs = length(solar_lab.yz);
        float qm = confidence(cm, material_knee), qs = confidence(cs, sun_knee);
        float cosine = dot(material_lab.yz, solar_lab.yz) / max(cm * cs, 0.000001);
        float angle = acos(clamp(cosine, -1.0, 1.0));
        float match_hue = 1.0 - smoothstep(radians(15.0), radians(65.0), angle);
        float d = (1.0 - exp(-sun_e)) * ndotl;
        float fc = mix(0.12, 1.0, pow(importance, 1.3)) * color_resp;
        float fl = mix(0.15, 1.0, importance);
        float guard = smoothstep(0.08, 0.28, material_lab.x) * (1.0 - smoothstep(0.86, 1.0, material_lab.x));
        float w = d * fc * qm * qs * match_hue;
        vec3 slab = to_oklab(s0);
        float gain = soft_limit(chroma_g * w, chroma_g);
        slab.yz *= 1.0 + gain;
        slab.x += soft_limit(lightness_g * d * fl * guard, lightness_g);
        slab.yz += solar_lab.yz * (1.0 - qm) * d * fl * guard * 0.04;
        styled = from_oklab(slab);
    }
    return indirect + styled;
}
```

- [ ] **Step 2: 让 ribbon 跑两遍光照并做并值**

Replace `godot-client/rendering/painterly/shaders/ribbon.gdshader` 全文:

```glsl
shader_type spatial;
render_mode blend_mix, unshaded, fog_disabled, depth_draw_never, cull_disabled;
#include "res://rendering/painterly/shaders/lighting.gdshaderinc"

uniform bool seam_enabled = true;
uniform float seam_strength = 1.0;
uniform sampler2DArray brushes : filter_linear_mipmap, repeat_disable;
uniform vec3 sun_direction = vec3(-0.5, 0.8, 0.3);
uniform vec4 sun_color : source_color = vec4(1, 0.94, 0.83, 1);
uniform float sun_energy = 1.0;
uniform vec4 ambient_color : source_color = vec4(0.6, 0.72, 0.9, 1);
uniform float ambient_energy = 0.5;
uniform vec4 sky_reference_color : source_color = vec4(0.15, 0.17, 0.19, 1);
uniform float exposure = 1.1;
uniform bool selective_color = true;
uniform float chroma_gain = 0.20;
uniform float lightness_gain = 0.025;
uniform float material_chroma_knee = 0.035;
uniform float sun_chroma_knee = 0.04;
uniform float color_response = 1.0;
uniform float edge_width_min_m = 0.04;
uniform float edge_width_max_m = 0.45;
uniform float edge_pull_lo = 0.06;
uniform float edge_pull_hi = 0.35;
uniform int debug_view = 0;

varying vec3 donor_albedo;
varying vec3 donor_normal;
varying vec3 receiver_albedo;
varying vec3 receiver_normal;
varying float importance;
varying float opacity;
varying float variant;
varying float mode;

void vertex() {
    donor_albedo = COLOR.rgb;
    opacity = COLOR.a;
    donor_normal = normalize(CUSTOM0.xyz);
    receiver_albedo = CUSTOM1.rgb;
    importance = CUSTOM1.a;
    variant = UV2.x;
    mode = UV2.y;
    receiver_normal = normalize(MODEL_NORMAL_MATRIX * NORMAL);
}

void fragment() {
    if (!seam_enabled) { discard; }
    vec3 donor_lit = painterly_light(donor_albedo, donor_normal, sun_direction, sun_color.rgb,
        sun_energy, ambient_color.rgb, ambient_energy, selective_color, importance,
        chroma_gain, lightness_gain, material_chroma_knee, sun_chroma_knee, color_response);
    // A SKY-mode ribbon has no receiving surface: the far side is a constant.
    vec3 receiver_lit = mode > 1.5 ? sky_reference_color.rgb
        : painterly_light(receiver_albedo, receiver_normal, sun_direction, sun_color.rgb,
            sun_energy, ambient_color.rgb, ambient_energy, selective_color, importance,
            chroma_gain, lightness_gain, material_chroma_knee, sun_chroma_knee, color_response);
    vec3 donor_lab = to_oklab(donor_lit);
    vec3 receiver_lab = to_oklab(receiver_lit);
    float pull = smoothstep(edge_pull_lo, edge_pull_hi, abs(donor_lab.x - receiver_lab.x));
    float width = mix(edge_width_min_m, edge_width_max_m, pull) * mix(1.0, 0.15, importance);
    // The quad is built at edge_width_max_m; narrow by remapping across its width.
    float b = 0.5 + (UV.y - 0.5) * (edge_width_max_m / max(width, 0.001));
    if (b < 0.0 || b > 1.0) { discard; }
    float a = texture(brushes, vec3(UV.x, b, variant)).a;
    if (a < 0.001) { discard; }
    vec3 paint_lab = mix(donor_lab, mix(donor_lab, receiver_lab, 0.5), pull);
    vec3 result = output_map(from_oklab(paint_lab), exposure);
    if (debug_view == 17) { result = vec3(pull); }
    else if (debug_view == 18) { result = vec3(mode < 0.5 ? 1.0 : 0.0, mode > 0.5 && mode < 1.5 ? 1.0 : 0.0, mode > 1.5 ? 1.0 : 0.0); }
    ALBEDO = result;
    ALPHA = a * opacity * seam_strength;
}
```

- [ ] **Step 3: 让 `attach()` 推送光照 uniform**

在 `paint_ribbon.gd` 的 `attach()` 里，`mat.set_shader_parameter("seam_strength", ...)` 之后追加：

```gdscript
		for key in ["sun_direction", "sun_color", "sun_energy", "ambient_color", "ambient_energy",
				"exposure", "selective_color", "chroma_gain", "lightness_gain", "color_response", "debug_view"]:
			mat.set_shader_parameter(key, renderer.get(key))
		for key in ["edge_width_min_m", "edge_width_max_m", "edge_pull_lo", "edge_pull_hi", "sky_reference_color"]:
			if renderer.get(key) != null: mat.set_shader_parameter(key, renderer.get(key))
```

Phase A 阶段 `renderer` 上还没有 `edge_*` / `sky_reference_color` 属性（它们在 Task 7 才加），所以第二个循环的 `!= null` 判断会让 shader 保持自己的默认值。这是有意的，不是遗漏。

- [ ] **Step 4: 在 `seam_lab` 里检查太阳跟随与并值**

追加到 Task 3 的检查段之后：

```gdscript
	# --- runtime lighting and value pull (Task 4) ---
	ribbon.rebuild(renderer, renderer._surfaces, edges, -camera.global_transform.basis.z)
	ribbon.attach(self, renderer)
	renderer.set_lighting(Vector3(0, 0.5, 1), Color.WHITE, 0.4)
	ribbon.attach(self, renderer)
	var noon := await frame("08-ribbon-noon.png")
	renderer.set_lighting(Vector3(-0.6, 0.15, 0.8), Color("ff9a52"), 1.6)
	ribbon.attach(self, renderer)
	var dusk := await frame("09-ribbon-dusk.png")
	check(noon.get_data() != dusk.get_data(), "Ribbon lightness follows the sun at runtime")
	check(ribbon.build_count == ribbon.build_count, "Sun change does not recompile the ribbon")
	var before_build: int = ribbon.build_count
	renderer.set_lighting(Vector3(0, 0.5, 1), Color.WHITE, 0.4)
	ribbon.attach(self, renderer)
	check(ribbon.build_count == before_build, "Relighting reuses the compiled geometry")
	for node in ribbon.ribbons.values(): node.queue_free()
	ribbon.ribbons.clear()
	await frame()
```

- [ ] **Step 5: 检查并值与 importance 驱动的宽度**

`pull` 与 `width` 都在 fragment 里，无法从 GDScript 直接读，所以用调试通道 17（`EDGE_PULL`）取像素来测。追加到 Step 4 的检查段之后：

```gdscript
	# --- value pull and importance-driven width (Task 4) ---
	# red 与 blue 明度差大；把 blue 改成与 red 几乎同明度后，pull 必须下降。
	ribbon.rebuild(renderer, renderer._surfaces, edges, -camera.global_transform.basis.z)
	ribbon.attach(renderer)
	for node in ribbon.ribbons.values():
		node.material_override.set_shader_parameter("debug_view", 17)
	var pull_far := await frame("10-edge-pull-far.png")
	surfaces.blue.inputs.albedo = Color("c8302a")
	renderer.refresh_surface_inputs(surfaces.blue.node)
	ribbon.rebuild(renderer, renderer._surfaces, edges, -camera.global_transform.basis.z)
	ribbon.attach(renderer)
	for node in ribbon.ribbons.values():
		node.material_override.set_shader_parameter("debug_view", 17)
	var pull_near := await frame("11-edge-pull-near.png")
	check(pull_far.get_data() != pull_near.get_data(), "Value pull responds to the lightness difference")
	surfaces.blue.inputs.albedo = Color("325baa")
	renderer.refresh_surface_inputs(surfaces.blue.node)
	# importance = 1 must narrow the ribbon; count non-discarded pixels.
	func_count_paint = func(img: Image) -> int:
		var total := 0
		for y in range(0, img.get_height(), 2):
			for x in range(0, img.get_width(), 2):
				if img.get_pixel(x, y).a > 0.0 and img.get_pixel(x, y) != Color(0, 0, 0, 1): total += 1
		return total
	surfaces.blue.inputs.default_importance = 0.0
	renderer.refresh_surface_inputs(surfaces.blue.node)
	ribbon.rebuild(renderer, renderer._surfaces, edges, -camera.global_transform.basis.z)
	ribbon.attach(renderer)
	var wide := await frame("12-lost-edge.png")
	surfaces.blue.inputs.default_importance = 1.0
	renderer.refresh_surface_inputs(surfaces.blue.node)
	ribbon.rebuild(renderer, renderer._surfaces, edges, -camera.global_transform.basis.z)
	ribbon.attach(renderer)
	var narrow := await frame("13-found-edge.png")
	check(func_count_paint.call(wide) > func_count_paint.call(narrow),
		"High importance narrows the ribbon; low importance loses the edge")
	surfaces.blue.inputs.default_importance = 0.2
	renderer.refresh_surface_inputs(surfaces.blue.node)
	for node in ribbon.ribbons.values(): node.queue_free()
	ribbon.ribbons.clear()
	await frame()
```

`func_count_paint` 在 `run()` 顶部先声明 `var func_count_paint: Callable`。

- [ ] **Step 6: 请用户运行验收**

```sh
Godot --path godot-client --scene res://demos/seam_lab/lab.tscn -- --seam-qa
```

期望 `failures` 为空。`Ribbon lightness follows the sun at runtime` 是整套设计里最关键的一项——若它失败，说明颜色在编译期被烘死了，必须回到 Step 2 检查 `painterly_light()` 是否真的在 fragment 里跑。

---

## Task 5: 删除颜料滴（编译器侧）

参考图里没有流挂；DE 的颜料感来自边和块。删掉笔触侧的滴生成与相关字段。`painterly_renderer.gd` 上的 `seam_max_drips` 属性留到 Task 7 删。

**Files:**
- Modify: `godot-client/rendering/painterly/paint_ribbon.gd`
- Test: `godot-client/demos/seam_lab/lab.gd`

**Interfaces:**
- Produces: 笔触字典不再有 `drip_length` / `drip_width` / `drip_direction` / `drip_priority` / `long_drip`；`stats` 不再有 `drips` 键。

- [ ] **Step 1: 删除滴的生成**

在 `paint_ribbon.gd` 中删除：

- `var drip_candidates: Array[Dictionary] = []` 声明
- 接触笔触循环里的 `stamp.drip_priority`、`stamp.long_drip`、`gravity` / `projected` 计算与 `drip_candidates.append(stamp)` 整段
- 轮廓笔触字典里的 `"drip_length"` / `"drip_width"` / `"drip_direction"` / `"drip_priority"` / `"long_drip"` 五个键
- `drip_candidates.sort_custom(...)` 与其后的 `for stamp in drip_candidates.slice(...)` 两行
- `stats` 里的 `"drips"` 键

- [ ] **Step 2: 删除 `seam_lab` 里的滴检查**

删除 `demos/seam_lab/lab.gd` 中：

- `check(report.drips<=2,"Scene-wide drip cap")`
- 从 `# Exercise both rare drip shapes with seeds` 到 `check(with_drip.get_data()!=without_drip.get_data(),...)` 循环结束的整段
- 紧随其后的 `camera.size=5.0;camera.position=Vector3(3,1,8)` 保留

注意：这段检查里调用了 `renderer.seam_paint.upload(...)`。`seam_paint.gd` 与材质阶段在 Phase A 仍然存在，所以删掉这段后 `renderer.rebuild_seam_paint()` 的其余检查照常通过。

- [ ] **Step 3: 请用户运行验收**

```sh
Godot --path godot-client --scene res://demos/seam_lab/lab.tscn -- --seam-qa
```

期望 `failures` 为空，`checks` 比上一轮减少（滴的两项 + drip cap）。`demos/seam_lab/qa/05-short-drip.png` 与 `06-long-drip.png` 不再更新——把这两个文件删掉。

---

# Phase B — 阻塞中，需用户确认 rectangle brushes 改动已落定

> 开工前确认：`git status godot-client/rendering/painterly` 干净，或用户明确说那批改动已完成。

## Task 6: `surface.gdshader` 切到共享光照 include

**Files:**
- Modify: `godot-client/rendering/painterly/shaders/surface.gdshader`
- Modify: `godot-client/rendering/painterly/shaders/lighting.gdshaderinc`

- [ ] **Step 1: 记录基线画面**

请用户运行并保留输出，作为"画面零变化"的对照：

```sh
Godot --path godot-client --scene res://demos/painterly_lab/lab.tscn -- --painterly-qa
```

- [ ] **Step 2: 用 include 替换 surface 内联的光照段**

`surface.gdshader` 顶部把 `#include ".../color.gdshaderinc"` 换成 `#include ".../lighting.gdshaderinc"`（后者已 include 前者）。

删除 `fragment()` 中从 `vec3 styled=s0;` 到 `styled=from_oklab(slab);` 的整个 `if(enabled && selective_color && sun_energy>0.000001){...}` 块，以及它上方的 `vec3 s0=...` 与 `vec3 indirect=albedo*irradiance;` 两行；`irradiance` 的计算保留。替换成什么见下面的"重要"一段。

`color_weight` 是调试通道 9 需要的中间量，`painterly_light()` 不返回它。在 `lighting.gdshaderinc` 里追加一个只算权重的小函数供调试用：

```glsl
float painterly_color_weight(vec3 albedo, vec3 normal, vec3 sun_dir, vec3 sun_rgb, float sun_e,
        float importance, float material_knee, float sun_knee, float color_resp) {
    float ndotl = max(dot(normalize(normal), sun_dir), 0.0);
    vec3 material_lab = to_oklab(albedo);
    vec3 solar_lab = to_oklab(sun_rgb / max(luminance(sun_rgb), 0.000001));
    float cm = length(material_lab.yz), cs = length(solar_lab.yz);
    float cosine = dot(material_lab.yz, solar_lab.yz) / max(cm * cs, 0.000001);
    float angle = acos(clamp(cosine, -1.0, 1.0));
    float match_hue = 1.0 - smoothstep(radians(15.0), radians(65.0), angle);
    return (1.0 - exp(-sun_e)) * ndotl * mix(0.12, 1.0, pow(importance, 1.3)) * color_resp
        * confidence(cm, material_knee) * confidence(cs, sun_knee) * match_hue;
}
```

`surface.gdshader` 的 `color_weight` 改为调用它。

**重要：** `painterly_light()` 返回 `indirect + styled`，而 `surface.gdshader` 需要 `indirect + visibility * styled`——可见度只乘直射项，不乘环境项。所以不能直接用返回值。把 `lighting.gdshaderinc` 改成以分离版本为主体：

```glsl
void painterly_light_split(vec3 albedo, vec3 normal, vec3 sun_dir, vec3 sun_rgb, float sun_e,
        vec3 irradiance, bool selective, float importance,
        float chroma_g, float lightness_g, float material_knee, float sun_knee, float color_resp,
        out vec3 indirect_out, out vec3 styled_out) {
    float ndotl = max(dot(normalize(normal), sun_dir), 0.0);
    vec3 s0 = albedo * sun_rgb * (ndotl * sun_e);
    indirect_out = albedo * irradiance;
    styled_out = s0;
    if (selective && sun_e > 0.000001) {
        vec3 material_lab = to_oklab(albedo);
        vec3 solar_lab = to_oklab(sun_rgb / max(luminance(sun_rgb), 0.000001));
        float cm = length(material_lab.yz), cs = length(solar_lab.yz);
        float qm = confidence(cm, material_knee), qs = confidence(cs, sun_knee);
        float cosine = dot(material_lab.yz, solar_lab.yz) / max(cm * cs, 0.000001);
        float angle = acos(clamp(cosine, -1.0, 1.0));
        float match_hue = 1.0 - smoothstep(radians(15.0), radians(65.0), angle);
        float d = (1.0 - exp(-sun_e)) * ndotl;
        float fc = mix(0.12, 1.0, pow(importance, 1.3)) * color_resp;
        float fl = mix(0.15, 1.0, importance);
        float guard = smoothstep(0.08, 0.28, material_lab.x) * (1.0 - smoothstep(0.86, 1.0, material_lab.x));
        float w = d * fc * qm * qs * match_hue;
        vec3 slab = to_oklab(s0);
        float gain = soft_limit(chroma_g * w, chroma_g);
        slab.yz *= 1.0 + gain;
        slab.x += soft_limit(lightness_g * d * fl * guard, lightness_g);
        slab.yz += solar_lab.yz * (1.0 - qm) * d * fl * guard * 0.04;
        styled_out = from_oklab(slab);
    }
}

vec3 painterly_light(vec3 albedo, vec3 normal, vec3 sun_dir, vec3 sun_rgb, float sun_e,
        vec3 ambient_rgb, float ambient_e, bool selective, float importance,
        float chroma_g, float lightness_g, float material_knee, float sun_knee, float color_resp) {
    vec3 indirect_out, styled_out;
    painterly_light_split(albedo, normal, sun_dir, sun_rgb, sun_e, ambient_rgb * ambient_e,
        selective, importance, chroma_g, lightness_g, material_knee, sun_knee, color_resp,
        indirect_out, styled_out);
    return indirect_out + styled_out;
}
```

即 Step 1 写的那份 `painterly_light()` 被这两个函数取代——第五个环境参数从 `(ambient_rgb, ambient_e)` 两个合并成一个已乘好的 `irradiance`，这样 `surface.gdshader` 可以把 `indirect_map` / `indirect_tint` 的贡献一起加进 `irradiance` 后再传入，间接光的组装留在 surface 里不进 include。`ribbon.gdshader` 继续调用 `painterly_light()`，签名不变，Task 4 的代码不用改。

`surface.gdshader` 里改为：

```glsl
    vec3 indirect, styled;
    painterly_light_split(albedo, normalize(world_normal), sun_direction, sun_color.rgb,
        sun_energy, irradiance, enabled && selective_color, importance,
        chroma_gain, lightness_gain, material_chroma_knee, sun_chroma_knee, color_response,
        indirect, styled);
```

其后原有的 `vec3 composed=indirect+visibility*styled;` 一行不变。

- [ ] **Step 3: 请用户运行验收，确认画面零变化**

```sh
Godot --path godot-client --scene res://demos/painterly_lab/lab.tscn -- --painterly-qa
```

期望 93 项全过，且 `demos/painterly_lab/qa/` 下的截图与 Step 1 的基线**逐像素相同**。这是纯重构，任何画面差异都是 bug。

---

## Task 7: `painterly_renderer.gd` 接线

**Files:**
- Modify: `godot-client/rendering/painterly/painterly_renderer.gd`

**Interfaces:**
- Consumes: `PaintRibbon.rebuild(renderer, records, silhouette_edges, camera_forward)`、`PaintRibbon.attach(anchor, renderer)`、`SilhouetteExtractor.extract(...)`。
- Produces: `PainterlyRenderer.rebuild_paint() -> Dictionary`；成员 `paint`；`get_stats().paint`。

- [ ] **Step 1: 替换编译器引用与新属性**

把第 12 行 `const SEAM_COMPILER = preload(".../seam_paint.gd")` 改为 `preload(".../paint_ribbon.gd")`，第 20 行 `var seam_paint = SEAM_COMPILER.new()` 改为 `var paint = SEAM_COMPILER.new()`。删除第 18 行 `@export_range(0,8) var seam_max_drips := 2`。

在 seam 属性组后追加：

```gdscript
const EXTRACTOR = preload("res://rendering/painterly/silhouette_extractor.gd")
var silhouette = EXTRACTOR.new()
@export var silhouette_enabled := true
@export_range(0.5, 4.0) var silhouette_resolution_scale := 2.0
@export_range(0.01, 2.0) var silhouette_depth_threshold_m := 0.15
@export_range(0.05, 2.0) var silhouette_min_edge_length_m := 0.25
@export var sky_reference_color := Color(0.15, 0.17, 0.19)
@export var paint_vertex_budget := 60000
@export_range(0.005, 0.5) var edge_width_min_m := 0.04
@export_range(0.05, 2.0) var edge_width_max_m := 0.45
@export_range(0.0, 1.0) var edge_pull_lo := 0.06
@export_range(0.0, 1.0) var edge_pull_hi := 0.35
@export_range(0.0, 0.05) var paint_depth_offset_m := 0.004
@export var paint_camera: Camera3D
var _paint_camera_basis := Basis.IDENTITY
```

`DebugView` 枚举末尾追加 `, EDGE_PULL, EDGE_KIND`。

- [ ] **Step 2: 替换 `rebuild_seam_paint()`**

把 `func rebuild_seam_paint() -> Dictionary:` 整个替换为：

```gdscript
func rebuild_paint() -> Dictionary:
	_seam_dirty = false
	var edges: Array[Dictionary] = []
	var camera := paint_camera if paint_camera != null else get_viewport().get_camera_3d()
	if silhouette_enabled and camera != null:
		var anchor := paint.anchor_transform(self).affine_inverse()
		edges = await silhouette.extract(self, camera, _surfaces, anchor,
			silhouette_resolution_scale, silhouette_depth_threshold_m, silhouette_min_edge_length_m)
		if silhouette.last_error != "":
			push_error(silhouette.last_error)
			# Keep the previous complete ribbon rather than dropping a whole layer.
			return {"errors": [silhouette.last_error], "kept_previous": true}
		_paint_camera_basis = camera.global_transform.basis
	var forward := -_paint_camera_basis.z
	var report: Dictionary = paint.rebuild(self, _surfaces, edges, forward)
	if report.get("errors", []).is_empty():
		paint.attach(self, self)
	return report
```

- [ ] **Step 3: 在 `_process()` 里加相机旋转触发**

把 `_process()` 开头的 `if _seam_dirty or seam_paint.needs_rebuild(self,_surfaces):` 段替换为：

```gdscript
	var camera := paint_camera if paint_camera != null else get_viewport().get_camera_3d()
	if camera != null and not camera.global_transform.basis.is_equal_approx(_paint_camera_basis):
		_seam_dirty = true
	if (_seam_dirty or paint.needs_rebuild(self, _surfaces)) and not _paint_busy:
		_paint_busy = true
		var report: Dictionary = await rebuild_paint()
		_paint_busy = false
		for error in report.get("errors", []): push_error(error)
```

只比较 `basis`——平移与 `size` 缩放不触发重建。

`_paint_busy` 是必需的：`rebuild_paint()` 里 `await` 了一次 `frame_post_draw`，所以它跨帧；没有这个守卫，`_process` 会在上一次重建完成前再次进入，两次提取叠在一起写同一批 ribbon。在成员变量区加：

```gdscript
var _paint_busy := false
```

- [ ] **Step 3b: 背景参考色校验**

`SKY` mode 的远侧取的是环境背景色。宿主若用了 Sky 而非纯色，取不到可信的颜色，这时必须关掉 SKY ribbon 而不是混一个错的颜色。在 `rebuild_paint()` 里 `edges = await silhouette.extract(...)` 之后追加：

```gdscript
		var world_env := get_viewport().find_children("*", "WorldEnvironment", true, false)
		var env: Environment = world_env[0].environment if not world_env.is_empty() else null
		if env != null and env.background_mode == Environment.BG_COLOR:
			sky_reference_color = env.background_color
		elif not _sky_color_warned:
			_sky_color_warned = true
			push_warning("No BG_COLOR environment; set sky_reference_color explicitly or SKY ribbons stay off")
		if env == null or env.background_mode != Environment.BG_COLOR:
			for i in range(edges.size() - 1, -1, -1):
				if edges[i].kind == "sky": edges.remove_at(i)
```

成员变量区加 `var _sky_color_warned := false`。`sky_reference_color` 通过 `attach()` 里已有的第二个 uniform 循环下发。

- [ ] **Step 4: 预算截断**

在 `paint_ribbon.gd` 的 `rebuild()` 里，`stamps.sort_custom(...)` 之后追加：

```gdscript
	var budget: int = int(renderer.get("paint_vertex_budget")) if renderer.get("paint_vertex_budget") != null else 60000
	var truncated := 0
	if stamps.size() * 4 > budget:
		var keep := maxi(0, budget / 4)
		var ranked := stamps.duplicate()
		ranked.sort_custom(func(a, b): return a.opacity * a.length > b.opacity * b.length)
		truncated = stamps.size() - keep
		stamps = ranked.slice(0, keep)
		stamps.sort_custom(func(a, b): return a.order < b.order if a.order != b.order else a.id < b.id)
		push_warning("Paint ribbon truncated %d stamps to fit the vertex budget" % truncated)
```

并把 `stats` 的 `"truncated":0` 改为 `"truncated":truncated`。

- [ ] **Step 5: 更新 `refresh_settings()` 与 `get_stats()`**

`refresh_settings()` 里 `mat.set_shader_parameter("seam_enabled",seam_enabled)` 与 `seam_strength` 两行保留（Task 8 删材质阶段时一并删），并在函数末尾追加对 ribbon 的同步：

```gdscript
	if not paint.ribbons.is_empty(): paint.attach(self, self)
```

`get_stats()` 里把 `"seam_paint":seam_paint.stats` 改为 `"paint":paint.stats, "silhouette":silhouette.stats`。

- [ ] **Step 6: 请用户运行两个实验室**

```sh
Godot --path godot-client --scene res://demos/seam_lab/lab.tscn -- --seam-qa
Godot --path godot-client --scene res://demos/painterly_lab/lab.tscn -- --painterly-qa
```

期望两者 `failures` 均为空。`seam_lab` 里 Task 1–5 加的检查现在应改用 `renderer.paint` 而不是自建编译器——本步顺带把那些检查里的 `var ribbon = preload(...).new()` 改成 `var ribbon = renderer.paint`，`ribbon.rebuild(...)` 改成 `await renderer.rebuild_paint()`。

---

## Task 8: 拆除材质阶段

**Files:**
- Delete: `godot-client/rendering/painterly/shaders/seam_paint.gdshaderinc`（及其 `.uid`）
- Delete: `godot-client/rendering/painterly/seam_paint.gd`（及其 `.uid`）
- Modify: `godot-client/rendering/painterly/shaders/surface.gdshader`
- Modify: `godot-client/rendering/painterly/painterly_renderer.gd`
- Test: `godot-client/demos/seam_lab/lab.gd`

- [ ] **Step 1: 从 `surface.gdshader` 移除 seam 阶段**

删除第 4 行 `#include ".../seam_paint.gdshaderinc"`，以及 `fragment()` 中这五行：

```glsl
    float seam_coverage;
    vec3 seam_donor, seam_direction;
    vec3 seam_position=(seam_from_local*vec4(local_position,1.0)).xyz;
    vec3 seam_normal=normalize(transpose(inverse(mat3(seam_from_local)))*local_normal);
    float seam_protection=use_seam_protection_map ? texture(seam_protection_map,data_uv).r : 0.0;
    albedo=apply_seam_paint(albedo,seam_position,seam_normal,seam_protection,seam_coverage,seam_donor,seam_direction);
```

以及末尾三行调试分支：

```glsl
    if(debug_view==14) {result=vec3(seam_coverage);}
    else if(debug_view==15) {result=seam_donor;}
    else if(debug_view==16) {result=seam_direction;}
```

`seam_protection_map` 的 uniform 声明移到 `surface.gdshader` 顶部保留（`_apply_inputs()` 仍在推送它），但改为只在 ribbon 里消费——实际做法是从 `surface.gdshader` 删除该 uniform，并从 `_apply_inputs()` 的纹理配对表里移除 `["seam_protection_map","seam_protection_map"]` 一项，改由 `paint_ribbon.gd` 在编译期采样该图决定笔触 `opacity`。

- [ ] **Step 2: 编译期消费 `seam_protection_map`**

在 `paint_ribbon.gd` 的两处笔触生成里，把 `"opacity"` 的计算从 `* (1.0 - target.inputs.seam_protection)` 扩展为同时采样保护图：

```gdscript
func protection_at(record: Dictionary, geom: Dictionary, point: Vector3) -> float:
	var inputs: Resource = record.inputs
	var base: float = clampf(inputs.seam_protection, 0.0, 1.0)
	if inputs.seam_protection_map == null: return base
	var sample := nearest_triangle(point, geom.triangles)
	var w: Vector3 = sample.weights
	var uv: Vector2 = sample.triangle.uv[0]*w.x + sample.triangle.uv[1]*w.y + sample.triangle.uv[2]*w.z
	return maxf(base, texture_color(inputs.seam_protection_map, uv).r)
```

两处 `"opacity"` 改为 `rng.randf_range(0.78,0.98) * (1.0 - protection_at(target, _geometry[receiver_id], center))`。

- [ ] **Step 3: 删除文件与残留引用**

```bash
cd /Users/sunyining/project_SentiEdge/CoC-AI-agent/godot-client/rendering/painterly
rm shaders/seam_paint.gdshaderinc shaders/seam_paint.gdshaderinc.uid seam_paint.gd seam_paint.gd.uid
```

从 `painterly_renderer.gd` 的 `refresh_settings()` 删除 `mat.set_shader_parameter("seam_enabled",...)` 与 `seam_strength` 两行（ribbon 材质在 `attach()` 里自己收）。`DebugView` 的 `SEAM_MASK` / `SEAM_SOURCE` / `SEAM_DIRECTION` 三项**保留枚举位置**（README 承诺旧编号不变），但它们现在由 ribbon 材质响应。

- [ ] **Step 4: 更新 `seam_lab` 的回归检查**

`demos/seam_lab/lab.gd` 里删除 `check(surfaces.blue.node.material_override.get_shader_parameter("seam_stamp_count")==0, ...)`，替换为：

```gdscript
	check(not renderer.paint.ribbons.has("blue"), "Unregistering a donor removes the receiver's ribbon")
```

并把所有 `renderer.rebuild_seam_paint()` 改为 `await renderer.rebuild_paint()`、`renderer.seam_paint` 改为 `renderer.paint`。

- [ ] **Step 5: 请用户运行三个实验室**

```sh
Godot --path godot-client --scene res://demos/seam_lab/lab.tscn -- --seam-qa
Godot --path godot-client --scene res://demos/painterly_lab/lab.tscn -- --painterly-qa
Godot --path godot-client --scene res://demos/bluebird/street_corner.tscn -- --bluebird-seam-qa
```

`bluebird` 此时预期**会失败**——它的检查仍针对材质阶段。Task 10 修它。

---

## Task 9: 贴面 ribbon 吃接收面的阴影遮罩

spec §7 要求 `CONTACT` mode 在 fragment 里按世界坐标重跑一次 `brush_shadow()`，否则屋檐下的叠色会浮在阴影上面。这一步依赖 `shadow.gdshaderinc`，所以必须在 Phase B。

**Files:**
- Modify: `godot-client/rendering/painterly/shaders/ribbon.gdshader`
- Modify: `godot-client/rendering/painterly/paint_ribbon.gd`
- Test: `godot-client/demos/seam_lab/lab.gd`

**Interfaces:**
- Consumes: `shadow.gdshaderinc` 的 `brush_shadow(world_position, surface_p, flow, surface_basis, sun_direction, importance, protect, active, out pigment) -> vec3`（返回 `.r` 物理遮罩、`.g` 笔刷遮罩）。
- Produces: `PaintRibbon.attach()` 额外下发接收面的遮罩输入；`ribbon.gdshader` 新增 uniform `receiver_shadow_enabled`。

- [ ] **Step 1: 让 ribbon 引入阴影 include 并接收逐表面输入**

在 `ribbon.gdshader` 的 include 之后追加：

```glsl
#include "res://rendering/painterly/shaders/shadow.gdshaderinc"
uniform bool receiver_shadow_enabled = false;
```

`shadow.gdshaderinc` 自带它需要的全部 uniform（`shadow_depth`、`light_view`、`brush_caster_*` 等），与 `surface.gdshader` 同名，所以下发的是同一批值。

在 `fragment()` 里，算完 `donor_lit` / `receiver_lit` 之后、`pull` 之前插入：

```glsl
    // A contact ribbon lies on a receiving surface, so it must sit inside that
    // surface's painted shadow instead of floating on top of it.
    float visibility = 1.0;
    if (receiver_shadow_enabled && mode < 0.5) {
        vec2 pigment;
        vec3 masks = brush_shadow(world_position, surface_p, flow, surface_basis,
            sun_direction, importance, protect, true, pigment);
        visibility = 1.0 - masks.g;
    }
```

`world_position`、`surface_p`、`flow`、`surface_basis`、`protect` 需要新的 varying。`vertex()` 里补：

```glsl
    world_position = (MODEL_MATRIX * vec4(VERTEX, 1)).xyz;
    surface_p = VERTEX.xz;
    flow = vec2(1, 0);
    surface_basis = mat3(MODEL_MATRIX);
    protect = 0.0;
```

顶点数据里没有接收面的 flow 与保护值，这里用固定 flow 与零保护——遮罩的**边缘细节**因此与接收面不完全一致，但**整片明暗**一致，而后者才是"不浮在阴影上"要解决的问题。把这条限制写进 Task 10 的文档步骤。

- [ ] **Step 2: 把可见度乘进颜料**

把 `vec3 result = output_map(from_oklab(paint_lab), exposure);` 改为：

```glsl
    vec3 paint_linear = from_oklab(paint_lab);
    // Visibility multiplies the pigment once, exactly as the surface does.
    paint_linear *= mix(1.0, visibility, receiver_shadow_enabled && mode < 0.5 ? 1.0 : 0.0);
    vec3 result = output_map(paint_linear, exposure);
```

- [ ] **Step 3: `attach()` 下发接收面的阴影 uniform**

在 `paint_ribbon.gd` 的 `attach()` 里，光照 uniform 那两个循环之后追加：

```gdscript
		var receiver_record: Dictionary = _records_by_id.get(id, {})
		if receiver_record.has("material"):
			var src: ShaderMaterial = receiver_record.material
			for key in ["shadow_depth", "light_view", "light_span", "light_far", "capture_valid",
					"brush_caster_count", "brush_caster_min", "brush_caster_max",
					"shadow_bias_m", "edge_width_m", "stroke_length_m", "stroke_width_m",
					"brush_strength", "drag_length_m", "gap_depth_m",
					"shadow_brush_layers", "shadow_brush_regions", "shadow_brush_variant_count",
					"shadow_brush_width_m", "shadow_length_range", "shadow_brush_overlap",
					"shadow_brush_seed", "shadow_root_fill_m", "use_oil_brush_atlas",
					"receiver_stroke_id"]:
				mat.set_shader_parameter(key, src.get_shader_parameter(key))
			mat.set_shader_parameter("receiver_shadow_enabled", receiver_record.inputs.painterly_shadows)
		else:
			mat.set_shader_parameter("receiver_shadow_enabled", false)
```

在 `rebuild()` 的表面注册循环里，`_paint_orders[id] = inputs.paint_order` 旁边追加 `_records_by_id[id] = record`，并在成员变量区加 `var _records_by_id := {}`，在 `rebuild()` 的清空处加 `_records_by_id.clear()`。

注意 `attach()` 末尾原本要清 `_geometry`——`_records_by_id` 不清，因为 `refresh_settings()` 会在没有重新编译的情况下再次调用 `attach()` 同步太阳。

- [ ] **Step 4: 在 `seam_lab` 里检查贴面 ribbon 被阴影压暗**

`seam_lab` 的 fixture 现在全是 `painterly_shadows=false` 的平面 quad，测不到这条。加一个开了笔刷阴影的地面与一个遮挡它的立方体：

```gdscript
	# --- contact ribbon sits inside the receiver's shadow (Task 9) ---
	var floor_mesh := MeshInstance3D.new()
	floor_mesh.mesh = BoxMesh.new(); floor_mesh.mesh.size = Vector3(6, 0.1, 6)
	floor_mesh.position = Vector3(3, -3, 0); add_child(floor_mesh)
	var floor_inputs := PainterlySurface.new()
	floor_inputs.albedo = Color("a7a595"); floor_inputs.paint_id = "floor"
	floor_inputs.paint_order = 0; floor_inputs.painterly_shadows = true
	renderer.register_surface(floor_mesh, floor_inputs)
	var blocker := MeshInstance3D.new()
	blocker.mesh = BoxMesh.new(); blocker.mesh.size = Vector3(1.2, 1.2, 1.2)
	blocker.position = Vector3(3, -2.35, 0); add_child(blocker)
	var blocker_inputs := PainterlySurface.new()
	blocker_inputs.albedo = Color("6b4f3a"); blocker_inputs.paint_id = "blocker"
	blocker_inputs.paint_order = 50; blocker_inputs.painterly_shadows = false
	renderer.register_surface(blocker, blocker_inputs)
	renderer.set_lighting(Vector3(-0.5, 0.8, 0.4), Color.WHITE, 1.2)
	await frame()
	var shadowed: Dictionary = await renderer.rebuild_paint()
	check(shadowed.contact_stamps > 0, "The blocker/floor contact compiles stamps")
	var floor_ribbon: MeshInstance3D = renderer.paint.ribbons["floor"]
	floor_ribbon.material_override.set_shader_parameter("receiver_shadow_enabled", false)
	var unshadowed_img := await frame("14-ribbon-no-shadow.png")
	floor_ribbon.material_override.set_shader_parameter("receiver_shadow_enabled", true)
	var shadowed_img := await frame("15-ribbon-shadowed.png")
	check(unshadowed_img.get_data() != shadowed_img.get_data(),
		"Contact ribbon is darkened by the receiver's painted shadow")
	renderer.unregister_surface(blocker); renderer.unregister_surface(floor_mesh)
	blocker.queue_free(); floor_mesh.queue_free(); await frame()
```

- [ ] **Step 5: 请用户运行验收**

```sh
Godot --path godot-client --scene res://demos/seam_lab/lab.tscn -- --seam-qa
Godot --path godot-client --scene res://demos/painterly_lab/lab.tscn -- --painterly-qa
```

期望两者 `failures` 均为空。若 `Contact ribbon is darkened...` 失败，先用 `DebugView.PAINTED_MASK` 确认接收面本身确实有阴影落在笔触位置上。

---

## Task 10: bluebird 验收与文档

**Files:**
- Modify: `godot-client/demos/bluebird/street_corner.gd`
- Rename: `godot-client/rendering/painterly/SEAM_PAINT.md` → `PAINT_RIBBON.md`
- Modify: `godot-client/rendering/painterly/README.md`

- [ ] **Step 1: 重写 bluebird 接缝验收**

把 `demos/bluebird/street_corner.gd` 里所有 `seam_stamp_count` 的断言换成对 `renderer.paint.ribbons` 的断言，并补上 spec §12 的存在性三项：

```gdscript
	var report: Dictionary = await renderer.rebuild_paint()
	check(report.sky_stamps > 0, "Roof ridge against the sky produces ribbon stamps")
	check(report.silhouette_stamps > 0, "Form-against-form silhouettes produce ribbon stamps")
	check(report.contact_stamps > 0, "Contact seams still produce ribbon stamps")
	var ids := {}
	for stamp in renderer.paint.stamps: ids[stamp.source_id] = true
	check(not ids.has("sky"), "The background is never a donor")
```

被完全遮挡的轮廓不产生 ribbon。不要硬编码某个表面 id——直接用提取器自己的捕获图判定"这个表面一个可见像素都没有"，这样场景改了检查也不会失效：

```gdscript
	# Any surface with zero pixels in the id capture is fully occluded and must
	# donate nothing; this derives the set from the capture instead of hardcoding.
	var visible_ids := {}
	for edge in renderer.silhouette_edges_debug:
		visible_ids[edge.near_id] = true
		if edge.far_id != "": visible_ids[edge.far_id] = true
	var occluded_donors := 0
	for stamp in renderer.paint.stamps:
		if stamp.mode != renderer.paint.MODE_CONTACT and not visible_ids.has(stamp.source_id):
			occluded_donors += 1
	check(occluded_donors == 0, "A fully occluded silhouette yields no ribbon")
```

这需要 `rebuild_paint()` 把提取到的边留一份给验收读。在 Task 7 Step 2 的 `rebuild_paint()` 里，`var forward := -_paint_camera_basis.z` 之前追加 `silhouette_edges_debug = edges`，并在成员变量区加 `var silhouette_edges_debug: Array[Dictionary] = []`。

- [ ] **Step 2: 相机稳定性检查**

```gdscript
	var builds: int = renderer.paint.build_count
	camera.position += Vector3(1.5, 0, 1.5)
	await frame()
	check(renderer.paint.build_count == builds, "Camera panning does not recompile the ribbon")
	camera.size *= 1.4
	await frame()
	check(renderer.paint.build_count == builds, "Camera zoom does not recompile the ribbon")
	camera.position -= Vector3(1.5, 0, 1.5); camera.size /= 1.4
	camera.rotation_degrees.y += 15.0
	await frame(); await frame()
	check(renderer.paint.build_count > builds, "Camera rotation does recompile the ribbon")
	camera.rotation_degrees.y -= 15.0
	await frame(); await frame()
```

- [ ] **Step 3: 预算截断检查**

```gdscript
	var normal_budget: int = renderer.paint_vertex_budget
	renderer.paint_vertex_budget = 400
	var tight: Dictionary = await renderer.rebuild_paint()
	check(tight.truncated > 0, "A tight vertex budget truncates instead of failing")
	check(tight.stamps * 4 <= 400, "Truncation respects the budget")
	check(tight.errors.is_empty(), "Truncation is a warning, not an error")
	renderer.paint_vertex_budget = normal_budget
	await renderer.rebuild_paint()
```

- [ ] **Step 4: 改写文档**

```bash
cd /Users/sunyining/project_SentiEdge/CoC-AI-agent/godot-client/rendering/painterly
git mv SEAM_PAINT.md PAINT_RIBBON.md
```

`PAINT_RIBBON.md` 需要改写的事实（逐条核对，不要保留任何已经不成立的描述）：

- 标题与首段：从"材质阶段"改为"绘画几何"；说明两个边源。
- 接口表：删 `seam_max_drips`，加 `silhouette_*`、`edge_*`、`sky_reference_color`、`paint_vertex_budget`、`paint_depth_offset_m`、`paint_camera`；`rebuild_seam_paint()` 改为 `rebuild_paint()`。
- "没有新增透明几何或全屏模糊 pass" 这句**必须删掉**——现在有透明几何了。
- 每个接收表面最多 128 笔的描述删掉，换成顶点预算与截断行为。
- 颜料滴整段删除，包括 `09-drip-detail.png` / `10-drip-detail-before.png` 的链接。
- 重建触发表补上相机旋转，并写明平移/缩放/太阳不重建。
- 限制一节补上：只面向锁定的正交相机；轮廓精度受捕获分辨率限制；跨接收面排序是简化；贴面 ribbon 重算遮罩时用的是固定 flow 与零保护，整片明暗与接收面一致但边缘细节不完全一致（Task 9 Step 1）。

`README.md` 末尾"全场景接缝叠色"一节的链接与描述同步改到 `PAINT_RIBBON.md`，并把"独立于阴影的单向接缝叠色模块"改为覆盖轮廓边的说法。

- [ ] **Step 5: 请用户运行全量验收**

```sh
Godot --path godot-client --scene res://demos/seam_lab/lab.tscn -- --seam-qa
Godot --path godot-client --scene res://demos/painterly_lab/lab.tscn -- --painterly-qa
Godot --path godot-client --scene res://demos/bluebird/street_corner.tscn -- --bluebird-seam-qa
```

三者 `failures` 均为空后，把三份 `validation.json` 的 `checks` 数量与 spec §12 的清单逐条对照，确认没有遗漏项。

- [ ] **Step 6: 请用户审阅后一次性提交**

不要自动提交。等用户确认后，把 Phase A + Phase B 的全部改动合成一次提交。
