# Bluebird · 整体油画覆色 v2

2026-09-07。基于 shell-v1 的既有建筑，仅调整外墙、屋顶和固定雨棚的基础色。保留 48 个建筑对象、40,838 个三角形、全部门窗开口和楼梯结构，无新增物品、招牌文字或人物。

## 查看交付

- [三维预览](index.html)：同机位切换原版／新版，支持中性／冷／暖光、剖视、白模和玻璃开关。
- [渲染对照与绘制层](compare.html)：滑动比较实际模型渲染，查看九张分层源图和 320 px 灰度图。
- [可编辑分层 Blender](bluebird_shell_layered.blend)：保留七种原贴图及九张新绘制层，全部打包。
- [烘焙 Blender](bluebird_shell_textured.blend)／[GLB](bluebird_shell_textured.glb)：标准材质、自包含贴图，无透明贴花或自定义着色器依赖。
- [机器验证](validation.json)、[资产清单](manifest.json)、[生成来源与提示词入口](provenance.json)。

审美依据为[叙事性油画写实手册](../../../../docs/art-direction/README.md)及 [Painted Reality 参考图](../design-v3/primary-reference.png)。历史艺术指导中的建筑构造约束仍有效。

## 本轮视觉处理

1. **大色面**：暖象牙正面、偏灰紫的右立面、较完整的灰蓝屋面。跨木板的补色削弱原先均匀重复的小色块。
2. **气候磨损**：护墙底部不齐的潮湿带、部分窗下雨水痕迹、雨棚排水方向的色痕。上层没有从地面上升的潮湿带。
3. **表现性笔触**：低密度的长干笔、断续擦色与刷毛边缘。由绘制蒙版控制，不使用屏幕噪声滤镜。

窗套、转角板、檐口、玻璃和室内沿用原材质，作为相对清楚、安静的边缘。覆色不新增损坏、线索或剧情符号。几何承担轮廓与接触；基础色承担补漆、笔触与轻度磨损；实际阴影与高光继续由光照产生。

## UV 与图集

| 通道 | 用途 |
|---|---|
| `UVMap` | 原始材料尺度，完整保留 |
| `PaintUV` | 一整面立面的连续绘制坐标，不逐块木板重复 |
| `BakeUV` | 交付图集，与 PaintUV 使用相同外墙分区；未覆色面保留原采样坐标 |

一楼图集 4096²，二楼图集 4096²，屋顶／雨棚图集 2048²。外墙正、侧、背、左面及入口倒角各有专属区域。屋顶保留真实 L 形分区。布局见 [uv-layout.json](source/uv-layout.json)。板材极薄的台阶边沿采样相邻色行，颜色连续；不靠重叠贴花增加几何。

九张绘制源图由内置 image_gen 生成，原始尺寸逐张记录在 manifest。4K／2K 是 Blender 组合烘焙尺寸，不代表生成源图拥有同等原生细节。未对源图伪造升采样精度。色层使用 sRGB；气候和干笔蒙版使用 Non-Color。

烘焙只启用 Diffuse Color，关闭 Direct／Indirect，扩边 16 px。绘制区域之外的黑色留白不会混成黑边：色层通过覆盖检测回退到原基础色。窗洞由真实几何裁切，源图不用承担洞口轮廓。

## 继续编辑

打开 `bluebird_shell_layered.blend`，在任一 `PAINT_…` 材质中进入共用节点组 **BLUEBIRD · PAINT CONTROLS**：

| 参数 | 当前值 | 作用 |
|---|---:|---|
| Repaint | 0.88 | 整体补漆替换强度，仍保留少量原材料笔触 |
| Weather | 0.32 | 气候色与覆盖蒙版的合成强度 |
| Brush | 0.38 | 干笔蒙版的合成强度 |

建议在 0–1 范围内调整。每种区域的颜色、蒙版和混合节点亦可单独编辑。保存分层文件后，从项目根目录执行：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python assets/grayhaven/bluebird/shell-v2/source/bake_export.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python assets/grayhaven/bluebird/shell-v2/source/check_shell.py
```

`bake_export.py` 使用已保存的分层文件，重新导出烘焙 Blender、GLB 及预览。它不重新生成绘制源图。`finish_paint.py` 则从 UV 准备文件重新建立初始节点，适合完整重建；不要用它覆盖尚未记录的材质编辑。

## 验证与边界

26 项自动检查通过，包括原有建筑开口与 16 级楼梯检查、48 个对象逐顶点／逐面几何签名一致、三张图集尺寸、自包含 GLB、标准材质、九张绘制层打包和三个可编辑强度。

已检查同机位实际渲染、冷暖主光渲染、一二楼剖视和 320 px 灰度图。整体体块、屋面与入口仍可辨认。Three.js 预览使用标准 GLB 材质，版本切换不会重置相机或光色。浏览器和 Cycles 的阴影算法不同，跨渲染器不要求逐像素相同。

这是建筑覆色阶段的交付。参考画中的街角环境、湿路面、生活物件、招牌和室内灯光尚不属于当前空场景；不能把目标色稿当作已完成的游戏场景。未接入世界状态、后端 API 或运行时资产清单；运行时性能和移动设备显存仍需后续实测。
