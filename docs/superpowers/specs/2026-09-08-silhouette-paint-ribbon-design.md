# 轮廓颜料带设计

把 `PainterlyRenderer` 的跨表面叠色从"接触缝的材质阶段"改成"边的绘画几何"。同一套编译器同时处理几何接触边和固定相机下的可见轮廓边，产出世界空间的颜料带网格；材质阶段的 `apply_seam_paint()` 整个拆除。目标是《极乐迪斯科》那种**失边**——形体在安静区溶进背景，在焦点处留锐边。

## 1. 背景

现有接缝叠色（`rendering/painterly/seam_paint.gd` + `shaders/seam_paint.gdshaderinc`）做的是：几何接触检测 → 稀疏笔触 → 把来源表面的原始基色混进接收面受光前的 albedo。它在 `demos/seam_lab`（39 项）和 `demos/bluebird`（25 项）上通过了真实 GPU 验收，行为正确。但它做不出参考画面的绘画感，原因有两条，都是结构性的。

**尺度小两个数量级。** `demos/bluebird/street_corner.tscn:686` 是正交 `size = 23`、720p，约 31 px/m。stamp 的 `reach` 是 `rng.randf_range(0.05, 0.20)`（`seam_paint.gd:301`），即向接收面侵入 1.6–6.3 像素；`width ≤ 0.32 m` 约 10 px，再乘 `seam_coverage = 0.08`。`SEAM_PAINT.md` 里"许多实际接触位于遮挡处，因此成片中的变化保持少量"是这个数字的必然结果。它实现的是接缝脏污，不是绘画性边缘。

**油画感不长在接触上，长在轮廓上。** `docs/art-direction/references/disco-building-user-reference.png` 里真正让画面读成油画的边——屋面对天空、附楼暗面对地面雪、烟囱对背景林——几何上都不接触。而 `match_edges()` / `match_face()` 用 `seam_contact_tolerance_m = 0.035` 做的是真实几何接触判定，`SEAM_PAINT.md` 还明确要求"不要为屏幕上看似邻近的物体增大它"。这个约束对接触是对的，但它把模块锁在了错误的那一类边上。

另外两个次要问题：donor 取的是未受光基色（`sample_source()`，`seam_paint.gd:240`，为防反馈刻意不读光照），所以叠色明度常常和接收面对不上，读成"贴上去的一块"而不是"蹭过去的一笔"；以及每接收面 128 笔的硬上限（`seam_paint.gd:4`，6 个 `vec4[128]` uniform 数组）是个规模墙。

## 2. 目标与非目标

目标：

- 在固定正交相机下识别**可见轮廓边**，包括对天空、对远景、对另一形体、以及自遮挡边，产出世界空间的颜料带。
- 颜料带能做**失边**：低重要度区域宽而软，把形体溶进背景；高重要度区域窄而锐。
- 颜料带能做**边缘局部并值**：两侧最终明度差越大，颜料带越宽越软，且把接收侧往中间值拉。
- 接触边与轮廓边**统一走颜料带**，材质阶段的 `apply_seam_paint()` 与 `seam_paint.gdshaderinc` 删除。
- 颜料带的明度在运行期计算，太阳转动时跟着两侧一起变。
- 保留现有全部单向性语义：`paint_order` 决定 donor、donor 只读原始基色、无反馈、无互染、稳定种子、局部规则可覆盖。

非目标：

- 不做画面级并块，不改 `lighting resolve`，不新增任何全屏 pass。
- 不做骨骼、粒子、植被的轮廓——动态形体的轮廓每帧变，编译期方案不适用。
- 不做透明与 alpha cutout 表面（现有编译器就排除）。
- 不支持运行期自由旋转相机（见 §8）。
- 不做离线持久缓存或大世界流式预算，编译仍是加载期的同步 CPU 工作。
- 不做颜料滴（见 §10）。

## 3. 已定的三个分叉

| 分叉 | 结论 | 理由 |
| --- | --- | --- |
| 颜料的载体 | 独立的世界空间 ribbon 几何 | 屋脊对天空那一侧没有本模块的片元可写；`surface.gdshader` 是 `render_mode unshaded` 的不透明材质。几何载体对天空、对远景、对形体一视同仁 |
| 接触叠色的去向 | 全部迁到 ribbon，材质阶段拆除 | 一套词汇、一套旋钮、无重复上色，并拆掉 128 笔上限 |
| 效果范围 | 失边 + 边缘局部并值 | 失边只在两侧值已接近时才读成"化开"；值差三档时再宽的拖抹也只是糊了一条边 |

