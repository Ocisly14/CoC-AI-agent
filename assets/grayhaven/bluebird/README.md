# 蓝鸟餐厅 · Blender 场景资产

**当前制作入口：[shell-v7 屋顶与整栋油画模型](shell-v7/README.md)**，基于新结构图的大一楼、小二楼街角建筑。保留v6的斜向外墙笔触及跨窗框连续绘画，新增屋顶主色基底上的相近色涂块。提供[完整GLB](shell-v7/bluebird_painterly.glb)、[屋顶分层Blender](shell-v7/bluebird_painterly_layered.blend)及[屋顶效果](shell-v7/previews/12-roof-field.png)。外墙节点编辑使用[v6分层源文件](shell-v6/bluebird_painterly_layered.blend)。

素材库：[不规则笔触16种](paint-effects-v1/README.md)／[相近色涂块12种](paint-effects-v2/README.md)。完整流程保存在仓库内的[油画场景制作skill](../../../docs/art-direction/skills/painterly-environment/SKILL.md)。下文仅记录更早的结构原型，不适用于新版尺寸或物品范围；新版模型仍以建筑空间为范围。

**风格复核：此版没有达到「叙事性油画写实」指导，只保留为结构原型。技术检查通过不等于风格通过。外观修正在 `lookdev-v2/`，尚未完成全建筑重绘或替换 GLB。**

此 LOD0 结构原型模型覆盖外壳、堂座、后厨、楼上住处及模组的 40 个物品身份。没有人物角色、绑定或动画。小型圣母瓷像作为原模组已有的家居摆件保留，不制作面部细节。

## 文件

- `bluebird_diner.blend`：可编辑 Blender 源文件；贴图已打包，默认显示完整建筑。
- `bluebird_diner.glb`：带 PBR 贴图、物品 ID 和分组的 Three.js 候选资产；尚未接入运行时。
- `previews/`：Blender 实际渲染的外观、堂座剖视、住处、后厨、汤锅近景与黄昏外观。
- `source/build_bluebird.py`：完整可重复建模、导出、渲染脚本。
- `source/make_textures.py`：原创确定性笔触贴图生成源文件。
- `source/view_bluebird.py`：Blender 内可运行的视图切换面板，不需要安装插件。
- `textures/`：12 套可重复使用的 512² 基色、粗糙度贴图。`source/` 内分别保留颜色底层、方向笔触与颜料颗粒层；不从概念板截取贴图。
- `manifest.json`：实测网格/三角形/文件大小、坐标标定、全部物品身份与待完成项。

## 打开与查看

直接用 Blender 打开 `bluebird_diner.blend`。模型分为 STRUCTURE、DINING、KITCHEN、RESIDENCE、ROOF、SITE、RENDER_RIG、SHADOW_PROXY 八个集合；家具保留零件，屋顶、上墙、低墙、地板和楼梯分开。六台正交相机位于 RENDER_RIG。

切换剖视可在 Blender 的 Text Editor 中选择已内嵌的 `view_bluebird.py`（也可打开 `source/view_bluebird.py`），然后选择 Run Script，然后在 3D 视窗按 N，打开 **Bluebird** 页签。这只是当前文件的视图操作，不修改系统插件配置。仅切换相机不会自动隐藏墙体。

## 构造与风格

临街两层主楼、单层后厨翼楼、阶梯假立面、蓝灰招牌和后厨烟道构成主轮廓。窗洞与街门为实际开口，后厨没有新增外门。堂座经弹簧双开门进入后厨，后厨角落楼梯穿过二层楼板开口到达住处；楼上左侧卧室、右侧客厅与临街摇椅保留原空间关系。

几何负责建筑搭接板、门窗凹进、屋檐、桌椅承重、电话拨盘、锅腔与锅耳。基色贴图负责有限色阶的方向性色块与颜料质感；粗糙度贴图区分木漆、皮革、灰泥和金属。磨损几何只安排在板脚、座边、烤箱边缘等使用位置，不添加剧情线索。日照、投影与高光由 Blender 灯光产生。

家具按实用尺寸制作：柜台约 0.95 m 高、卡座坐面约 0.46 m、餐桌约 0.77 m、厨房工作面约 0.89 m。原沙盘家具高度是示意比例，因此没有把所有家具尺寸机械乘以同一系数。

## 坐标与技术交接

Blender 原生为米制、Z 向上、−Y 朝街。GLB 导出后 Y 向上、+Z 朝街，建筑底面中心为原点。主体宽 7 m、深 11 m；二层地面为 2.891 m。对当前蓝鸟宿主采用 `authorMetersToSceneUnits = 2`，GLB 局部坐标转换为 `(x*2, y*2+0.4, z*2)` 后，再使用现有建筑世界变换。这个标定只适用于当前蓝鸟宿主。

GLB 按物品身份、材质、楼层及剖视职责合并零件，源 `.blend` 保留更细的零件结构。`itemId`、`connectionId`、`floor`、`role`、`side` 保存在 glTF extras；需要导入器显式映射到现有拾取与剖视机制，不能假设引擎自动识别。门铰链位置提供元数据，尚未制作开门动画或可操作铰链层级。

SHADOW_PROXY 集合保留有真实开口的物理外壳副本，默认隐藏。GLB 不包含这套重复几何；运行时可基于外壳生成遮光副本，或后续单独导出。不要把物理壳和视觉壳作为普通可见网格同时渲染。

## 本轮边界

- 交付为作者 LOD0 资产与实渲检查图，尚未制作 LOD1/LOD2，也未测量游戏端帧时或显存。
- 相框、装裱与照片平面已建好；照片内容等待使用已有正确素材，没有生成新人物肖像。
- 菜单保留明确的炖鱼汤和蛋挞，不编造价格、未指定例菜、号码或可解读的信件、食谱内容。
- 内部剖视图为便于审查构造的中性照明示意，移除屋顶后有天空补光；不作为运行时剖视遮光验收。
- 油画效果目前由模型色面与原创程序笔触贴图构成。重点物件后续可继续做人工贴图修饰；这不是对概念板全部笔触细节的逐像素复刻。

## 重建

先使用安装了 Pillow 的 Python 执行 `source/make_textures.py`，再用 Blender 执行：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python assets/grayhaven/bluebird/source/build_bluebird.py
```

可在命令末尾加 `-- 01_exterior 02_ground_cutaway` 限定渲染相机。源文件采用系统 Georgia 字体；跨平台重建时可将脚本中的字体路径换成已授权的本地衬线字体。交付文件内招牌和字样在 GLB 中为网格，不依赖浏览器字体。

## 独立 Three.js 检查页

`viewer.html` 提供旋转、缩放和三种切层视图。先运行 `python3 assets/grayhaven/bluebird/source/prepare_viewer.py`，从项目现有 Three.js 安装中复制查看器所需的六个模块到隔离的 `viewer-vendor/`；无需联网安装新依赖。然后只服务本资产目录：

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory assets/grayhaven/bluebird
```

浏览器打开 `http://127.0.0.1:8765/viewer.html`。此页是资产检查工具，不是游戏 UI；Three.js 灯光与 Blender 检查灯光分别设置，因此两者不是逐像素一致的画面。
