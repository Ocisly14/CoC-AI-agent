# 蓝鸟餐厅 · Godot 街角样板

独立运行的 3D 外观 Demo，使用蓝鸟 v13 屋檐压薄版，沿用 v11 完整部位油画底色。包含餐厅、整张油画街道地表、带高度的人行道／路缘、正交镜头、晴天/暮色光照预览和地点手记。

## 打开

1. 在 Godot 项目管理器中选择「导入」，选择本仓库的 `godot-client/project.godot`。
2. 首次打开等待蓝鸟模型导入，然后按 **F5** 运行。无需启动后端。
3. 编辑场景：`res://demos/bluebird/street_corner.tscn`。道路、人行道、灯光、相机、UI 都是可直接选择的场景节点。

此 Demo 已设为项目默认运行场景。原二维模拟查看器保留在 `res://scenes/main.tscn`，打开后按 F6 可单独运行。

## 操作

| 操作 | 输入 |
| --- | --- |
| 观察角度 | 固定正交视角，不支持旋转 / 俯仰 |
| 缩放 | 滚轮 / 触控板双指捏合 |
| 平移 | 中键拖动 / 触控板双指滑动 |
| 镜头复位 | R / 复位按钮 |
| 晴天、暮色 | 1、2 / 对应按钮 |
| 美术调色与基础照明对照 | P / 美术调色按钮（Forward+） |
| 成片、固有色、增强权重、重要度 | 底部通道菜单（Forward+） |
| 展开内部地点 | 点击餐厅，依次刷出堂座、后厨、楼上住处；点击笔刷进入 |
| 返回街景 | 室内点击返回 / Esc；再次 Esc 收起笔刷 |
| 查看地点手记 | I / 地点手记按钮 |
| 收起手记 | Esc / 收起按钮 / 点击空地 |

## 编辑与资产

- `Bluebird/Architecture`：独立的模型实例；当前模型 75 个建筑网格、167 个材质表面，GLB 含六张新 4K 合成图集、一张整层地面及三张油画字面图。
- `Bluebird/PickBody`：只用于点击的简化选取代理，并非可行走建筑碰撞或导航网格。
- `Streets/PaintedStreetGround`：48×32 米连续地表网格，整张 UV 贴图描绘道路、人行道和磨损；`Sidewalk`、`RoadDetails` 保留为空适配组，旧几何已移除。
- `Lighting/Sun`、`WorldEnvironment`：实际运行的主光与环境光。预览按钮的两套参数在 `street_corner.gd` 中，不修改模拟时间或天气。
- `Camera3D`：正交俯视相机。运行时初始位置由脚本的 `HOME_*` 参数控制。

建筑沿用作者米制尺寸，主体底层约 12×10 米，层叠退台；仅平移至街角并抬高 0.18 米，使楼面与人行道接地。建筑正面 +Z，模型原有门窗和屋顶结构保持。道路宽度、路缘和铺装是这次样板的布景推定，未新增模组道路或改变地图拓扑。

`assets/bluebird.glb` 是仓库相对符号链接，指向根目录 `assets/grayhaven/bluebird/shell-v13/bluebird_painterly.glb`，避免复制大型模型文件。请保留整个仓库目录关系。若要把 `godot-client` 单独复制出去，先把该链接替换为原 GLB 的实际文件副本。Godot 导入配置使用内嵌非压缩纹理，避免另提取六份重复 PNG；导出游戏时使用 Godot 的正常资源打包流程。

作者源文件、基础材质与独立油画层继续保存在原资产的 Blender 文件中。本 Demo 使用已经烘焙进 UV 的合成版，保证平移/缩放时笔触附着于建筑；v10 新增三张油画字面图，不改动其他几何。导入脚本为十张共享图像生成 mipmap 并设置各向异性过滤，降低远景颗粒和斜视闪烁，不修改源图和 UV。

## 范围与验证

这是街角外观与交互样板，包含固定镜头室内场景图，尚未接入 NPC、实时模拟、步行导航或三维室内剖视。系统字体优先使用 macOS 的苹方/宋体；跨平台发布需另准备合法的 CJK 字体。