## 4. 架构

两个边源 → 一个笔触编译器 → 一个 ribbon 材质。

```
接触边源（保留 geometry / match_edges / match_face / merge_segment）
                                                   ↘
轮廓边源（新 silhouette_extractor，一次深度+ID 回读）  →  世界空间边曲线 + (donor, receiver)
                                                   ↙
                      笔触编译器（复用现有 rebuild() 的稳定随机段）
                                                   ↓
                      每个接收面一条 ArrayMesh ribbon
                                                   ↓
                      ribbon.gdshader（与 surface.gdshader 共用 lighting.gdshaderinc）
```

两个边源产出同一种数据：一条世界空间折线，加两侧身份。这是"一套到底"能成立的原因——现有接触检测本来就产出世界空间线段，只有 `upload()`（`seam_paint.gd:370`）那段 uniform 上传需要换成建网格。

### 4.1 文件

新增：

| 文件 | 职责 |
| --- | --- |
| `rendering/painterly/silhouette_extractor.gd` | 深度+ID 捕获、回读、断层扫描、折线追踪、反投影 |
| `rendering/painterly/shaders/surface_id.gdshader` | 捕获用；`depth.gdshader` 的变体，B 通道加表面索引 |
| `rendering/painterly/shaders/ribbon.gdshader` | 颜料带材质 |
| `rendering/painterly/shaders/lighting.gdshaderinc` | 从 `surface.gdshader` 抽出的共享光照与选择性上色 |

改名：`seam_paint.gd` → `paint_ribbon.gd`（`geometry`、`match_edges`、`match_face`、`merge_segment`、`sample_source`、`texture_color`、`edge_cells`、`key_point`、`barycentric`、`nearest_triangle` 原样保留）。

删除：`shaders/seam_paint.gdshaderinc`，以及 `surface.gdshader` 中对它的 include 与调用。

`lighting.gdshaderinc` 的抽取是必需的，不是顺手重构：ribbon 必须跑与表面**逐字相同**的光照数学（漫反射、Oklab 选择性上色、`output_map`），两份拷贝一定会漂移。

## 5. 轮廓提取

不做几何轮廓提取，做屏幕空间深度断层加反投影。

**捕获。** 加载期渲一张 `SubViewport`，相机复制正式相机的 `global_transform` 与正交投影（`size`、`near`、`far`），尺寸为正式 viewport 的 `silhouette_resolution_scale` 倍（默认 2.0），上限 4096。着色器 `surface_id.gdshader` 输出：

- `RG` = 线性深度的高低位分拆，沿用 `depth.gdshader` 的 `floor(d*64)/64, fract(d*64)`；
- `B` = 表面索引（1 起，0 保留给背景）。目标是 RGBA16F，half float 能精确表示 2048 以内的整数，索引直接存不需编码。

**扫描。** 回读一次（`get_texture().get_image()`），逐像素比较右邻与下邻：

| 条件 | 判定 |
| --- | --- |
| 索引不同，两侧都非 0 | 形体对形体的轮廓边；深度小的一侧是 near |
| 索引不同，一侧为 0 | 对天空/背景的轮廓边；非 0 的一侧是 near |
| 索引相同、深度跳变 > `silhouette_depth_threshold_m` | 自遮挡边（烟囱压屋面） |

`silhouette_depth_threshold_m` 默认 0.15 m——大于一块木板的厚度，小于形体之间的间距。

**追踪。** 边界像素按 `(near_index, far_index)` 分组，8 邻域链成折线，Douglas–Peucker 简化，epsilon = 2 像素。短于 `silhouette_min_edge_length_m`（默认 0.25 m）的链丢弃。

**反投影。** 正交投影下反投影是线性的，没有透视除法误差。折线顶点用 `Camera3D.project_position(screen_point, z_depth)`，其中 `z_depth = depth * (far - near) + near`，`screen_point` 按 SubViewport 与正式 viewport 的尺寸比缩放。得到的世界坐标再乘 `anchor_transform().affine_inverse()`，与接触边源同一坐标系。

选这条路而不是 CPU 几何轮廓：它拿到的是**最终可见轮廓**，自带遮挡剔除、自遮挡与任意曲面，且顺手给出两侧身份。手写几何轮廓要自己做遮挡，在 71 个场景文件的量级上不划算。代价是一次加载期 GPU 回读，以及曲线精度受分辨率限制——2× 分辨率下约 1.6 cm/像素，远小于最小笔宽。

