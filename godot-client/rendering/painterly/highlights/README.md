# 光照驱动的油画高光

接触和轮廓颜料带已删除。当前模块把实际生成的油画笔触叠加到玻璃、金属及近直射边框上。底图、玻璃透明度、金属度和原漫反射油画阴影保留；亮笔使用同一网格的附加材质 pass，不生成新网格，不捕获轮廓、不回读 GPU、不在光照或相机变化时重新排笔。

## 素材

`textures/` 包含内置 imagegen 生成的 12 张原始 RGBA PNG：玻璃宽刮、金属亮笔、框条细长干刷各 4 张。每张独立生成，原提示词和来源记录在 `manifest.json`，原始图像验证在 `asset-validation.json`。中性浅色 RGB 保留颜料浓淡，alpha 保留破边和露底。

首次加载把整张原图等比缩放并居中到 1024×384 的纹理数组页，至少保留 24 px 的透明边界，随后生成 mipmap。没有按 alpha 包围盒裁图。部分原图边缘有极低 alpha 像素，也完整保留在留白以内。GPU 实验室验证全部数组页四边透明。

## 渲染与布局

物体局部米制坐标按固定种子选择笔触位置、变体、长度和轻微倾角；邻域采样允许跨格支持区，避免格子裁边。每片元最多检查九个布局候选，只有落在笔触矩形内才读取对应图层。多个重叠笔触取较强覆盖，不因排列交叠无限增亮。

玻璃/金属沿物体主轴排笔，可用方向参数或方向贴图覆盖。边框在注册时从三角面的长轴生成 UV 方向分区图，同一网格中的横框和竖框可使用不同方向。蓝鸟产生 32 张 256×256 方向图，保存在内存缓存；不在太阳、灯光、相机移动时重算。方向贴图 RGB 编码模型局部单位向量 `axis * 0.5 + 0.5`，支持显式传入经过美术调整的图。

Godot 的 `light()` 对每个原生光源计算：

```
weight = smoothstep(cos(渐显角), cos(充分受光角), max(dot(N, L), 0))
added_light = brush_rgb × brush_alpha × weight × ATTENUATION × LIGHT_COLOR / PI × strength
```

不读取视角向量；正常模式没有自发光或环境光贡献。`ATTENUATION` 包含原生距离衰减和阴影。覆盖调试模式会主动显示绿色笔触；它不用于判断无光场景。受光预览保留光源能量和遮挡。

附加 pass 使用加法混合、开启深度测试、不写深度，且只画朝外的正面，避免透明玻璃背面再叠一次亮笔。原玻璃本身的双面/透明设置不变。亮笔遵守原 alpha-scissor 纹理孔洞，不把玻璃整体 alpha 当作颜料密度。

## 接口和默认值

```gdscript
var highlights := PainterlyHighlights.new()
add_child(highlights)
highlights.register_surface(mesh, "glass", "window/main", original_material)
highlights.settings.strength = 0.8
highlights.refresh()
# 光源和相机变化不需要调用 refresh()。
highlights.repaint() # 改变种子并更新布局参数，不重建网格。
```

注册单位是一块有独立材质的 `MeshInstance3D`；蓝鸟现有适配器已经拆分材质表面。原生底材被实例化，玻璃粗糙度下限为 0.4、金属为 0.65。已注册的漫反射 `ShaderMaterial` 保留原实例，使原阴影/调色参数继续更新。关闭高光会摘除附加 pass，粗糙度软化仍保留。

| 设置 | 默认 |
| --- | --- |
| `enabled`、三组 `*_enabled` | true |
| `strength` / `density` / `size_scale` | 0.8 / 0.65 / 1.0 |
| `seed` / `direction_degrees` | 71 / 0° |
| 玻璃渐显 / 充分受光角 | 65° / 25° |
| 金属渐显 / 充分受光角 | 55° / 20° |
| 边框渐显 / 充分受光角 | 30° / 15° |
| 整页笔触尺度：玻璃 / 金属 / 边框 | 1.0×0.38 / 0.55×0.12 / 0.65×0.09 m |

角度均指表面法线与指向光源的夹角。新增高光不模拟镜面反射位置。

蓝鸟分类优先读取对象 `highlight_group` 元数据，再识别玻璃、PBR 金属及 `role=frame`；场景适配器显式把 `blackened_iron`、`weathered_sheet`、`castiron`、`brass` 归为金属，因此漆铁不依赖 `metallic > 0`。通用模块没有蓝鸟物体名称。

**B** 控制高光，F3「油画高光」可分组开关并调整强度、密度、尺寸、方向和种子；提供覆盖/受光预览和重新排笔。配置随现有 A/B、保存/恢复机制序列化。旧 `seam_*`、`silhouette_*` 等字段被忽略，不映射为新参数。`get_stats()` 报告分组数量、活跃 pass、方向图数量及注册次数。

## 验证与查看

```sh
Godot --path godot-client --scene res://demos/highlight_lab/lab.tscn -- --highlight-qa
Godot --path godot-client --scene res://demos/bluebird/street_corner.tscn -- --bluebird-highlight-qa
Godot --path godot-client --scene res://demos/bluebird/street_corner.tscn -- --bluebird-color-qa
```

必须使用实际 Forward+ 窗口。实验室展示玻璃叠层、金属板、合并横竖框条及透明裁切孔洞。检查实际像素对照、背光/无光、原生太阳及局部灯遮挡、框条角度、相机重投影、种子稳定性、原网格不变、数组留白及开关绘制调用。

- [实验室报告](../../../demos/highlight_lab/qa/validation.json) · [实际光向变化视频](../../../demos/highlight_lab/qa/light-motion.mp4)
- [蓝鸟报告](../../../demos/bluebird/qa/highlights/validation.json) · [昼夜视频](../../../demos/bluebird/qa/highlights/day-night-motion.mp4)
- [蓝鸟原调色回归](../../../demos/bluebird/qa/color/validation.json)

视频来自 Godot 输出的实际渲染帧。`demos/highlight_lab/encode_video.m` 使用 macOS AVFoundation 编码，无外部下载依赖。原始帧保存在各报告目录的 `motion/` 下，可重新编码。

两轮性能对照各采样 120 帧并预热，比较关闭/开启附加 pass。数值是同机帧间隔，包含调度和呈现成本，不宣称为独立 GPU 时间。完整场景注册 84 个表面（玻璃 8、金属 44、边框 32）；性能原始值随报告保存。

边界：方向自动烘制针对当前具有可用 UV 的静态框条。重叠 UV 表达不了互相冲突的方向，此类资产应提供专用方向图或拆开材质域。运行期间改变模型缩放、网格或 UV 需重新接入；平移、旋转和光源变化保持布局稳定。玻璃的复杂透明排序仍受原生透明管线约束，当前验收覆盖两层玻璃及实际蓝鸟窗口。