## 油画地点选择与室内场景

点击建筑，三笔混色颜料自下而上依次显露，各代表模组中的堂座、后厨、楼上住处。笔刷使用概念图的旧蓝绿、灰紫、暖木褐与赭黄，骨白文字；悬停和键盘焦点轻微提亮。菜单锚定建筑屋顶的屏幕投影，并在窗口边缘约束位置。

堂座使用 `interior-rooms-v3/bluebird-dining.png`，后厨使用 `interior-rooms-v4/bluebird-kitchen.png` 独立合成图。后厨延续堂座向前平移的视线：连接门和传菜窗位于画面下方，前后墙线保持水平，取消斜转角度。两张图的共用隔墙均完整，弹簧门和传菜窗关闭，互不透视展示另一场景。绘画、污渍、边缘和光色已在原图中，不再施加三维美术调色。黑色背景内保持完整比例显示，进入时淡入，退出保留原街景镜头。楼上暂无图像，呈现其自己的模组文字手记，不复用一层图冒充楼上。

实现为 `location_scenes.gd` 和 `location_brush.gdshader`；`assets/bluebird-dining.png`、`assets/bluebird-kitchen.png` 相对符号链接指向仓库根资产，沿用外部模型的资源交付方式。独立导出 Godot 工程前需保留链接目标或将其物化为 PNG。可用 `--bluebird-location=SCN_bluebird_kitchen` 直接打开后厨预览。

后厨当前显示用户确认的 `painted-background-v1/kitchen-background-110.png`：长油画泼洒背景按放大 10% 的预览合成比例保留，直接显示成图，不在运行时重新叠加。上文 v4 后厨仍是场景源图。独立背景通过 `assets/bluebird-oil-background.png` 一并导入以供复用。

堂座当前使用 `painted-background-v1/dining-background-110.png`，沿用同一长笔触背景，以后厨最终合成图为比例参照。两个地点分别加载各自的合成图，共用显示布局和缩放参数。

室内图像在原等比适配的显示尺寸上，以中心为基准整体缩放到 150%；场景和油画背景同比例变化，文字和导航保持原尺寸，超出窗口部分由视口裁切。

使用 `--bluebird-interior-qa` 执行场景切换、输入隔离、快速返回及渲染检查，输出至 `/private/tmp/bluebird-interior-qa`。

已在本机 Godot **4.7.2 / Forward+ 与 Compatibility / Apple M5** 中导入和实际渲染。`qa/` 保存当前默认 Forward+ 的晴天、手记、暮色和材质近景的实际运行截图，以及 `validation.json`。自动检查涵盖网格/材质存在、相机缩放边界/锁定角度/平移/复位、射线选择与按钮状态；不是帧率或显存预算验收。

从仓库根目录重跑本地检查（将 `Godot` 换成你的可执行文件路径）：

```sh
Godot --headless --path godot-client --editor --import
Godot --path godot-client --scene res://demos/bluebird/street_corner.tscn -- --bluebird-qa
```

第二条会短暂打开渲染窗口，更新截图和验证记录，然后自动退出。仅在明确带 `--bluebird-qa` 参数时执行检查。

`tools/build_scene.py` 保存初始场景生成方式，通常直接在 Godot 编辑即可。手动运行该脚本会覆盖 `street_corner.tscn`，包括其中后续手工编辑的内容。

## 历史日照测试版（后续调色已取消宿主全局调整）

默认使用 Forward+。按用户修正，白天改为大太阳晴天：主光能量 1.10、暖白日照，灰蓝环境光能量 0.55，阴影不透明度 0.85，方向光角直径 0.65°；饱和度 0.85、对比度 0.98、曝光 1.20。受光面明亮，阴影保留冷色。暮色继续使用此前柔光参数（主光 0.38、环境光 0.58、角直径 3°、曝光 1.45）。保留原来的 42° 方位、31° 俯角与正交构图，仅允许平移、缩放。

这版通过环境补光托起暗部，没有启用实时 GI 或重绘建筑贴图。原先的窗框、屋顶笔触及材质磨损全部保留；光照测试不能代替后续的绘画边缘、地面和街区布景制作。全局调整只作用于 3D 场景，HUD 保留原色。

