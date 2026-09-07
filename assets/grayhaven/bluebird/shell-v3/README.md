# Bluebird · 保留基础细节的局部油画叠加

2026-09-07。修正 v2 的整面覆色：以 shell-v1 原始材质为底，只有选定区域混入额外油漆。遮罩外三个新增层的权重严格为零；没有通过全局降透明度来代替选区。

- [三版本三维切换](index.html)：基础贴图、上版整面覆色、本版局部叠加，共用相机和光照。
- [原版／局部版同机位渲染对照](compare.html)。
- [可编辑分层 Blender](bluebird_shell_layered.blend)、[烘焙 Blender](bluebird_shell_textured.blend)、[GLB](bluebird_shell_textured.glb)。
- [26 项资产验证](validation.json)、[选区覆盖率检查](selective-coverage.json)。

## 处理方式

保留原有木纹、细小补漆、板缝和掉漆色块。在前墙上沿、局部护墙底部、二楼少数墙面及屋顶上选择有限的补漆区。入口倒角不选中，窗套、玻璃和室内材质保持原样。

每块选区有独立中心与半径，外沿渐隐并叠加已有的刷毛蒙版。`Repaint` 控制选区内部的补漆浓度，`Weather` 和 `Brush` 也受局部范围限制。大笔触之间保留原始材料，局部厚漆允许遮住一部分细纹理。

表面积加权采样：一楼约 77.73%、二楼约 79.96%、屋顶／雨棚约 76.85% 在全部选区之外。这是选区外沿的保守估计，选区内还会被笔触蒙版进一步削弱，不等于这些选区全部被不透明覆盖。

## 编辑与导出

分层文件保留七张原基础贴图、原 `UVMap` 与九张复用的 v2 绘制源图。新选区通过材质节点构建，本轮没有重新生成图像。源图原始来源及生成提示词见 [v2 provenance](../shell-v2/provenance.json)。

在 `BLUEBIRD · PAINT CONTROLS` 中调浓度：Repaint **0.66**、Weather **0.18**、Brush **0.24**。各材质的 `LOCAL PLACEMENT` 框内可调整局部范围；可复建的中心、半径写在 [local-regions.json](source/local-regions.json) 和 [local_paint.py](source/local_paint.py) 中。

保存分层文件后，从项目根目录执行：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python assets/grayhaven/bluebird/shell-v3/source/bake_export.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python assets/grayhaven/bluebird/shell-v3/source/check_local_coverage.py --python assets/grayhaven/bluebird/shell-v3/source/check_shell.py
```

`bake_export.py` 使用保存后的材质编辑。`local_paint.py` 则从 v2 分层源文件重新建立本版选区，会重置未写入制作脚本的节点编辑。

GLB 继续使用标准材质，输出一楼 4K、二楼 4K、屋顶 2K 图集。分层源材质保留原贴图采样；烘焙 GLB 存在图集分辨率与过滤带来的采样差异，不宣称与源材质逐像素无损。建筑几何、室内及物品范围均未改变，仍为 48 个建筑对象、40,838 个三角形、零新增物品模型。
