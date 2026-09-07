# 相近色油画涂块 · v2

新增12个原创形状，分成三个各有主色基底的色系：灰蓝石板色、橄榄暖灰、暖灰赭色。每个形状内部使用相邻冷暖和明度变化，避免把互不相关的鲜艳颜色拼在一起。前三阶段造型成果不受影响。

- [Blender素材库](tonal-pigment-library.blend)：12个可追加节点组 `TONE_01_01` 至 `TONE_03_04`，图片已打包。
- [实际材质样板](material-preview.png)
- [灰蓝石板色](atlases/01-slate-scumbles.png)、[橄榄暖灰](atlases/02-olive-graphite.png)、[暖灰赭色](atlases/03-warm-earth-scumbles.png)
- [完整生成提示词](source/prompts.json)、[来源记录](source/provenance.json)、[节点组与图格清单](manifest.json)

本包由内置 image_gen 生成。每图1254×1254，四格各627×627；素材为RGB纯黑遮罩底，不是假装透明的PNG。节点在线性空间以0.008–0.045的亮度范围计算覆盖；该阈值按本包素材设定，不能直接用于任意深色图。黑底不进入最终颜色。

使用方式沿用前一素材库：原始基色接 `Base Color`，表面坐标接 `Surface UV`，调整中心、尺寸、角度、强度和 `Tint Mix`；输出接回基色。`Tint` 指定所属材料的相近色，`Tint Mix` 控制源颜料颜色与目标色的关系。保留独立基础层和露底区，不将这些图全覆盖重复平铺。

Bluebird v7实际选用前两组的灰色形状，配合炭灰屋面基底；暖灰赭色组保留作后续材料制作。更多素材意味着更好的选择，不要求同一屋面用完全部形状。