- `qa/01-afternoon.png`：当前晴天效果，沿用旧文件名以便对照。
- `qa/03-evening.png`：当前暮色效果。
- `qa/05-overcast-study.png`：上一版阴天效果，仅供历史对照。
- `qa/before-soft-light/`：调整前同机位原始截图。
- `qa/compatibility/`：上一版阴天的 Compatibility 实际截图与检查记录；曝光 1.0，未启用 PCSS，投影边缘更硬。

若设备需要 Compatibility，可在项目设置切换渲染器，或使用 `Godot --rendering-method gl_compatibility --path godot-client` 临时运行。脚本会选择相应曝光与软阴影设置。当前晴天参数已在 Forward+ 实际验收，Compatibility 的晴天效果尚未重新截图。两种渲染器的截图不能假设逐像素一致。本轮确认导入、材质、点击、按钮、镜头及实际画面可运行，未做性能基准。

## v10 招牌与光影接入（v11 底图更新见下节）

BLUEBIRD、DINER、双面 EATS 均换为带真实透明通道的油画字面，保留原字面尺寸与木板边框。六张原始基色图集逐字节保留，除文字外的 71 个建筑对象几何、UV 不变。完整源与审计见 [v10 资产](../../../assets/grayhaven/bluebird/shell-v13/README.md)。

Forward+ 通过 `painterly_preview.gd` 转换 157 个建筑漫反射/镂空表面及 61 个街景表面，保留原顶点缓冲、UV 与基色。8 个玻璃、黄铜门五金和灯泡共 10 个表面继续使用原生材质。

`assets/control-maps` 是指向 v10 控制图目录的相对符号链接。两层四面墙、两层屋顶及街角地面共有 11 个区域、33 张线性数据图：重要度、无向笔触流向、间接光 RGB + 环境可见度 A。根据 GLTF `extras` 选择区域；经坐标转换后采样，不挤占基色 UV。202 个表面接入这些图，分隔墙等其他表面沿用默认值。字面重要度固定为 1，保留笔触和字母镂空细节。

间接光 RGB 为美术指定的微弱暖色补光，A 从几何半球射线得到，仅影响环境项；未启用原生实时 GI。油漆与污渍仍包含在原始基色中，继续参与选择性日照色彩处理。

压力笔刷与已确认贴图用于地面、屋顶和已接入 NPR 的建筑墙面，14 个简化建筑体积与灯具的分段代理控制排笔。完整圆头、颗粒和接地加深共用同一路径；矩形模式按接收面的米制投影宽度排笔。物理太阳遮挡继续捕获真实注册几何，用于物理调试和关闭笔刷时的回退。简化体积的刷影轮廓属于美术近似；原生玻璃／金属材质与局部点光源仍使用其原生阴影接口。见[墙面投影修复与实际截图](../../rendering/painterly/WALL_SHADOWS.md)。

P 同时切换选择性日照增强、重要度对比、细节归组及笔刷阴影；深度捕获、光源、间接光输入和输出曝光保持不变。宿主不重复全局降饱和或曝光。Compatibility 只预览原生材质，没有本 NPR 模块。

[实际招牌近景](qa/color/09-painted-signs.png) · [EATS 背面](qa/color/10-eats-back.png) · [街角近景](qa/color/05-noon-closeup.png) · [重要度](qa/color/03-importance.png) · [GPU 验证](qa/color/validation.json)

```sh
Godot --path godot-client --scene res://demos/bluebird/street_corner.tscn -- --bluebird-color-qa
```

检查包括真实图像像素范围、分区坐标、原几何/UV/图像资源、招牌 alpha、间接图对实际画面的贡献、昼夜/调色和截图。该命令要求 GPU 窗口，headless 会明确失败。没有做帧率/显存预算验收；运行中移动原建筑还需同步静态显示副本和笔刷代理变换。

## 油画高光