## 6. 笔触与网格

`rebuild()` 中 `stable_id → RNG → count / width / reach / opacity / variant / tilt` 那一段原样复用，随机仍由 `hash(stable_id) ^ seam_seed` 决定，与相机和时间无关。输出从 uniform 数组换成每个接收面一条 `ArrayMesh`，每个笔触一个 quad（4 顶点 6 索引）。

**两种 mode，几何构造不同。** 这是顶点上 mode flag 的真正含义，不只是着色分支：

| mode | 平面 | 位置偏移 |
| --- | --- | --- |
| `CONTACT`（贴面） | 躺在接收面上，quad 法线 = 接收面法线，沿接收面推开 | 沿接收面法线抬 `paint_depth_offset_m`（默认 0.004 m） |
| `SILHOUETTE` / `SKY` | 相机平面内。`u = tangent.cross(camera_forward).normalized()`，朝向是编译期常量，运行期不做 billboard | 沿 `-camera_forward` 推 `paint_depth_offset_m`，压过近侧表面 |

贴面 quad 假设接收面在笔触尺度内是平面或分段平面——这与现有编译器"面向平面／分段平面接触"的限制一致，不是新增约束。

**顶点布局：**

| 通道 | 内容 |
| --- | --- |
| `ARRAY_VERTEX` | anchor 空间位置，quad 按 `edge_width_max_m` 建（宽度靠运行期 alpha 收窄） |
| `ARRAY_NORMAL` | receiver 法线；`SKY` mode 无接收面，此处复制 donor 法线，着色时不使用 |
| `ARRAY_TEX_UV` | 刷子图集内 uv |
| `ARRAY_TEX_UV2` | `(variant_layer, mode_flag)` |
| `ARRAY_COLOR` | donor albedo（线性）+ opacity |
| `ARRAY_CUSTOM0` | donor 法线 |
| `ARRAY_CUSTOM1` | receiver albedo + importance；`SKY` mode 的 albedo 位存背景参考色（线性） |

关键约定：**编译期只存 albedo 与法线，不存明度。** 太阳每次 `set_lighting()` 都会变，任何编译期烘死的颜色到傍晚就穿帮。

**密度与强度。** `seam_coverage` 继续控制沿边的笔触支持宽度目标比例，接触边与轮廓边共用同一个值；`seam_strength` 继续是 0–1 的全局强度，直接乘进 ribbon 的最终 alpha。两者的语义与现在一致，只是作用对象从 uniform 笔触换成了 quad。

**排序。** 同一条 mesh 内按 donor 的 `paint_order` 排索引——`blend_mix` + `depth_draw_never` 下，同一 draw call 内的光栅化顺序即混合顺序，这直接继承 `rebuild()` 末尾那次 `stamps.sort_custom()`。跨接收面用 `render_priority`，取该接收面自身的 `paint_order` 归一化到 `[-128, 127]`。不同表面的 ribbon 在屏幕上重叠的概率低，这是有意的简化，写在限制里。

## 7. ribbon 着色

```
render_mode blend_mix, unshaded, depth_draw_never, cull_disabled;
```

深度测试保留。fragment 里跑**两遍**同一套光照：一遍 `(donor_albedo, donor_normal)`，一遍 `(receiver_albedo, receiver_normal)`，各自过 `lighting.gdshaderinc` 的漫反射与 Oklab 选择性上色，得到 `L_donor` / `L_receiver`。`SKY` mode 的 receiver 侧直接取背景参考色——线性空间的常数，不受光，也不参与 `output_map` 之前的任何光照。

**并值：**

```
diff  = abs(L_donor - L_receiver)
pull  = smoothstep(edge_pull_lo, edge_pull_hi, diff)
mid   = oklab 里 donor 与 receiver 的中点
paint = mix(donor_lab, mid, pull)
```

在 Oklab 里插值，不在 RGB 里，与模块既有取向一致。这是画家的做法：不为化一条边去重刷整面墙，直接在这条边上用一个中间值。默认 `edge_pull_lo = 0.06`、`edge_pull_hi = 0.35`（Oklab L 差）。

**失边宽度：**

```
width = mix(edge_width_min_m, edge_width_max_m, pull) * mix(1.0, 0.15, importance)
```

值差越大越宽越软；重要度越高越窄越锐。quad 编译期按 `edge_width_max_m` 建，运行期把刷子图在 quad 内按 `width / edge_width_max_m` 收窄采样，quad 外围 alpha 归零——所以宽度是运行期可变的。

