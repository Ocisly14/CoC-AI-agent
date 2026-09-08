# PainterlyRenderer · 油画渲染模块 v0.6

**压力盖印更新：** Aui 默认路径已增加逐印记压力大小、压扁、倾角与独立含漆量；贴地建筑从可见背光侧根部开始力度曲线。实验室提供算法对比和单笔轮廓预览。见[压力盖印实现、资源与实测](PRESSURE_STAMPS.md)。

**2026-09-08 更新：** 实验室和蓝鸟默认改用用户的 Aui Vangogh 原始颗粒连续铺色，从接地根部起笔，逐渐收尾。旧整笔贴图保留作对比。笔刷包缺少内置 Shape 源图，当前为 Godot 适配；素材来源、范围、实际截图与检查见 [Procreate 笔刷接入](PROCREATE_BRUSHES.md)。以下旧贴图参数说明在关闭 Aui 模式时仍适用。

Godot **4.7.2 / Forward+** 的可运行漫反射 NPR 原型。采用独立太阳深度捕获、接收面上的物理／笔刷遮罩、分离的直射与环境输入、连续 Oklab 色彩权重，以及输出色域映射。蓝鸟 v10 已通过独立静态逐表面适配器接入颜色、控制贴图与笔刷投影，见 [蓝鸟 demo](../../demos/bluebird/README.md)；实验室使用程序几何、数据测试图和 5 张经用户逐张确认的透明刮刷贴图。

## 先看实际效果

在 Godot 中打开 [`lab.tscn`](../../demos/painterly_lab/lab.tscn)，按 **F6** 运行。项目原有默认场景不变；F5 仍运行原默认场景。

```sh
Godot --path godot-client --scene res://demos/painterly_lab/lab.tscn
```

- **1 / 2**：晴天、夕阳；上方滑条连续改变光向和光色。
- **P**：油画处理开关，保留同一物理照明与输出曲线，便于对比。
- **D / 通道菜单**：查看固有色、未遮挡阳光、环境输入、原始／笔刷遮罩、重要度、流向、固定笔触、增强权重、线性合成、遮罩差异。
- **笔宽 m / 笔刷重叠**：按投影宽度自动排笔，默认全长固定重叠 20%。
- **最短 % / 最长 %**：每笔长度范围，默认 80%–120%。
- **原型拖刷 / 原型缺口**：仅关闭贴图模式、对比程序原型时可用。
- **积色 / 毛刷滑条**：调节笔触交叠处加深与断续刷毛强度；菜单另有“笔触积色”“毛刷纹理”调试通道。
- 滚轮缩放，中键平移，正交视角固定。

![多笔刷随机填充的实际运行近景](../../demos/painterly_lab/qa/18-approved-rooted-noon.png)

## v0.4：确认贴图与实填根部

默认实验室已替换旧 `oil-shadow-variant-1…6.png` 和单图 `oil-shadow-stroke-v2.png`，使用以下 5 张确认过的原图（文件名保留 `preview` 以保持对话链接可用）：

| 贴图 | 收尾形状 |
| --- | --- |
| [solid](textures/oil-shadow-solid-preview-v1.png) | 厚实矩形主体，末段露底 |
| [asymmetric](textures/oil-shadow-asymmetric-preview-v1.png) | 一边长、一边短 |
| [offset-notch](textures/oil-shadow-offset-notch-preview-v1.png) | 两边长，偏心位置提前收笔，斑点提早出现 |
| [knife](textures/oil-shadow-knife-preview-v1.png) | 锐利刮刀切面、偏心凹口 |
| [fine-tail](textures/oil-shadow-fine-tail-preview-v1.png) | 一边刮出细线，另一边宽硬收尾 |

这些图都由内置 imagegen 生成，带真实 RGBA 透明通道。加载时按可见颜料（alpha > 0.1）计算 UV 范围，保留原 alpha；五张图分别存入带 mipmap 的纹理数组，避免不同笔刷之间串色。GPU 层尺寸 1024×384，源图保持原样。

