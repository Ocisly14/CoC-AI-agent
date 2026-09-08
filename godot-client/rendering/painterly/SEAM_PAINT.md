# 全场景单向接缝叠色

这是 `PainterlyRenderer` 的通用材质阶段，处理所有参与注册的漫反射表面；没有蓝鸟对象名、屋顶高度、墙面坐标或预制接缝表。蓝鸟与独立几何实验室共用同一个编译器和 Shader。

## 美术约定

为表面设置绘画层级 `paint_order`，高层向低层覆盖，同层默认不发生叠色。位置随机只决定笔触布局，不决定覆盖方向。默认约 8% 的接缝长度分配给笔触，实际支持宽度还会随机收缩；多数接缝保持原样。

每笔从来源边缘附近三个位置采样原始基色与 UV 贴图，在 sRGB 解码后取局部平均。来源不读取自己的接缝叠色结果、直射光、阴影或间接光，所以不会反馈、互染或把源物体的光照复制过去。按绘画层级和稳定笔触 ID 依次合成，接收表面的正常光照与调色随后运行。

五种已有刮刷图只贡献 alpha 轮廓，颜料 RGB 来自实际来源表面。覆盖处有较实的色面，边缘有透明缺口和露底。少量笔触携带固定颜料滴，短厚挂滴与细长流挂的随机概率为 70%／30%，当前默认整场景最多两处；不会播放滴落动画。

## 接入与接口

```gdscript
var inputs := PainterlySurface.new()
inputs.paint_id = "building-a/wall-plaster" # 可选；缺省用稳定节点路径
inputs.paint_order = 10
inputs.albedo_texture = wall_texture
renderer.register_surface(wall_mesh, inputs)
# 其他来源表面设置更高层级后注册即可；无需传入接缝位置。
```

| 接口 | 含义 |
| --- | --- |
| `PainterlySurface.paint_id` | 稳定且唯一的表面 ID，用于随机布局和局部规则 |
| `paint_order` | 整数绘画层级，默认 0；高层覆盖低层 |
| `seam_participation` | 是否参与全场景接缝分析 |
| `seam_protection` | 0–1 的整表面保护；1 完全退出分析 |
| `seam_protection_map` | R=1 保护该像素免于接收叠色；线性数据图，与重要度图共享映射坐标 |
| `PainterlySeam` | 可选局部覆盖规则，设置 `source_id`、`receiver_id`；`disabled` 禁用该对表面的交界 |
| `renderer.seam_overrides` | 局部规则数组，优先于层级；重复或双向规则会拒绝编译，不产生部分错误结果 |
| `seam_enabled` / `seam_strength` | 独立全局开关和 0–1 强度；修改后 `refresh_settings()` 即可 |
| `seam_coverage` | 接缝笔触支持宽度目标比例，默认 0.08，上限 0.15 |
| `seam_contact_tolerance_m` | 实际几何接触容差，默认 0.035 米；不要为屏幕上看似邻近的物体增大它 |
| `seam_seed` / `seam_max_drips` | 稳定随机种子及全场景颜料滴上限，默认 71／2 |
| `rebuild_seam_paint()` | 显式重建几何关系与源色缓存，返回统计和错误；调整布局参数、局部规则或原地修改贴图后调用 |
| `get_stats().seam_paint` | 编译耗时、接缝、接收表面、笔触、滴落数量等；不是 GPU 耗时 |

注册、注销、`refresh_surface_inputs()`、网格替换和相对位置变化会更新接缝。整体刚性移动、相机变化和太阳变化复用原缓存。所有表面的共同坐标锚点是渲染器最近的 `Node3D` 祖先，模型和渲染器应随同一场景根节点移动。

调试枚举追加 `SEAM_MASK`、`SEAM_SOURCE`、`SEAM_DIRECTION`，保留旧通道编号。蓝鸟中 **B** 切换接缝叠色，**P** 仍只控制原有艺术调色，菜单可查看新通道。

## 几何识别与运行方式

1. 对注册网格的三角形位置进行约 0.1 毫米的几何焊接，过滤三角化对角线与 UV 岛边界；提取实际材质边界和闭合实体折边。
2. 用表面包围盒与米制空间索引筛选接触候选，匹配相邻边，以及边接到另一表面中段的垂直接触。合并同一对表面上的共线片段。
3. 按稳定 ID、接缝位置与种子建立稀疏笔触，采样来源 UV 的原始颜色。每个接收表面最多支持 128 笔，超限明确报错并关闭本次结果。
4. Shader 使用接收面的固定坐标和法线限制覆盖范围，结合 alpha 图及可选保护图，将颜色合成到受光前的基色中。没有新增透明几何或全屏模糊 pass。

容差按实际几何距离工作，不是可见颜色相近就认为接触。几何遮挡继续生效，所以部分真实接缝在当前镜头中不可见。统计中的覆盖比例是候选接缝的笔触支持宽度总和／长度总和，不是最终屏幕覆盖率。

## 验证与当前边界

- [独立几何实验室](../../demos/seam_lab/qa/validation.json)：真实 GPU 单向取色、同层不扩散、保护图、注册顺序稳定、不同随机种子、镜头／整体移动、日照、局部方向覆盖、双向拒绝、源面注销、两类滴形及闭合网格／垂直接触检查。
- [蓝鸟验证](../../demos/bluebird/qa/seams/validation.json)：使用全局自动识别，检查层级、保护、稀疏度、开关、截图、日照稳定和启用前后的绘制调用／帧时间。
- [屋檐细节](../../demos/bluebird/qa/seams/09-drip-detail.png)、[关闭对照](../../demos/bluebird/qa/seams/10-drip-detail-before.png)；全景、近景和遮罩在同一目录。

```sh
Godot --path godot-client --scene res://demos/seam_lab/lab.tscn -- --seam-qa
Godot --path godot-client --scene res://demos/bluebird/street_corner.tscn -- --bluebird-seam-qa
```

两项 GPU 检查必须打开实际 Forward+ 窗口。原调色／阴影实验室另做回归。

当前面向应用缩放后的静态刚性三角网格及平面／分段平面接触；不是骨骼、粒子、曲面液体或贴图内部颜色分区算法。透明和 alpha cutout 不进入接缝编译。自定义程序基色需提供相应的颜色输入，编译器不会执行其他自定义材质 Shader 来取色。输入与颜色缓存目前在内存中，重建是同步 CPU 工作；较大场景应在加载阶段重建，尚无离线持久缓存或大世界流式预算。

本机最终结果（Godot 4.7.2 / Forward+ / Apple M5）：独立接缝实验室 39 项、蓝鸟接缝 25 项、原光影实验室 93 项检查通过。蓝鸟当前数据重建约 1.86 秒，18 个表面接收编译结果，整场景两处颜料滴；许多实际接触位于遮挡处，因此成片中的变化保持少量。绘制调用启用前后均为 699；一次短样本的帧间隔中位数分别约 8.30／8.40 毫秒，不能视为跨设备性能保证。GPU 独立计时不可用，报告为 null。

可见叠色的局部比较：[开启](../../demos/bluebird/qa/seams/11-visible-paint-detail.png)、[关闭](../../demos/bluebird/qa/seams/12-visible-paint-before.png)。短挂滴与长流挂的隔离放大遮罩分别见独立实验室 `05-short-drip.png` 和 `06-long-drip.png`，避免把被模型遮挡的痕迹当作当前镜头中必然可见的效果。
