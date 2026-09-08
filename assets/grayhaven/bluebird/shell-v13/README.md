# 蓝鸟 · v13 独立交付

当前完整资产已收拢在本目录。保留屋檐压薄、雨槽齐平、屋顶到墙面的单向混色以及原有绘画。旧 v1–v12 的模型和重复预览已清理；下列编辑、导出和重新烘焙流程均不读取旧版本。

## 编辑入口

- **[可编辑分层主源](bluebird_painterly_layered.blend)**：建筑几何、完整部位底图和独立表现层。后续修改从这里开始；`BakeV11` 已包含当前交付的有效烘焙 UV。
- [基础底图版](bluebird_base.blend)：关闭表现层的可编辑对照，由主源生成。
- [中性白模](bluebird_white.blend)：独立查看体量和接缝，约 1.3 MB。
- [完整油画 GLB](bluebird_painterly.glb) / [基础 GLB](bluebird_base_baked.glb)：当前运行交付；对应烘焙 Blender 文件保留，支持不改像素的快速再导出。

36 张实际使用的图像收在 `textures/library/`，按内容哈希去重。所有 Blender 图像路径均指向本目录相对路径，同时嵌入文件，包含内嵌图像记录本身的路径。九张完整部位原图可直接从 [textures](textures/) 按名称查找，提示词在 [painting-prompts](source/painting-prompts/)，覆盖尺度见 [painting-domains.json](source/painting-domains.json)。完整名称和原始来源映射见 [texture-manifest.json](source/texture-manifest.json)。

`control-maps/` 保留 33 张原重要度、流向和间接光控制图，包含与当前几何一致的 14 个阴影体积。Godot 的模型和控制目录链接均指向本目录。

## 当前模型效果

下层屋顶厚度从 20 cm 减至 11 cm，上层从 18 cm 减至 12 cm；顶面分别为作者 Z=3.31 m、5.94 m，与雨槽卷边最高点相差约 1.3 mm。墙顶接合面和 10 cm 出檐轮廓保留。通风口、烟道、主招牌后斜撑及屋面支脚已随屋面落低。

| 位置 | 压薄前 | 压薄后 |
| --- | --- | --- |
| 上层屋檐与雨槽 | [之前](previews/before-white-upper-joint.png) | [之后](previews/after-white-upper-joint.png) |
| 下层后侧转角 | [之前](previews/before-white-lower-joint.png) | [之后](previews/after-white-lower-joint.png) |
| 整体 | [之前](previews/before-white-corner.png) | [之后](previews/after-white-corner.png) |

![当前带材质效果](previews/godot-day.png)

这三张“之前”是已经保存的历史对照，不需要旧模型才能查看。`render_fit.py` 只重建当前白模及当前视图。

## 独立重建

以下命令在仓库根目录运行，替换本机 Blender/Godot 可执行文件路径。

保持当前绘画像素、从烘焙 Blender 文件重新导出：

```sh
Blender --background --python assets/grayhaven/bluebird/shell-v13/source/rebuild_delivery.py
```

编辑并保存分层主源后，重新生成基础版和完整油画版：

```sh
Blender --background --python assets/grayhaven/bluebird/shell-v13/source/rebuild_delivery.py -- --rebake
python3 assets/grayhaven/bluebird/shell-v13/source/update_control_geometry.py
Blender --background --python assets/grayhaven/bluebird/shell-v13/source/render_fit.py
Godot --headless --path godot-client --editor --import --quit
Godot --path godot-client --scene res://demos/bluebird/street_corner.tscn -- --bluebird-color-qa
```

重新烘焙从分层源计算绘画颜色；日照和阴影不烘入贴图。增加或改变拓扑时须维护 `BakeV11`；修改外部原图后应在 Blender 重载图像并保存/打包主源。可加 `--output-dir /absolute/temp/path` 做试烘焙，避免覆盖当前交付；`--base-only` 只重建基础版。

`update_control_geometry.py` 从当前 GLB 更新已有艺术阴影体积的几何边界，不会重复减去高度，也不复制历史目录。Demo 接缝容差为 1 cm，避免雨槽近邻细分面被重复识别，屋顶单向混色继续开启。

## 验证与历史

[清理完成记录](source/cleanup-state.json) · [无旧目录时的完整烘焙验证](source/standalone-rebuild-audit.json)。旧 12 个目录及试烘焙临时输出均已实际删除。

- [独立 Blender 源验证](source/standalone-source-audit.json)：五份文件全部图像本地化、内嵌路径有效，无外部链接库。
- [GLB 像素/结构验证](source/export-audit.json)：两份交付各 75 个网格、167 个材质表面、10 张嵌入图像，绘画字节与清理前完全一致。`verify_delivery.py` 使用本目录保存的基准，无需旧 GLB；有意重绘后应重新审阅并更新基准。
- [清理后的 GPU 检查](source/gpu-validation.json)与[屋顶混色检查](source/roof-seam-audit.json)。
- [几何改形记录](source/thinning-audit.json)和[依赖迁移前记录](source/dependency-before.json)只保留来源信息，记录中的旧路径不参与加载。
- [历史构建脚本压缩记录](source/construction-history.zip)：保留旧建模、绘画和 UV 放置决策，供追溯；不是当前重建入口。旧模型、大量重复图集和旧预览未保留在其中。
- [用户笔触参考](references/user-brush-reference.jpg)：仅供美术研究。

`consolidate_assets.py` 是本次收拢脚本，现仅操作当前文件，可再次统一贴图路径；不会访问旧版本。