根部仅在已有笔触内增加颜料覆盖，已取消独立的满覆盖接地色块。默认 `shadow_root_fill_m = 0.22 m`，随后在相同距离内平滑退出加深；短阴影按可用长度缩小保护区。贴地压力笔触从可见背光侧开始，保留完整椭圆笔尖；靠墙范围抑制迎光侧和侧边越界，离墙后保留自由笔刷轮廓。这里使用显式 AABB 投影代理，不宣称是复杂建筑的精确轮廓。悬空物体没有接地加深；零压力、零颜料量不留下独立根部暗块。见[起笔与根部修复验证](SHADOW_ROOT_FIX.md)。

历史 v0.4 [GPU 验证报告](../../demos/painterly_lab/qa/validation.json)共 **93 项通过**，其中“所有根部采样覆盖为 1.0”属于已移除的补实方式，不再作为当前验收条件。当前要求接地笔触连续、保留圆润边缘与颗粒，并且不产生独立填充。

- 数量 `N = max(1, ceil((投影宽度 / 目标笔宽 − 1) / 0.8) + 1)`，默认目标笔宽 **0.85 m**。实际笔宽拟合阴影总宽度，相邻中心间距为实际笔宽的 80%。每片阴影独立计算，宽阴影不再固定为三笔。每像素只检查相邻三笔，笔触总数不受旧版五组上限限制。
- 每笔从对应遮挡物投影截面的根部出发，长度 = 该截面的阴影长度 × 随机比例。`shadow_length_min = 0.8`、`shadow_length_max = 1.2`；上下限颠倒时自动排序，值限制在 0.2–2.0。不叠加旧版拖刷距离，确保整笔长度受范围约束。
- `shadow_brush_overlap = 0.2`：相邻笔刷全长按笔宽固定重叠 **20%**，不向尾端变窄或逐渐分开。取消会改变重叠比例的横向位置、宽度与角度随机扰动；保留随机纹理、翻转和 80%–120% 长度。缺口来自贴图透明区域与不齐的收尾，重叠可能自然填满其中一部分；日照使用同一个遮罩的补集。
- 普通矩形笔刷（第 1 张）概率 **80%**；另外 4 种收尾合计 **20%**，每种 **5%**。这是每笔的抽样概率，单片阴影的数量比例不强制凑整。
- 根据遮挡物稳定 ID、笔触序号与 `shadow_brush_seed` 选择纹理、翻转与长度；不依赖时间或相机。光向变化导致排笔数量改变时，笔触会重新分配。

注册前设置 `shadow_brush_textures: Array[Texture2D]` 即可使用多笔刷；运行中替换列表后调用 `rebuild_brush_textures()`。最多 16 种纹理，空资源和空白笔刷跳过；长度、笔宽、缺口与种子修改后只需 `refresh_settings()`。`texture_shadows_enabled = false` 可切回程序原型。旧 `oil_brush_atlas` 仅作单图兼容，不是多图模式的必需输入。

整片笔刷阴影使用 **AABB 遮挡物代理 + 接收面坐标投影**，支持地面、屋顶、墙面及斜面；不能视作复杂网格的精确轮廓。最多 32 个已发布遮挡物。原先立墙回退物理遮罩的限制已经取消，灯具的太阳／月光投影会进入同一压力笔刷路径。地面沿用原坐标与缓存排笔，非水平面在 Shader 中变换代理并按米制笔宽排笔，镜头不参与。见[墙面阴影验证](WALL_SHADOWS.md)。

最新 GPU 验收见 [validation.json](../../demos/painterly_lab/qa/validation.json)：包括不同笔宽下的实际笔触数量、80%–120% 支持范围、固定帧随机稳定、透明缺口保留、旧拖刷无法突破长度上限、以及已有照明与捕获回归。隔离测试使用实心测试笔刷测量长度，再替换正式笔刷验证其 alpha 缺口。

## 接入已有场景