[光照驱动的油画高光](../../rendering/painterly/highlights/README.md)替代原接触与轮廓颜料带。玻璃、金属及接近正对光源的边框叠加预制油画亮笔，位置固定在材质表面，太阳/月光及路灯控制亮度和颜色，原生阴影控制遮挡。木质与漆面框条也参与；横竖合并网格使用一次烘制的 UV 方向分区。

按 **B / 油画高光**独立对照；F3「油画高光」可分组开关、调强度/密度/尺寸/方向、预览笔触覆盖与受光权重，并重新排笔。参数纳入保存/恢复；旧颜料带字段忽略，不改写原始图集和 GLB。P 键仍控制漫反射美术调色。

验收：`Godot --path godot-client --scene res://demos/bluebird/street_corner.tscn -- --bluebird-highlight-qa`。当前 [报告与昼夜截图](qa/highlights/validation.json)使用实际 Forward+ GPU；原 `qa/seams` 是历史报告。

## 当前 v11 完整部位底图

[九张原图与源模型](../../../assets/grayhaven/bluebird/shell-v13/README.md)覆盖四面立面、斜角入口、两层屋顶、两层地面。32 个对象的对应材质槽使用单次部位映射，底色本身描绘木漆、板缝、卷材、维修与定点磨损。新底色与原大色块节点分别可编辑；默认 GLB 使用完整合成。仅基础版本为 `bluebird_base_baked.glb`。

75 个网格、167 个材质表面及原模型几何保留；九张整图烘入六张图集，后厨地面直接使用完整地面图，三张油画字不变，GLB 共十张图像。控制贴图仍读取 v10 的专用数据；光照和笔刷规则沿用。前文“六张原图逐字节保留”仅适用于 v10 历史版本；v11 已按本轮要求重绘底图。

[仅新基础底图](qa/base-v11/05-noon-closeup.png) · [完整合成](qa/color/05-noon-closeup.png) · [基础 GPU 检查](qa/base-v11/validation.json) · [完整 GPU 检查](qa/color/validation.json)

## v12 白模衔接修正

两层屋顶改为 10 cm 连续出檐，入口斜角采用对应轮廓；转角板顶部补齐 2 cm，雨槽及落水管上端内移 4 cm。出檐底面沿用屋顶颜色，室内天花保留。全部 10 张 v11 嵌入图像保持一致；建筑仍为 75 个网格、167 个材质表面。

[白模、固定机位近景和源文件](../../../assets/grayhaven/bluebird/shell-v13/README.md)。最终模型通过 102 项 GPU 集成检查；两层屋顶仍在全局渲染器中产生屋顶到墙面的单向混色。

## v13 屋檐压薄

下层屋顶厚度从 20 cm 降至 11 cm，上层从 18 cm 降至 12 cm，顶面与雨槽口齐平，屋顶设备和招牌后支脚同步落低。墙顶接合、出檐轮廓和原贴图保持。该 Demo 的全局接缝识别容差收紧到 1 cm，避免雨槽近邻细分面重复生成笔触；屋顶到墙壁的单向混色继续启用。

[当前白模、材质模型和前后对照](../../../assets/grayhaven/bluebird/shell-v13/README.md)。

对应的 `assets/control-maps` 也指向 v13：33 张 v10 控制图保留，14 个既有阴影体积的屋顶和设备高度同步降低，避免旧体积遮住新屋面。

## Aui Vangogh 阴影更新（2026-09-08）

预览默认采用用户 Procreate 包中的原始颗粒连续铺色，替代原来的整笔阴影贴图；保留建筑基材与投影代理。包内缺少内置笔尖源图，当前为 Godot 适配。见[接入说明与实际对比](../../rendering/painterly/PROCREATE_BRUSHES.md)。

## 独立交付与旧版清理

当前 v13 已收拢全部贴图和重建输入，旧 v1–v12 模型目录已清理。当前模型的再导出、从可编辑分层源重新烘焙、阴影体积更新均使用 v13 内的文件；前述版本编号仅记录迭代历史。使用当前资产 README 的命令进行重建。

默认阴影现已升级为[压力盖印 v0.6](../../rendering/painterly/PRESSURE_STAMPS.md)，包含可见根部起笔、压宽／压扁和提笔收尾；`--bluebird-pressure-qa` 生成当前与上一版的同机位对比及计时。


