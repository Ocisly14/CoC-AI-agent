# 灯具投影接入建筑墙面

2026-09-08。修复灯具的太阳／月光阴影落到建筑墙面后，回退成原始物体剪影的问题。

此前蓝鸟适配器将立墙的 `painterly_shadows` 关闭，表面 Shader 又将压力／贴图投影限定为世界水平面。现在已接入 NPR 的建筑外表面允许笔刷阴影，接收面法线决定投影坐标；控制图的 `map_plane` 继续只负责重要度、流向和间接光，不再阻止垂直面接收投影。内墙、室内地板及隔墙走真实深度遮挡，详见[室内接收面修复](INTERIOR_SHADOWS.md)。

地面保留原坐标与缓存排笔。墙面及斜面在 Shader 中将光向和遮挡体积转换到接收面坐标，复用相同的压力、圆头、颗粒和收笔过程。矩形排笔按该平面的米制投影宽度重新计算笔带数量，使用固定种子及重叠范围，并支持反转绘画顺序；不复用只适用于地面的窄灯杆笔带数量。没有新增网格、深度捕获或 CPU 每帧排笔。

**根部裁切修复：** 与墙面相交的粗略体积可能包含建筑自身，原先直接套用地面接地过程会在墙上留下假起笔。这类投影现在乘以已有真实几何遮挡 `M0`，裁掉越过有效遮挡边界的覆盖，并关闭墙面的接地加深。裁切不会填充物理剪影；零压力仍是零覆盖。与墙面分离的灯具继续完整使用圆头笔刷，不受该限制。这里复用现有 GPU 深度采样结果，不增加捕获或回读。[修复前](../../demos/bluebird/qa/wall-root-clipping/before/01-painted-wall.png)／[修复后](../../demos/bluebird/qa/wall-root-clipping/after/01-painted-wall.png)。

投影仍基于现有 AABB 艺术代理。轴向墙面的坐标变换是精确的；任意斜面使用变换后的包围盒，因此是保守的美术近似。原生透明玻璃、保留的 PBR 材质及局部点光源仍走原生阴影接口，本次修复的是 NPR 建筑接收面的太阳／月光笔刷投影。

## 实际 GPU 验证

Godot 4.7.2 / Forward+ / Metal / Apple M5：

- [墙面检查](../../demos/bluebird/qa/wall-shadow/validation.json)：室内分流后重跑 143 项通过，其中 96 项逐外表面检查接入状态，47 项检查场景覆盖与行为。8 项覆盖两种排笔模式的根部裁切：无真实遮挡时不能冒出根部、越过边界的根部像素为零、边界内保留笔触、裁切不能填成物理剪影。其余包括实际灯具物理／油画遮罩差异、投影开关，以及正墙、侧墙、25° 斜面的投影、相机稳定和光向变化。早先 171 项检查错误地要求部分内表面也开启笔刷；这些室内接收面现由独立回归检查。
- [地面根部回归](../../demos/bluebird/qa/shadow-root/after/validation.json)：26 项通过。
- [蓝鸟材质与调色回归](../../demos/bluebird/qa/color/validation.json)：102 项通过。

```sh
Godot --path godot-client --disable-vsync --scene res://demos/bluebird/street_corner.tscn -- --bluebird-wall-shadow-qa
Godot --path godot-client --disable-vsync --scene res://demos/bluebird/street_corner.tscn -- --bluebird-root-qa
Godot --path godot-client --disable-vsync --scene res://demos/bluebird/street_corner.tscn -- --bluebird-color-qa
```

## 同镜头对照

- [修复后的墙面](../../demos/bluebird/qa/wall-shadow/01-painted-wall.png)
- [重现原先的墙面物理投影](../../demos/bluebird/qa/wall-shadow/02-previous-physical-wall.png)
- [仅灯具：物理剪影](../../demos/bluebird/qa/wall-shadow/03-lamp-physical-mask.png)
- [仅灯具：油画遮罩](../../demos/bluebird/qa/wall-shadow/04-lamp-painted-mask.png)
- [关闭灯具投影](../../demos/bluebird/qa/wall-shadow/05-lamps-disabled-mask.png)

整景截图为 1280×720，独立接收面检查为 512×512。仅灯具的遮罩对照在测试夹具内移除了建筑投影体积，以隔离灯具贡献；前两张成片仍使用完整场景。
