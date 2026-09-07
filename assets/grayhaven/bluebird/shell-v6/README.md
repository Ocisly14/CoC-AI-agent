# Bluebird · 斜向笔触与跨构件连续绘画

本版按用户2026-09-07修正制作：把新生成的不规则油画素材应用到餐厅外层，替换v5的宽大近水平色条；笔触经过窗框、窗台和相交外露水管时连续覆盖构件。

- [可编辑分层 Blender](bluebird_painterly_layered.blend)
- [烘焙 Blender](bluebird_painterly.blend) / [自包含 GLB](bluebird_painterly.glb)
- [外观](previews/01-exterior.png)
- [临街窗台连续绘画近景](previews/11-sill-continuity.png)
- [二楼窗框近景](previews/10-paint-detail.png)
- [绘画放置参数](source/placements.json) / [检查记录](validation.json)

## 实际修改

从v4构造细节模型及原基础贴图出发，重新组织32处局部色块，使用 `paint-effects-v1` 中的偏心爆裂、断续放射、撕裂刮擦和骨白破边素材。各图章带17–31度的旋转，结合不同宽高、偏心形状和内部空缺，避免重新形成整齐横条。没有在v5旧大横条上继续堆叠。

相邻墙面和构件使用相同的立面坐标、中心、尺寸、旋转和颜色。墙面与窗框不再按各自UV独立放置同一笔触，因此笔触经过窗台／窗框时会衔接；局部管道也接收同一投射。各立面有深度限制，外墙只修改原外部材质槽，室内墙面与玻璃保留原材质。入口、招牌文字和构造仍可辨认。

窗框材料保持其原本的粗糙度与结构响应。骨白色块只在局部出现，不给整栋建筑统一描白框。笔触空隙和边缘继续显示基础纹理与磨损。

## 源文件与导出

分层源文件保留原始贴图、生成图集及可编辑节点。立面投射在源文件中使用世界米制坐标；整体重定位源模型时应同步移动投射参数或先烘焙。烘焙后的材质随模型UV附着，可自由移动模型。

原有几何、变换与UV通道保留，仅为窗框等构件新增 `PaintBakeV6` 作为不重叠烘焙UV。输出一楼、二楼、构件三张4K基色图。只烘焙材质颜色，不包含预览照明。可编辑节点不直接作为glTF着色器导出，GLB使用烘焙后的基色。

渲染沿用既有灯光、曝光和镜头，新增临街窗台近景。图中为实际Blender模型渲染；本轮未托管，也未声称完成浏览器运行性能验证。

## 重建

在项目已有Blender环境运行 `source/build_paint.py`，随后运行 `source/render_paint.py` 和 `source/validate_paint.py`。脚本依赖相邻v4模型及 `paint-effects-v1/irregular-pigment-library.blend`。重建不会覆盖旧版本。
