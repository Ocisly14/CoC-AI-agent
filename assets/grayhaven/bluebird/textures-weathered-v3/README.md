# 带真实损伤的写实油画底材 v3

这组底图已应用到 [Bluebird v8 模型](../shell-v8/README.md)。底图自身带适量损伤：保留旧漆剥落、露木、积垢、磨痕、锈蚀和风化，去除与材料无关的零碎笔刷色块。材料纹理以克制的写实油画方式描绘，大色块仍在独立表现层中控制。

使用内置 **image_gen** 编辑七张 v2 底图，保留其接缝布局和已校准的材料尺度。旧版外墙图仅作老化程度参考，不复制其中的矩形涂抹。全部生成 PNG 原样保存，未用程序涂画或加工损伤。

| 底图 | 实际采样覆盖（米） | 底图内的损伤 |
| --- | --- | --- |
| [米白挂板](basecolor/01-ivory-clapboard.png) | 2.4 × 1.8，九行约 20 cm 挂板 | 板边剥漆、灰褐露木、缝内积垢 |
| [青绿护墙板](basecolor/02-teal-wainscot.png) | 1.2 × 2.4，六列约 20 cm 竖板 | 顺纹掉漆、局部露木、旧化色差 |
| [米白窗套](basecolor/03-ivory-trim.png) | 1 × 1 | 裂漆、磨薄与不规则剥落 |
| [旧金属](basecolor/04-weathered-metal.png) | 2 × 2 | 氧化、锈斑与露出灰色金属 |
| [深灰屋面](basecolor/05-charcoal-roof.png) | 1 × 2，卷材宽约 1 m | 颗粒磨失、细裂纹与陈旧污渍 |
| [木地板](basecolor/07-dining-floor.png) | 1.6 × 2.4，八列约 20 cm 木板 | 漆面磨损、擦痕与接缝旧化 |
| [暖灰内墙](basecolor/08-warm-plaster.png) | 2 × 2 | 局部脱皮、细裂纹与淡污痕 |

采样窗口在材质节点中设置，源图仍为完整 1254 × 1254 PNG。覆盖尺寸是本模型的制作标定；提示词中的损伤百分比只用于控制视觉程度，不是测量结果。基色为 sRGB，粗糙度沿用各材料设定，没有从绘画颜色自动推导法线或位移。

[完整提示词、输入参考及生成来源](source/generation.json) · [材质尺寸与文件校验值](manifest.json) · [关闭表现层的模型近景](../shell-v8/previews/base-sill.png) · [合成模型近景](../shell-v8/previews/baked-sill.png)
