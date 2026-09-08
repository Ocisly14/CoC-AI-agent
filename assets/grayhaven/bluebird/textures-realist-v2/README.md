# Bluebird · 写实油画基础材质 v2

本包为偏干净的历史底材方案，已由[带真实损伤的 v3 底材](../textures-weathered-v3/README.md)替代。[建筑 v8](../shell-v8/README.md)当前使用 v3。本包保留为编辑输入及尺度校准依据。使用内置 image_gen 逐种生成，原生图均为 1254×1254、不透明 sRGB PNG。表面笔触用于描绘材料，独立大色块由模型表现层承担。

| 材料 | 源图 | 有效覆盖宽×高 | 映射 |
| --- | --- | --- | --- |
| 骨白挂板 | [01](basecolor/01-ivory-clapboard.png) | 2.4×1.8 m | 九行接缝窗口，露出高度约 0.20 m |
| 蓝绿墙裙 | [02](basecolor/02-teal-wainscot.png) | 1.2×2.4 m | 六列接缝窗口，板宽约 0.20 m |
| 骨白窗套木漆 | [03](basecolor/03-ivory-trim.png) | 1×1 m | 连续无板缝，木纹顺构件长边 |
| 旧漆金属 | [04](basecolor/04-weathered-metal.png) | 2×2 m | 连续表面，细小氧化与磨损 |
| 炭灰卷材屋面 | [05](basecolor/05-charcoal-roof.png) | 1×2 m | 一米宽卷材接缝窗口 |
| 木地板 | [07](basecolor/07-dining-floor.png) | 1.6×2.4 m | 八列接缝窗口，板宽约 0.20 m |
| 暖灰泥 | [08](basecolor/08-warm-plaster.png) | 2×2 m | 连续细微表面变化 |

有效覆盖对应模型节点中的采样窗口。原图生成的板数与请求并不完全相同，因此依据可见接缝重新标定；未对原图插值放大，也未把固定分辨率当成覆盖面积。接缝窗口由 UV 取样实现，原图字节不变。像素窗口与映射实现见[材质构建脚本](../shell-v8/source/build_materials.py)。

[材质清单](manifest.json)记录源图尺寸、实际覆盖、粗糙度起点与校验值。[完整提示词和生成来源](source/generation.json)记录内置工具、每种材质简报及原始生成路径；各提示词也单独保存在 `source/*.txt`。

本包提供基色和材质响应起点，没有从基色推导 normal、位移或完整扫描 PBR 通道。原建筑凹凸与结构继续由几何承担。实际效果以建筑上的近景和完整模型渲染为准。
