# 压力盖印阴影 · v0.6

2026-09-08。蓝鸟和实验室默认使用压力盖印。当前是 **程序笔尖 Shape＋用户原始 Aui Vangogh Grain＋阴影专用力度设置**。真实刷毛物理、跨笔触湿混色和 Procreate 私有引擎不在本次实现内。

## 行笔与形变

Procreate 官方描述沿路径反复盖下 Shape＋Grain，压力可改变大小、扁圆程度、透明度和出漆量；倾角和收笔设置继续影响表现。本实现采用这些行为概念，数值映射和公式由本项目定义，并不声称复刻私有实现。[官方 Brush Studio Settings](https://help.procreate.com/procreate/handbook/5.4/brushes/brush-studio-settings)

- 力度曲线：起点 0.65，12% 行程升到 0.9，45% 为 0.85，75% 为 0.82，最后降到 0；中段有幅度 0.055 的缓慢变化，由物体／笔触 ID 固定。
- **贴地物体以背光侧接地轮廓为可见力度起点**，避免大建筑把整个压开过程遮在自身下面。其下面仍有完整笔触支持区；悬空物体按投影起点行笔，不产生虚假的接地补色。
- 基础笔宽决定排笔中心。每次盖印的宽度由力度响应从 0.45 倍变到 1.2 倍；压力同时缩短笔尖沿行笔方向的接触长度。默认倾角由 50°过渡到收笔的 80°，辅助改变接触形状。
- Shape 为圆角扁笔尖（四次超椭圆），原始颗粒让边缘与内部出现不规则露底。包内没有附带内置 Shape 原图，因此程序轮廓有明确标记，没有把 QuickLook 预览图当作笔尖。
- Grain 采用未形变的行笔平面坐标；笔尖压宽时纹理尺度保持不变。起笔含漆量独立于力度，沿剩余可见行程递减；默认含漆量 1.0、消耗 0.38。没有按时间逐帧积累旧颜料，静止、缩放或改光向不会污染下一帧。
- 每片元、每笔最多检查 16 个邻近印记；默认间距为基础笔宽的 10%，支持 8%–20%。沉积采用 `alpha = 1 - exp(-mass)`，mass 包含间距权重与笔尖纵向支持归一化，使加密盖印不等于重复加深。
- 最多搜索 5 条相邻笔触通道，横向裁剪扩大至基础笔宽的 ±0.71；公开宽度上限约束在 1.35 倍，使最大形变与搜索范围一致。纵向笔尖支持限制在笔触总长内，保持原 80%–120% 长度范围。

输出继续进入覆盖、积色和干刷通道，只在原有直接日照合成里使用一次阴影可见度。接地保护始终独立存在，因此将力度或含漆量调到 0 时，笔触消失但实际接触暗部仍受保护。

## 可编辑资源与预览

[`default_pressure.tres`](default_pressure.tres) 使用 [`PainterlyPressureSettings`](pressure_settings.gd)。每个 renderer 深复制默认资源，编辑一个场景的 Curve 不会改变另一个场景。

| 字段 | 默认值／用途 |
| --- | --- |
| `pressure_curve` | 上述力度曲线，输入为可见行程 0–1 |
| `tilt_curve` | 50°→80° |
| `width_response` / `width_range` | 压力到宽度响应，默认线性／0.45–1.2 |
| `pressure_scale` / `pressure_variation` | 整体力度 1.0／中段变化 0.055 |
| `squash_strength` | 沿行笔方向压扁，0.55 |
| `paint_charge` / `paint_consumption` | 初始含漆量 1.0／每个可见行程消耗 0.38 |
| `stamp_spacing` | 基础笔宽单位，0.1，限制 0.08–0.2 |
| `constant_pressure` | -1 使用曲线；0–1 用于恒定力度测试 |

`renderer.pressure_stamps_enabled` 切换压力盖印与上一版颗粒铺色；`procreate_shadows_enabled` 继续控制 Aui 与旧整笔贴图。修改资源后调用 `renderer.refresh_settings()` 同步参数和 Curve LUT，无需重新捕获太阳深度。资源中的原配方与阴影参数分离；导入器现在还保留原压力曲线、倾角、收笔和含漆量元数据，其值不被阴影设置覆盖。

实验室右侧提供算法对比、力度／压扁／含漆量控制，以及用同一 Shader 实现的力度曲线、轻／中／重笔尖轮廓和单笔效果。

![运行时控制与单笔预览](../../demos/painterly_lab/qa/pressure/01-controls.png)

## 验证

执行时需真实 GPU 窗口，不能用 headless 截图验收：

```sh
Godot --path godot-client --scene res://demos/painterly_lab/lab.tscn -- --pressure-qa
Godot --path godot-client --scene res://demos/bluebird/street_corner.tscn -- --bluebird-pressure-qa
Godot --path godot-client --rendering-driver vulkan --scene res://demos/bluebird/street_corner.tscn -- --bluebird-pressure-qa --timing-vulkan
```

检查窗口固定为 1280×720 并关闭交互，避免截图中途被切换通道或缩放。实验室 GPU 验证报告：[validation.json](../../demos/painterly_lab/qa/pressure/validation.json)。

实际单笔测量（纵向为行笔方向，横向为笔宽）：

| 力度 | 纵向像素 | 横向像素 |
| --- | ---: | ---: |
| 0.2 | 224 | 150 |
| 0.5 | 202 | 208 |
| 0.9 | 172 | 282 |

28 项压力检查通过，包括 1,116 个根部点全部覆盖、846 个可见地面点物理 bias 隔离误差为 0、不同接收高度／光向／种子、悬空物体、相机缩放、最大笔宽、资源隔离及曲线更新。间距从 10% 改为 8% 时平均覆盖差约 0.0054；延长笔触后的同世界位置纹理平均差约 0.0033。大建筑可见起点回归、零力度和零含漆量也分别检查。旧整笔贴图路径 93 项、上一版 Aui 路径 18 项 GPU 回归全部通过。

## 蓝鸟实际对比与性能

以下相机、曝光和光照相同，建筑基材保持原状：

![上一版近景](../../demos/bluebird/qa/pressure/03-previous-closeup.png)

![压力盖印近景](../../demos/bluebird/qa/pressure/04-pressure-closeup.png)

性能分别记录主视口 GPU、渲染 CPU 和实际帧间隔，前后各 120 帧并反序重复一轮。计时只涵盖已稳定场景；不代表整个游戏、捕获更新尖峰或其他硬件预算。

- [Metal 实测报告](../../demos/bluebird/qa/pressure/validation.json)：原生默认后端的实际帧时间，GPU 计时返回零，保存为 `null`，不视为零开销。
- [Vulkan / MoltenVK 实测报告](../../demos/bluebird/qa/pressure-vulkan/validation.json)：同设备、同分辨率下独立取得 GPU 时间，不冒充 Metal GPU 数据。

同设备 Apple M5、1280×720，两轮测量的中位值范围：

| 后端／指标 | 上一版颗粒铺色 | 压力盖印 |
| --- | ---: | ---: |
| Metal 帧间隔 ms | 16.669–16.697 | 16.646–16.670 |
| Vulkan GPU ms | 6.330–6.990 | 6.837–7.362 |
| Vulkan 帧间隔 ms | 16.669–16.675 | 16.668–16.675 |

帧间隔受 VSync 限制，约为 16.7 ms；不能据此认为压力盖印没有额外 GPU 开销。GPU 测量含整幅蓝鸟场景，后台负载／时钟波动及两轮样本差异仍存在。Vulkan 运行日志曾出现 MoltenVK 管线缓存写入告警，运行与截图检查无失败。

Godot 的计时接口将 GPU 工作时间与受 VSync 影响的帧率区分开。[RenderingServer 文档](https://docs.godotengine.org/en/stable/classes/class_renderingserver.html#class-renderingserver-method-viewport-get-measured-render-time-gpu)；Metal 返回零的问题另有[上游记录](https://github.com/godotengine/godot/issues/102968)。
