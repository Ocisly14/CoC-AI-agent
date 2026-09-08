# Aui Vangogh 笔刷阴影适配

**后续更新：** 默认已升级为[压力盖印 v0.6](PRESSURE_STAMPS.md)。下文的 8 次颗粒平均方案保留为“上一版”对比；素材来源与缺失笔尖说明仍适用。

2026-09-08。实验室与蓝鸟预览默认使用用户提供的 `assets/grayhaven/Aui_Vangogh_.brushset` 的原始油画颗粒连续铺色。整笔旧 PNG 保留作对比，开启新模式时不参与阴影计算。原有投影代理、光照合成、笔宽、20% 重叠与 80%–120% 长度范围继续使用。

## 素材与实现边界

从包内读取 7 个配方（含一支双笔刷的 Sub01）、3 张去重后的原始 Grain PNG；提取过程仅复制原始字节，清单保存 SHA-256。运行时选择 Vangogh 05 为主要铺色（65%），02 为干刷（20%），06 为粗颗粒（15%）。这些权重属于本项目适配参数。

包内所有笔尖都引用 Procreate 自带的 `Brush-Artery-Charcoal-Block.jpg`、`Brush-Preset-Ink-Dry.png` 或 `Oil-Dab.png`，未附 Shape 原图。03/04 的主颗粒也只引用内置 Canvas，因此不选为独立运行时配方。**当前是基于原始颗粒的 Godot 适配，不是完整 Procreate 笔刷引擎复现。** 未使用 QuickLook 预览图冒充笔尖，也未重新生成油画图片。Procreate 的形状、颗粒及沿路径铺点概念见[官方 Brush Studio 文档](https://help.procreate.com/procreate/handbook/5.4/brushes/brush-studio-settings)。

`tools/import_procreate_brushes.py` 可重建素材与清单，使用 Python 标准库。运行时 `use_aui_vangogh()` 载入颗粒及配方的尺度、明暗、对比、旋转、抖动参数；flow、spacing、grain depth 等原值亦保留，但不声称实现原应用全部动态或湿混色。

`shaders/procreate_brush.gdshaderinc` 按笔宽单位连续采样原始颗粒，以每片元 8 次局部积分近似密集行笔。增长阴影会延长行笔距离，不拉长一张完成笔触；颗粒决定颜料浓淡、侧缘和各束刷毛的收尾。起笔铺色较实，接地保护沿实际代理轮廓补齐根部，末端压力下降。重复采样、mipmap 与固定种子用于稳定纹理。未进行完整场景性能验收。

## 查看与复现

- 打开 `res://demos/painterly_lab/lab.tscn`；“Aui 油画笔刷”开关可对比旧贴图。
- 打开 `res://demos/bluebird/street_corner.tscn` 查看实际建筑。
- 新笔刷 GPU 检查：运行实验室并添加用户参数 `--aui-qa`。
- 旧路径回归：运行实验室并添加 `--painterly-qa`，该检查显式关闭新模式。
- 蓝鸟实际对比：运行蓝鸟并添加 `--bluebird-aui-qa`。

Godot 4.7.2 / Forward+ / Apple M5 实测：新模式 18 项检查通过，1,116 个根部采样全部覆盖；883 个可见地面采样中，改变物理阴影 bias 后笔刷遮罩误差为 0。包括不同光向、种子、接收高度及悬空物体；旧路径 93 项回归通过。蓝鸟加载与截图检查无失败。

[实验室验证](../../demos/painterly_lab/qa/aui-vangogh/validation.json) · [蓝鸟验证](../../demos/bluebird/qa/aui-vangogh/validation.json)

相同镜头、光照与曝光的蓝鸟实际截图：

![旧整笔贴图](../../demos/bluebird/qa/aui-vangogh/01-legacy.png)

![Aui 颗粒连续铺色](../../demos/bluebird/qa/aui-vangogh/02-aui-vangogh.png)
