# Bluebird 案例定位

仅在当前工作区包含 Grayhaven / Bluebird 资产，或用户明确要求复用这次餐厅制作成果时读取。以下均相对项目根目录；缺失时搜索实际项目，不依赖某台机器的绝对路径。

## 设计依据

- 当前总美术入口：`docs/art-direction/README.md`。
- 制作规范：`docs/art-direction/production.md`。
- 当前材质修订：`docs/art-direction/disco-elysium-material-aesthetics.md`。建筑底层采用符合真实覆盖面积、带克制油画质感的写实绘画材料；表现性大笔刷与色块后续独立叠加。该规则优先于下述历史版本的油画底图做法，尚未表示资产已完成替换。
- 历史文档：`docs/superpowers/specs/2026-09-06-grayhaven-art-direction.md`，开头已声明旧《奇异人生》审美被替代；只沿用有效构造和技术记录。
- 用户后续确定的建筑方向：一楼较大、二楼较小且退台、街角小镇餐厅。该修正优先于更早的泛用概念板。保持1985年北加州地域背景。
- 大笔触参考之一：`assets/grayhaven/bluebird/shell-v5/source/user-brush-reference.jpg`；仅为美术研究参考，不是可直接铺到建筑上的贴图。v6修正不规则形状与跨窗框连续性，v7继续补上屋顶的主色基底与相近色涂块。

## 资产与制作记录

- `assets/grayhaven/bluebird/design-v3/`：查找结构设计成果，并与实际模型校对。
- `assets/grayhaven/bluebird/shell-v1/`：白模与初始基础贴图成果。
- `assets/grayhaven/bluebird/textures-oil-v1/`：历史油画底图，须按新的写实绘画底材要求复核，不作为后续基础贴图验收标准。
- `assets/grayhaven/bluebird/shell-v2/layers/ground-brush.png`、`ground-weather.png`：后续复用的旧白色笔刷／墙脚遮罩。
- `assets/grayhaven/bluebird/shell-v3/source/uv-layout.json`：既有立面UV区域定义。
- `assets/grayhaven/bluebird/shell-v4/`：门头、牌子、水管、雨棚、屋顶构件等完成后的外部模型。
- `assets/grayhaven/bluebird/shell-v5/`：大色块及骨白墙边，含 `bluebird_painterly_layered.blend`、烘焙版 Blender／GLB、`source/paint_large.py`、`source/placements.json`、`validation.json` 和真实渲染 `previews/`。
- `assets/grayhaven/bluebird/paint-effects-v1/`：4张原创图集、16个不规则形状及 `irregular-pigment-library.blend`；完整提示词、来源和使用说明均随包保存。
- `assets/grayhaven/bluebird/shell-v6/`：当前斜向、不规则且跨构件连续的绘画版本，含分层／烘焙 Blender、GLB、`source/build_paint.py`、放置参数及验证脚本；近景为 `previews/11-sill-continuity.png` 和 `previews/10-paint-detail.png`。
- `assets/grayhaven/bluebird/paint-effects-v2/`：3个相近色系列、12种新形状及 `tonal-pigment-library.blend`，含灰蓝石板色、橄榄暖灰、暖灰赭色。
- `assets/grayhaven/bluebird/shell-v7/`：当前完整模型，保留v6外墙，新增两层屋顶及低矮泛水绘画；含 `source/paint_roof.py`、`source/render_roof.py`、`source/validate_roof.py`、模型和前后渲染。

历史文件夹编号是迭代记录，不等于本 skill 的阶段顺序。以后完整新建按七阶段流程推进；续作不为了顺序重做已经有效的资产。

## 值得复用的决策

v5 的大色块宽约0.5–3.2米，放在窗间实墙、二楼侧墙及局部墙裙；用灰绿、灰紫、灰蓝绿、暖赭和暖灰制造相邻色变化。这个尺寸是餐厅尺度下的案例，换建筑或镜头后重新判断。

v5 选择性复用旧白色遮罩，在部分转角、墙脚和窗边叠加骨白 `#EAE3CE`。底层细节通过未覆盖区和破碎边缘保留；未整栋覆盖，也未靠几何贴花或全屏滤镜完成。

v5 只替换一楼／二楼两张4K墙面基色图，保留83个建筑对象、56,034个三角形和既有UV；这些统计只描述案例，不作为新资产预算。分层文件保留原始图片，烘焙文件可合理替换旧墙面图集，二者验证职责不同。

实际使用的源图为 `shell-v5/layers/broad-pigment-black.png`。`broad-pigment-atlas.png` 是生成时含假透明棋盘格的弃用稿，不可因为文件名像图集就误用。

## v6 修正：取代突兀横条，连续覆盖构件

v5的大块近水平色条被用户指出过于突兀，而且绘画只作用于墙面，在窗台和窗框处中断。v6从v4基础材质重新安排32处色块，选用新素材库中的不规则形状，旋转约17–31度；没有继续叠在v5旧横条上。角度和数量只描述本案例，不是通用硬指标。

墙面、窗框、窗台、转角板及相交外露水管共享立面投射，保持相同中心、尺寸、角度和笔刷采样。正背面使用世界X／Z，侧面使用Y／Z，入口斜面使用切线／Z，并设有限深度；玻璃和室内墙面保留。世界坐标的移动限制见主绘画参考，烘焙后贴图随模型UV附着。

所有83个建筑对象、56,034个三角形及旧UV通道通过保留检查；为构件额外添加 `PaintBakeV6`。输出墙面一楼、二楼、构件三张4K基色图。验证还核对了临街墙面和窗台投射参数一致、GLB纹理依赖完整及所引用UV通道存在。实际渲染验证了窗台笔触衔接，但未测试浏览器运行性能。

## v7 修正：屋顶主色基底与相近色层次

v6的屋顶仍是原有基础贴图，用户指出整栋应遵循“一个主色基底＋相近色涂块”。v7在保留v6成果的基础上，以炭灰屋面为底，用灰蓝、灰紫、灰橄榄和暖石墨色组织12处局部涂块。新增素材库包含12个形状，实际屋顶选用其中7种节点；不能要求模型保存未使用的全部节点来证明素材库完整。

投射采用世界XY、屋面高度与朝上法线约束，笔触在低矮泛水表面衔接。输出4K屋面基色及2K构件基色，三个屋顶构件新增 `RoofBakeV7`，旧几何、UV与非屋顶材质保持不变。素材库源图为1254方图、每格627像素，黑底通过适配本包的遮罩阈值去除；尺寸和阈值均是案例参数。

v7分层文件只保证新增屋顶绘画可编辑；外墙沿用v6烘焙贴图，修改墙面节点应回到v6分层源文件。完整屋顶对照为 `shell-v7/previews/12-roof-field.png` 与 `before-12-roof-field.png`。模型与导出检查通过，浏览器性能未实测。

本次用户已明确不需要托管。不要因为项目存在旧查看器或发布配置而继续远程发布。