## 整张街道地表接入（2026-09-08）

当前默认场景已使用 [street-ground-v1](../../../assets/grayhaven/bluebird/street-ground-v1/README.md) 的 1536×1024 油画基础色与 48×32 米网格。主街与两侧人行道共用连续 UV，路缘有 0.18 米实际高度；餐厅保留原变换与门槛高度。贴图按模组北半主街制作，旧侧向车道、独立道路标线与重复排水格栅几何已移除。

三份源资产通过 `assets/bluebird-street-*` 相对符号链接进入 Godot，与现有餐厅资产沿用同一方式；单独拷贝 Godot 工程时应替换为实际文件副本。PNG 无损导入，启用 mipmap 与各向异性过滤，不自动切换为 VRAM 压缩。油画适配保留原底图，沿用当前地面控制图与动态阴影，并为不循环材质使用 clamp 采样，避免地块相对两端混色。

已在本机 Godot 4.7.2 / Forward+ / Apple M5 渲染通过。[晴天](qa/street-ground/01-afternoon.png)、[暮色](qa/street-ground/03-evening.png)、[近景](qa/street-ground/04-material-closeup.png)、[俯视落位](qa/street-ground/06-topdown-alignment.png)与[验证报告](qa/street-ground/validation.json)记录实际结果。检查包括导入方向、纹理 mipmap、物理范围与高度、油画材质／阴影传递、原有建筑点击、镜头与光照交互。Compatibility 与性能预算未在本轮验收。地表边界是当前局部资产范围，未扩建相邻商铺。

复查命令：

```sh
Godot --path godot-client --script res://demos/bluebird/tools/street_ground_qa.gd
```

该命令需要 GPU 窗口，在独立 `qa/street-ground` 目录保存截图与报告，不覆盖历史 QA 图片。`tools/build_scene.py` 已同步新地表引用；它仍仅用于主动重建初始场景，不应随意覆盖编辑器中的后续改动。


## 四盏街灯与局部光照（2026-09-08）

默认街景加入 `StreetLights` 子场景：两盏位于餐厅侧人行道（X −13、9；Z 6.15），两盏位于对面（X −6、16；Z 19.05）。底座均为 Y 0.18 米，与铺装齐平，避开入口。节点位置是当前街景的美术布置，不新增模组物品 ID。

每盏使用既有油画路灯、暖黄色 OmniLight3D 与独立灯泡发光材质。光源中心离底座 3.34 米，当前作用距离 11.5 米、衰减指数 1.9、亮灯能量 9.7；开启原生局部阴影，光源尺寸 0.55、阴影模糊 2.5、不透明度 0.72。参数由 `street_lights.gd` 设置；独立路灯资产仍保留默认能量 2.4。灯泡与玻璃不投不透明阴影，避免灯泡把内部光源完全遮住；铸铁框架、灯帽与周围建筑仍可遮挡局部光。四盏灯共享同一 mipmap 颜色图，各自保留材质与开关状态。

白天预设关闭，暮色预设开启；时间预览在 18:00–06:00 开灯，06:00–18:00 关灯。使用已有 F3 时间调试可检查昼夜；这些仅跟随本地预览时间，不修改后端模拟。

