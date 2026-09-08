# Bluebird · 带损伤的写实油画底材 v8

按[巡回画派油画风格通用指导](../../../../docs/art-direction/skills/painterly-environment/references/peredvizhniki-art-direction.md)重做并应用七种基础材质。底图自身包含剥漆露木、接缝积垢、磨痕、锈蚀、屋面老化与灰泥脱皮，以克制写实油画方式描绘；排除零碎装饰性笔刷色块。原 v6 外墙及 v7 屋顶的大色块重新叠加，位置、角度、尺寸与强度沿用已确定方案。

## 查看与使用

- [完成模型 GLB](bluebird_painterly.glb) / [烘焙 Blender](bluebird_painterly.blend)
- [完整分层 Blender](bluebird_painterly_layered.blend)：新底材、外墙笔触与屋面笔触均可编辑。
- [仅基础材质 Blender](bluebird_base.blend)：用于关闭表现性叠加后的材质检查。
- [最终外观](previews/baked-exterior.png) / [基础版同机位](previews/base-exterior.png) / [原 v7](../shell-v7/previews/01-exterior.png)
- [窗台近景](previews/baked-sill.png) / [基础版近景](previews/base-sill.png)
- [屋面](previews/layered-roof.png) / [表现层覆盖遮罩](previews/mask-exterior.png)
- [一楼剖视](previews/baked-ground.png) / [二楼剖视](previews/baked-upper.png)
- [原生底图与材质清单](../textures-weathered-v3/README.md) / [模型检查](validation.json)

## 材质与尺度

底图通过内置 image_gen 逐种编辑生成，在保留材料布局的同时补回真实损伤，原始 PNG 保留。板缝数量按实际图像校准，不以提示词中的数量冒充实测：横向挂板采样连续九行，映射高度 1.8 米；竖板采样六列，映射宽度 1.2 米；地板采样八列，映射宽度 1.6 米。对应单元均约 0.20 米。屋面取相邻接缝之间的一米卷材宽度，窗套用无板缝的连续细木纹。

这是模型作者尺度下的制作标定，不是历史建筑实测。采样窗口在材质节点中设置，源 PNG 未裁切或改绘。`MaterialUVV8` 按实际表面尺寸和方向映射，底材频率与表现性笔刷尺寸独立。原有构造凹凸保留；未将新颜色图自动转为法线或位移。

从 v4 的构造模型重建底材，避免 v3–v7 旧烘焙色图内的大笔刷重新进入基础层。随后复用 v6 的立面投射和 v7 的屋面投射；不再需要回到两个不同版本才能分别编辑外墙与屋顶。玻璃、文字与基本建筑结构保留。

## 交付与验证

83 个建筑对象、56,034 个导出三角形，几何与变换保留。v4 原有 UV 通道不变，新增米制材质 UV 与 `BakeV8` 交付 UV。新增 UV 的职责与旧版烘焙 UV 不同，v6/v7 专用烘焙通道由本版统一交付通道替代。

烘焙临时网格合并重合顶点以提高有效纹素密度，原始几何不动；完整回填重合面及重复顶点的 UV，避免错贴。

六张 4K 合成基色图集只烘焙材质颜色，不包含预览灯光；GLB 内嵌图像。分层模型仍保留独立源图、笔刷和放置参数。源模型中的表现层继续使用既有世界坐标投射，整体移动时需同步投射参数；导出的 GLB 随 UV 附着，可正常移动。

预览是实际 Cycles 渲染，基础版、分层版与烘焙版沿用相同镜头、灯光和曝光。检查覆盖材料尺度、源图替换、双层可编辑、跨窗台及泛水连续性、几何保留、UV 依赖和自包含 GLB。没有部署或替换游戏运行时资产，浏览器性能未实测。

## 重建

在项目 Blender 环境按顺序运行 `source/build_materials.py`、`source/validate_materials.py`、`source/render_materials.py`。构建脚本依赖相邻 v4 模型及两组既有笔刷库；生成底图已经随包保存，重建无需再次调用生成服务。

`build_materials.py -- --layered-only` 仅保存基础及分层模型；`bake_delivery.py` 可从已保存分层模型单独重建烘焙交付。渲染参数示例为 `-- base exterior sill` 或 `-- baked exterior sill ground upper`。