模块不自动扫描、替换整场景材质，也不修改全局灯光。明确注册需要参与本管线的 `MeshInstance3D`；每次注册以一份 `PainterlySurface` 覆盖整个 mesh 的材质。多材质建筑应按材质拆分网格或在后续适配层做逐表面注册，不能直接覆盖后宣称原材质都被保留。

```gdscript
extends Node3D

func _ready() -> void:
    var renderer := PainterlyRenderer.new()
    renderer.name = "PainterlyRenderer"
    add_child(renderer)
    # 注册材质已经自行完成输出映射，宿主环境必须保持线性、中性输出。
    $WorldEnvironment.environment = PainterlyRenderer.neutral_environment(Color("262f34"))
    var inputs := PainterlySurface.new()
    inputs.albedo = Color("a7a595")
    inputs.painterly_shadows = true
    renderer.register_surface($Ground, inputs)
    renderer.set_lighting(Vector3(-0.6, 0.95, -0.55), Color("fff6e5"), 1.1)
    renderer.set_environment_light(Color("a7bddb"), 0.42)
```

`set_lighting` 的方向是**从表面指向太阳**，输入会归一化。所有样板单位为米，网格建议应用缩放后以刚性变换放置。主相机若有独立 Environment，也必须使用相同中性配置；不能在输出上再次套 ACES、自动曝光或全局去色。

| 接口 | 用途 |
| --- | --- |
| `register_surface(mesh, inputs)` | 注册接收／投影网格，返回 ShaderMaterial；需 renderer 已进入场景树 |
| `unregister_surface(mesh)` | 移除捕获代理，恢复注册前材质；退出树也恢复原材质 |
| `set_brush_caster_volumes(volumes, transform)` | 提供最多 32 个专用 AABB 及其到世界的变换；替代自动逐表面笔刷代理，不改变物理捕获成员。空数组恢复自动代理；移动后需重新提交 |
| `set_lighting(direction_to_sun, color, energy)` | 设置太阳；方向变化请求捕获，只有光色／能量变化时复用深度 |
| `set_environment_light(color, energy)` | 设置独立环境分量，不触发太阳增强 |
| `refresh_settings()` | 修改模块属性后同步 Shader；不重捕获深度 |
| `refresh_surface_inputs(mesh)` | 同步贴图、流向、重要度等输入；只有遮光成员／alpha 规则变化才请求捕获 |
| `request_capture()` | 更改捕获范围或原地修改网格／alpha 图像后显式更新；变换、显隐、mesh 替换自动检测 |
| `capture_committed` / `is_capture_pending()` | 判断纹理与对应太阳参数是否已同步提交 |
| `get_capture_texture()` / `get_stats()` | 读取独立捕获与统计信息；避免每帧 CPU 回读纹理 |

## 输入约定

`PainterlySurface` 是可在 Godot 检查器保存的 Resource：

| 输入 | 约定 |
| --- | --- |
| `albedo` / `albedo_texture` | 颜色按 sRGB 输入；纹理走模型 UV，并支持 alpha cutout |
| `importance_map` | R 通道，线性数据，0 次要／1 焦点；缺图用 `default_importance = 0.2` |
| `flow_map` | RG 存无向轴 `(cos(2θ), sin(2θ)) × 0.5 + 0.5`，线性数据；双角编码避免 180°等价轴互相抵消；缺图用 `default_flow` |
| `data_transform` | 网格本地 → 共用数据坐标的变换，默认单位阵；不改变基色 UV |
| `map_plane` / `map_origin` / `map_extent` | 数据图映射到变换后的 XZ、XY 或 ZY 平面；默认地面 XZ。保持图块扩边及连续性 |
| `indirect_map` / `indirect_tint` | 独立间接入射 RGB 线性数据／sRGB 色值输入；乘基色后进入 B，不包含太阳直射 |
| `indirect_alpha_occlusion` | 默认 false；启用后间接图 A 是环境可见度，只调制 ambient 项，不调制太阳或间接 RGB；图像 alpha 应为独立数据通道 |
| `contact_protection_map` | R 通道，1 保护接触不受笔刷侵蚀；与重要度独立 |
| `painterly_shadows` | false 使用本模块原始物理遮罩；适合初版建筑本体 |
| `casts_shadow` | 是否出现在独立捕获场景中 |