`local_light_bridge.gd` 为蓝鸟材质派生局部灯照版本：以 EMISSION 保留原油画太阳／环境结果，在 Godot `light()` 中只接收非方向光的漫反射与原生距离衰减／遮挡，关闭重复环境和镜面贡献。`lamp_color.gdshaderinc` 与太阳共用 Oklab、色相选区和软上限函数，为高重要度或相近色材质增加色度与相对明度；两项权重可叠加，局部光的距离衰减和遮挡仍生效。通用色相函数抽出带参数的版本，太阳原有调用与默认行为保留。实现参考 [Godot Spatial Shader / Light built-ins](https://docs.godotengine.org/en/stable/tutorials/shaders/shader_reference/spatial_shader.html#light-built-ins)。

[夜景](qa/street-lights/03-night.png)、[熄灯对照](qa/street-lights/04-night-lamps-off.png)、[白天](qa/street-lights/01-day.png)与[GPU 报告](qa/street-lights/validation.json)记录实际结果。Godot 4.7.2 / Forward+ / Apple M5 的 38 项检查通过，包括四盏灯各自照亮油画地面、真实遮挡物阻断灯光、白天与原着色器画面一致、时间／预设切换及餐厅拾取。未做帧率预算或多平台性能验收。

```sh
Godot --path godot-client --script res://demos/bluebird/tools/street_lights_qa.gd
Godot --path godot-client --scene res://demos/bluebird/street_corner.tscn -- --bluebird-street-night
```

第二条直接打开 22:00 的街灯全景，普通启动仍保留白天默认镜头。

### 路灯投影与柔光调整

四盏灯的铸铁网格现已参与建筑使用的真实深度采集，灯座、细柱、灯罩分别提供油画投影体积，与建筑共用压力盖印和 Procreate 颗粒渲染。共 26 个投影体积（建筑 14、路灯 12），保留路灯原有分层材质；太阳与月光下都能投影。局部灯光继续使用原生遮挡，通过扩大光源、增加模糊和降低阴影反差形成更柔和的半影。

此前柔光调整的同机位单灯 GPU 对照中，近处地面由灯光增加的亮度提升约 36%，远处降至原来的约 15%。该轮使用能量 14.4、范围 8.5、衰减 3.0；当前参数已由下述用户定稿替代。[路灯投影近景](qa/lamp-shadow-refinement/01-day-lamp-shadow.png)、[该轮夜景](qa/lamp-shadow-refinement/06-night-refined.png)与[22 项检查报告](qa/lamp-shadow-refinement/validation.json)保留历史结果。

```sh
Godot --path godot-client --script res://demos/bluebird/tools/lamp_shadow_refinement_qa.gd
```

### 用户定稿与暖色朝夕阳（2026-09-08）

[定稿参数](presets/approved-art.json)合并了用户保存的 `art-2026-09-08_13-00-25.json`（太阳光与美术）和 `art-2026-09-08_14-27-46.json`（路灯）。启动应用整组参数，默认使用 13 点文件中的手动日光，镜头仍可自由调整。F3 面板的「恢复初始」回到合并定稿，晴天／暮色切换保留曝光，调节和另存新参数仍可用。两个原用户文件未改动。

太阳与美术定稿：太阳强度 1.34、环境光强度 0.35、方位角 −35°、高度角 50°；曝光 1.33、日照增色响应 4.0、增艳上限 1.0、提亮上限 0.15、对比度响应 1.0、中点 0.76、细节弱化 0.23、重要度倍率 1.34／曲线 1.21、色相范围 ±51°／羽化 11.2°。颜色三通道及其他参数直接保留源 JSON 数值。

路灯定稿：3150 K（美术近似色温）、亮度 9.7、衰减 1.9、范围 11.5 米；整体加成 4.1、重要度加成 1.85、相近色加成 1.45、色相范围 ±56°、增艳上限 1.05、提亮上限 0.6。F3 →「路灯」可实时调节这些数值，向下滚动显示加成控件。参数格式升级至 v4，兼容读取 v1–v3；旧文件不覆盖当前路灯值。[控件与 GPU 验证](qa/lamp-controls/validation.json)包含实际增亮、重要度与色相独立作用、参数保存读取和 A/B 对比。

朝夕低太阳颜色从 `#ff9857` 调至 `#ff7838`，暖色向正午色的过渡终点从高度权重 0.55 延长至 0.70。昼夜曲线的正午颜色、强度 1.34、环境光强度 0.35 和最高高度角 50°均取自合并定稿；时间变化仍驱动太阳方向与明暗，月光保持原值。暮色快捷预设的太阳为 `#edb181`，主光／环境光强度按定稿日光基准缩放。

```sh
Godot --path godot-client --scene res://demos/bluebird/street_corner.tscn -- --bluebird-lamp-controls
Godot --path godot-client --script res://demos/bluebird/tools/lamp_controls_qa.gd
Godot --path godot-client --script res://demos/bluebird/tools/day_night_qa.gd
```
