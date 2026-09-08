# 圆润起笔与接地防漏

2026-09-08，Godot 4.7.2 / Forward+ / Metal / Apple M5 实测。

普通压力路径此前将首尾笔尖压短并裁切到 UV 0–1，落笔出现平头。矩形排笔虽然允许完整笔尖，但两种路径都沿建筑下方的整段截面盖印，宽笔尖会从迎光侧角部露出；另外，独立 `root_cover` 直接补入满覆盖暗色，绕过了笔刷形状与颜料量。

本次修改：

- 两种压力路径统一使用完整椭圆笔尖，保留颗粒、压力压扁和收笔；路径首尾不再硬裁切。
- 贴地笔触从可见背光侧根部开始盖印，不再在建筑下方整段排印。悬空投影仍从投影底部起笔。
- 取消独立根部填充。接地仅增加已有笔触的光学覆盖，压低局部干刷提亮；零压力、零颜料量均为零覆盖。
- 近墙范围抑制向迎光侧及侧边越界的笔尖，离墙后平滑解除限制，保留自由笔刷外缘。使用现有 AABB 代理和光向，不新增捕获、网格或 CPU 逐帧排笔。复杂建筑的精确接触轮廓仍取决于代理质量。

## 复验

```sh
Godot --path godot-client --disable-vsync --scene res://demos/bluebird/street_corner.tscn -- --bluebird-root-qa
Godot --path godot-client --disable-vsync --scene res://demos/painterly_lab/lab.tscn -- --pressure-qa
```

新增 [GPU 根部检查](../../demos/bluebird/qa/shadow-root/after/validation.json) **26 项通过**：正向／斜向 × 普通／矩形路径，迎光侧防漏、背光墙根连续、静态可复现、零压力／零颜料量不残留独立填充、两种悬空投影，以及完整圆头的实际像素形状。测试包含生产 Shader，不用 CPU 公式代替 GPU 结果。修复前记录可在 `before/validation.json` 查看，其中能复现平头、角部泄漏及零颜料残留。

原有 [压力回归](../../demos/painterly_lab/qa/pressure/validation.json) **28 项通过**。1,116 个接地点覆盖地面／高台、三种光向、两个种子；其中最低覆盖约 0.496，允许笔刷边缘部分覆盖。原测试的“所有点覆盖 > 0.995”已替换为接地连续检查，以免重新引入满覆盖矩形。其余压力形变、曲线、颗粒尺度、盖印密度、相机稳定和悬空检查继续保留。

## 同镜头截图

| 内容 | 修复前 | 修复后 |
| --- | --- | --- |
| 蓝鸟普通压力根部 | [前](../../demos/bluebird/qa/shadow-root/before/pressure-root.png) | [后](../../demos/bluebird/qa/shadow-root/after/pressure-root.png) |
| 蓝鸟矩形排笔根部 | [前](../../demos/bluebird/qa/shadow-root/before/rectangle-root.png) | [后](../../demos/bluebird/qa/shadow-root/after/rectangle-root.png) |
| 斜向矩形投影遮罩 | [前](../../demos/bluebird/qa/shadow-root/before/diagonal-rectangle.png) | [后](../../demos/bluebird/qa/shadow-root/after/diagonal-rectangle.png) |
| 独立笔触起笔 | [前](../../demos/bluebird/qa/shadow-root/before/rounded-start.png) | [后](../../demos/bluebird/qa/shadow-root/after/rounded-start.png) |

截图均来自真实运行时视口。整景为 1280×720，覆盖检查为 800×480。此次为起笔与根部修复，不将历史性能报告当作新性能测量。
