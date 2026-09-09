# 窗内残留阴影：街道与室内地板重叠

2026-09-08。范围是蓝鸟街景中透过玻璃看到的三维室内。

## 实际根因

**街道没有挖去建筑占地，且与室内楼板完全共面。**

- `bluebird-street-ground.obj` 的人行道顶面为 `Y=0.18`，横跨整栋建筑。
- `L0_FLOOR` 的上表面在建筑局部 `Y=0`；建筑节点平移到 `Y=0.18`，所以楼板世界高度也是 `0.18`。
- 两层表面争抢深度，室外街道覆盖／交错出现在室内木地板上。街道本身正常接收建筑、广告牌、灯具等油画投影，因此这些投影也一起出现在窗内。

上一轮按材质关闭内墙／楼板的 `painterly_shadows` 没有解决这个几何问题：实际显示的仍有室外街道，而它仍然开启笔刷。旧的 244 项检查只覆盖材质策略和受控平面，没有确认完整场景中可见的究竟是哪张网格，不能作为这个问题已解决的证据。

## 修复

`street_footprint.gd` 在场景初始化、原生渲染和油画材质转换之前，从街道三角形中扣除建筑底层楼板的真实凸轮廓，包括斜角入口。轮廓由导入的 `L0_FLOOR` 网格和节点变换推导，未采用粗略的笔刷 AABB。

每条轮廓边将原街道三角形分成内外两部分，保留外侧多边形并三角化；交点插值保留高度、法线和 UV。当前扣除面积为 **119.15495 平方米**，符合 `12 × 10 - 1.3 × 1.3 / 2 = 119.155`。街道外围尺寸、人行道高度、贴图和建筑位置保留。原始 OBJ 与建筑 GLB 不修改；原生和油画路径使用同一份场景实例网格。

室内接收面仍按上一轮分类使用真实深度遮挡，避免实心艺术代理在室内重新绘制笔刷。这是补充的接收策略，不是此次可见穿入问题的根因修复。真实遮挡继续控制室内直射光。

## 实际画面验证

Godot 4.7.2 / Forward+ / Metal / Apple M5：

- [旧街道复现](../../demos/bluebird/qa/street-footprint/before/validation.json)：保留上一轮材质分流，仅恢复旧街道网格。室内下方检查区域仍有 **219,038 个可见街道像素**，面积和可见性两项失败。
- [修复后](../../demos/bluebird/qa/street-footprint/after/validation.json)：同机位检查区域可见街道像素为 **0**，6 项检查全部通过，涵盖真实占地、尺寸、高度、UV、法线和实际可见性。
- 可见性检查直接对完整场景的街道染白、其余网格染黑，保留实际位置与深度，统计室内地板区域；并非读取接收开关或在替代平面上测试。
- 单独保留广告牌艺术代理的室内截图，保留真实几何遮挡，可检查广告牌投影是否随着错误街道进入室内。
- 原有街道场景集成检查通过；外墙检查另见 [报告](../../demos/bluebird/qa/wall-shadow/validation.json)。未进行 Compatibility 和性能验收。

| 机位 | 修复前 | 修复后 |
| --- | --- | --- |
| 模型内部 | [街道盖在木地板上](../../demos/bluebird/qa/street-footprint/before/01-room.png) | [连续的木地板](../../demos/bluebird/qa/street-footprint/after/01-room.png) |
| 仅广告牌艺术代理 | [前](../../demos/bluebird/qa/street-footprint/before/02-room-sign-proxies.png) | [后](../../demos/bluebird/qa/street-footprint/after/02-room-sign-proxies.png) |
| 街道实际可见区域 | [前](../../demos/bluebird/qa/street-footprint/before/03-visible-street-mask.png) | [后](../../demos/bluebird/qa/street-footprint/after/03-visible-street-mask.png) |
| 窗外街景 | [前](../../demos/bluebird/qa/street-footprint/before/04-street-windows.png) | [后](../../demos/bluebird/qa/street-footprint/after/04-street-windows.png) |

```sh
Godot --path godot-client --script res://demos/bluebird/tools/street_footprint_qa.gd
Godot --path godot-client --script res://demos/bluebird/tools/street_footprint_qa.gd -- --baseline
Godot --path godot-client --script res://demos/bluebird/tools/street_ground_qa.gd
Godot --path godot-client --scene res://demos/bluebird/street_corner.tscn -- --bluebird-wall-shadow-qa
```

`--baseline` 专门恢复有问题的旧街道网格，预期失败。当前蓝鸟楼板轮廓是凸多边形；以后换成凹形建筑时需要扩展轮廓提取与裁切，不能直接用凸包代替凹形占地。