Flow、重要度、接触与间接光图都是数据图，不能给采样器加 `source_color`。基色需 mipmap；模块以重要度控制细节保留。全局可提供 `brush_texture` 作为线性灰度笔刷形状图；缺图时采用固定表面坐标的程序宽笔触，这是关闭多贴图模式后的对比原型。

## 共同照明管线与程序原型参数

1. 两个独立 HDR `SubViewport` 交替捕获注册网格的光空间深度。使用 `use_hdr_2d = true` 保持纹理线性；深度用 RG 高低位分拆编码，读取为 `r + g / 64`，降低 HDR 目标精度不足造成的自阴影噪点。
2. 接收点按实际世界坐标和高度进行深度比较，得到 `M0`。从独立捕获纹理生成遮罩，未调用引擎内置 `ATTENUATION`；当前 `M0`、`Mp` 在接收面 Shader 内计算，按调试模式显示，尚未物化成地面图块纹理。
3. 贴图模式按上一节建立整片 `Mp`；程序原型由固定 flow 控制主体笔触，边缘处理核允许沿光向向外拖刷、向内咬出缺口。重要度控制边缘强弱，接触图保护贴地部分。日照遮罩只在边缘带变化；内部增加固定表面笔触的轻微积色与断续刷毛，不用各向同性颗粒噪声。
4. 独立计算未遮挡直射 `S0` 与环境／间接输入 `B`。从未染色基色与归一化太阳颜色计算彩度可信度；正午近白太阳自动减弱色相强调，仍保留明度。
5. `B + (1−Mp) × S_styled` 只对日照乘一次可见度。随后应用重要度控制的表面明度对比曲线，再经过感知明度高光软压缩及保持 L/h、降低 C 的二分色域映射。
6. 捕获纹理及对应光空间矩阵、太阳方向一起发布。正在捕获下一状态时保留上一完整状态；主相机变化不重捕获。

默认宽笔触为 **1.3 m 长、0.24 m 宽**；向外拖刷 **0.9 m**、向内缺口 **0.5 m**，并按重要度和保护图衰减。相比最初文档的小幅破边，这组参数响应用户“正常视距明显看到笔触和缺口”的最新要求。三个尺度分开调节。

### v0.2：笔触积色与毛刷

固定表面坐标中放置长度、宽度和中心略有差异的有限笔触，计算其重叠覆盖量。`overlap_darkening = 0.14` 为线性亮度相对加深的上限，实际按额外覆盖量平滑收敛。加深来自**颜料笔触交叠**，不是重复相乘太阳阴影，也不是统计遮光物数量；只在最终笔刷阴影覆盖范围内生效，并保持原冷色相。

`bristle_strength = 0.55`、`bristle_spacing_m = 0.065` 控制沿 flow 方向排列的细刷毛。刷毛略有游移和断续，交叠的颜料会填平部分干刷沟槽。边缘的刷毛分叉先进入 `Mp`，因此仍与日照增强共用边界；主体内的细纹只微调颜料明暗。使用像素覆盖宽度衰减无法分辨的细线，避免将亚像素条纹维持为高对比纹理。

流向映射与面法线需大致平行；同一地板 mesh 的垂直侧面保留原始物理遮罩，不拉伸地面刷毛。默认程序笔触仍是渲染测试形状，后续可配合正式美术笔刷图调整。

v0.2 当时的 GPU 检查共 50 项通过，新增检查验证积色范围、受控加深、未受阴影地面不被污染、正常视距毛刷可见，以及参数变化复用原捕获。报告中采样到最大约 12.3% 的线性亮度加深；这不是整幅画统一变暗。调试图见 `qa/12-pigment-overlap.png`、`qa/13-bristle-detail.png`，近景为 `qa/14-pigment-bristles-closeup.png`。