`importance` 复用已有的 `importance_map` 输入约定，是整套方案里最"画家"的旋钮，也是参考图里"暗部整片并成一块、只有窗门留锐边"的直接对应物。

**贴面 ribbon 额外吃阴影。** `CONTACT` mode 在 fragment 里按世界坐标重跑一次 `brush_shadow()`，共享接收面的 `flow_map` / `importance_map` / `contact_map` / `map_plane` / `map_origin` / `map_extent` / `data_transform` uniform（每个接收面一条 ribbon，所以这些 uniform 一一对应）。否则屋檐下的叠色会浮在阴影上面。

`SILHOUETTE` 与 `SKY` mode 跳过遮罩：轮廓边不在任何接收面的阴影几何里。

最终颜色仍走 `output_map()`，与表面同一条输出曲线。

## 8. 数据流与重建触发

正交投影下视线方向恒定，所以相机平移与 `size` 缩放不改变轮廓关系。

| 变化 | 动作 |
| --- | --- |
| 注册 / 注销 / 可见性 / mesh 替换 / 相对位置 | 全量重建（沿用 `_seam_dirty` 与 `signature()`） |
| 相机**旋转或投影类型**变化 | 全量重建 |
| 相机平移、`size` 缩放 | 不重建 |
| 太阳方向 / 光色 / 环境光 / 天气 | 不重建（明度是运行期算的） |
| 整体刚性移动 | 不重建 |

重建是加载期同步 CPU 工作加一次 GPU 回读。回读需要真实窗口，headless 无法完成——与现有 GPU 验收的约束一致。

## 9. 错误处理

| 情况 | 行为 |
| --- | --- |
| 轮廓提取失败（SubViewport 未就绪、回读为空） | **保留上一次完整的 ribbon**，报错，不清空 |
| 局部规则错误（重复/双向 override、未知 id） | 硬失败，整体作废，不产生部分结果 |
| 顶点预算超限 | 按 `opacity × 边长` 排序**截断**，在 `stats.truncated` 报告数量 |
| 背景参考色不可用（宿主用了 Sky 而非纯色，且未设 `sky_reference_color`） | 关闭 `SKY` mode 的 ribbon 并警告，不用一个错的颜色去混 |

前两条与现有原则一致。后两条是**有意的偏离**，需要在审阅时确认：

- 轮廓提取失败时不清空——现有 `rebuild()` 出错把所有 `seam_stamp_count` 置 0（`seam_paint.gd:363`）。对 uniform 是对的（半套 uniform 会错），对几何则等于画面突然掉一层。保留的是上一次**完整**结果而非半套，所以"不产生部分错误结果"没有被破坏。
- 预算超限截断而非整体作废——预算超限不是配置错误而是场景规模问题，整体作废意味着大场景直接没有效果。

## 10. 接口变更

**删除：**

- `PainterlyRenderer.seam_max_drips`，以及笔触上的 `drip_length` / `drip_width` / `drip_direction` / `drip_priority` / `long_drip`。参考图里没有任何流挂，DE 的颜料感来自边和块；趁迁移删掉，省两条 uniform 通道和对应验收。
- `shaders/seam_paint.gdshaderinc` 全部 uniform（`seam_origins` / `seam_tangents` / `seam_directions` / `seam_colors` / `seam_styles` / `seam_drips` / `seam_stamp_count` / `seam_from_local` / `seam_brushes` / `seam_regions`）与 `apply_seam_paint()`。

**新增（`PainterlyRenderer`）：**

| 属性 | 默认 |
| --- | --- |
| `silhouette_enabled` | `true` |
| `silhouette_resolution_scale` | `2.0` |
| `silhouette_depth_threshold_m` | `0.15` |
| `silhouette_min_edge_length_m` | `0.25` |
| `sky_reference_color` | 未设时从 `WorldEnvironment.bg_color` 取并转线性 |
| `paint_vertex_budget` | `60000` |
| `edge_width_min_m` | `0.04` |
| `edge_width_max_m` | `0.45` |
| `edge_pull_lo` / `edge_pull_hi` | `0.06` / `0.35` |
| `paint_depth_offset_m` | `0.004` |

**保留不变：** `seam_enabled`、`seam_strength`、`seam_seed`、`seam_coverage`、`seam_contact_tolerance_m`、`seam_overrides`，以及 `PainterlySurface` 的 `paint_id` / `paint_order` / `seam_participation` / `seam_protection` / `seam_protection_map`。"seam" 在新模块里泛指边，语义仍成立。