`color_response`、`contrast_response`、`edge_response`、`detail_response` 分别控制重要度的四种响应。`contrast_response` 当前是**按重要度作用的表面明度曲线**，不是跨物体、多尺度的屏幕局部对比算子；不会执行全屏锐化。

## 验证与限制

在本机 Godot 4.7.2 / Forward+ / Apple M5 进行了真实 GPU 运行。检查及截图在 [`qa/`](../../demos/painterly_lab/qa/)，运行：

```sh
Godot --path godot-client --scene res://demos/painterly_lab/lab.tscn -- --painterly-qa
```

该命令会打开窗口、覆盖实验室 `qa/` 输出，然后退出；headless 无法完成这些 GPU 检查，会明确失败。运行时普通模式不执行测试或写截图。最新结果见 [`validation.json`](../../demos/painterly_lab/qa/validation.json)。

验收涵盖几何射线与 GPU 阴影对照、数值深度编码、外拖与内缺口、主体阴影完整、相机／光向变化下固定笔触、间接光不误触发增强、Oklab 参考与往返、色域渐变、软限幅、颜料积色与毛刷、输入更新及注册恢复。测试图是合成数据，不代表蓝鸟美术方案。

明确范围：

- 本版是**注册表面的自定义漫反射渲染模块**，不是完整 PBR 替代。没有接入 Godot 原生 SDFGI／LightmapGI 的内部缓冲；当前 B 为环境输入加外部间接图／颜色。现有 PBR、金属、玻璃、额外灯和透明混合物体应留在原管线，不能直接自动转换。
- 捕获只包含注册网格；固定捕获盒外没有本模块阴影。原地修改共享 mesh 或 alpha 图像需显式请求更新，骨骼／粒子／植被风动不在本轮范围。固定图块扩展、大世界流式加载和跨层桥面未验收。
- 流向／重要度按选定本地平面映射，复杂曲面需要后续 UV 适配。非均匀缩放会改变笔触实际尺度；样板假设应用缩放后的米制几何。
- 捕获有双缓冲同步延迟，连续昼夜可运行；高速移动物体、太阳快速跳变的视觉连续性仍需对应内容验收。阴影外拖是艺术近似，不重算同区域 GI。
- GPU 计时接口在本机返回 0，因此报告标为 `null`，不能当作零 GPU 耗时。捕获延迟含调度等待，不等于 GPU 成本；64 MiB 是两个 2048² RGBA16F 颜色目标的估算上界，不含深度和驱动中间缓冲，尚未做整场景性能预算。

接口依据：[Godot ViewportTexture 的线性 HDR 约定](https://docs.godotengine.org/en/4.7/classes/class_viewporttexture.html)、[Oklab](https://bottosson.github.io/posts/oklab/)、[色域映射](https://bottosson.github.io/posts/gamutclipping/)。项目艺术规则见[专项技术设计](../../../docs/art-direction/selective-color-brush-shadows.md)。

## 光照驱动的油画高光

[油画高光模块](highlights/README.md)取代接触与轮廓颜料带。12 张实际生成的透明油画笔触分为玻璃、金属、边框三组，按固定种子排列在物体表面，通过同网格的附加材质 pass 接收 Godot 原生太阳、月光和局部灯的方向、颜色、能量、距离及阴影衰减。亮笔不读取视角，不做轮廓捕获、GPU 回读或逐帧几何构建。

蓝鸟按 **B** 切换高光，F3 的「油画高光」页提供分组、密度、尺寸、强度、方向、覆盖/受光预览和重新排笔。原油画阴影和漫反射调色保持独立。旧 `qa/seams` 报告为历史数据，当前验证见 `demos/highlight_lab/qa/validation.json` 和 `demos/bluebird/qa/highlights/validation.json`。