**改名：** `rebuild_seam_paint()` → `rebuild_paint()`；成员 `seam_paint` → `paint`；`get_stats().seam_paint` → `get_stats().paint`。波及 `demos/seam_lab/lab.gd` 约 30 处引用，与该文件的验收重做一起改。

**调试通道**（保留旧编号 0–16，追加）：

- `17 EDGE_PULL` — 并值强度
- `18 EDGE_KIND` — `CONTACT` / `SILHOUETTE` / `SKY` 三色

**统计**（`get_stats().paint`）：`build_count`、`extract_ms`、`trace_ms`、`build_ms`、`eligible_surfaces`、`contact_edges`、`silhouette_edges`、`contact_stamps`、`silhouette_stamps`、`sky_stamps`、`receivers`、`vertices`、`truncated`、`errors`。

## 11. 实施顺序

顺序是按"画面变差的窗口最小"排的。拆掉材质阶段之后，接触叠色要在 ribbon 里重新对齐阴影遮罩与保护图，中间必然有一段画面比现在差——现有 25 项 bluebird 接缝验收是真通过的。这是"一套到底"的必然成本，只能压缩不能消除。

1. 抽出 `lighting.gdshaderinc`，`surface.gdshader` 改用它。纯重构，`demos/painterly_lab` 93 项应全过、画面零变化。
2. 建 ribbon 管线，**只接接触边源**，与现有材质阶段并行运行，用 `EDGE_KIND` 通道对照，直到贴面 ribbon 复现现有 25 项 bluebird 接缝验收。
3. 拆掉材质阶段与 `seam_paint.gdshaderinc`。
4. 接轮廓边源：`silhouette_extractor.gd` + `surface_id.gdshader` + `SKY` mode。
5. 加并值与 importance 驱动的宽度。
6. 删颜料滴。
7. 全量验收与文档。

## 12. 验收

`demos/seam_lab`（39 项）与 `demos/bluebird` 接缝（25 项）重做。两者都要求真实 Forward+ 窗口：

```sh
Godot --path godot-client --scene res://demos/seam_lab/lab.tscn -- --seam-qa
Godot --path godot-client --scene res://demos/bluebird/street_corner.tscn -- --bluebird-seam-qa
```

**存在性**——现有系统零覆盖的边，做不出来整个方案不成立：

1. 屋脊对天空产生 ribbon。
2. 自遮挡边（烟囱压屋面）产生 ribbon。
3. 被别的建筑完全挡住的轮廓**不**产生 ribbon。

**正确性：**

4. 太阳从正午转到傍晚，ribbon 明度跟两侧一起变，无穿帮。这是"运行期跑两遍光照"这个决定的验证——编译期烘死的话此项必挂。
5. 相机平移与缩放时 ribbon 不游移；相机旋转触发重建，`build_count` 递增。
6. 贴面 ribbon 落进屋檐阴影时被压暗，不浮在阴影上面。
7. 并值：构造两组明度差，验证值差大时 ribbon 变宽变软、值差小时收窄。
8. `importance = 1` 的表面边缘保持锐利且几乎不并值；`importance = 0` 化开。
9. 单向性：donor 只读原始基色，不读自身 ribbon 结果、不读光照——无反馈、无互染。
10. `seam_enabled = false` 与 `silhouette_enabled = false` 各自完全恢复。
11. 顶点数、绘制调用、加载期重建耗时，与现在的 1.86 秒对照。
12. 预算截断路径：人为压低 `paint_vertex_budget`，确认截断发生且 `stats.truncated` 如实报告，画面不整体消失。

**回归**（迁移后仍须成立）：同层不扩散、逐像素保护图、注册顺序稳定、种子稳定、局部方向覆盖、双向规则拒绝、源面注销、闭合网格与垂直接触。

## 13. 限制

- 只面向固定正交相机。旋转相机会触发全量重建，不适合运行期自由旋转。
- 轮廓曲线精度受捕获分辨率限制；`size` 大幅放大后精度会不足，但不触发重建。
- 贴面 quad 假设接收面在笔触尺度内是平面或分段平面。
- 跨接收面的 ribbon 排序按接收面自身 `paint_order`，是简化；不同表面的 ribbon 大面积重叠时顺序可能不符合预期。
- 编译产物在内存中，无离线持久缓存。
- 不覆盖动态形体、透明与 alpha cutout 表面。
