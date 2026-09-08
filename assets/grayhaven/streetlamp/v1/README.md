# 灰港 · 繁荣年代铸铁路灯

按照巡回派美术指导完成：先用可信构造、旧灰绿漆与少量自然锈蚀建立完整基础版，再叠加四处相近色的宽笔触。叠加位于底座、上段灯柱、灯罩下框及灯帽；保持大部分底纹，玻璃、灯泡与金属螺栓不参与叠色。

## 交付文件

- [可编辑基础版](streetlamp-base.blend)：原始基础图、0.6×0.6 米材质映射、独立构件保留。
- [可编辑油画分层版](streetlamp-layered.blend)：CastIron 材质中的 `Oil overlay enabled` 值为 0 时恢复完整基础层，为 1 时显示四处叠色。各笔触的中心、尺寸、角度、色彩与强度仍可编辑。
- [油画版 GLB](streetlamp-painted.glb)、[基础版 GLB](streetlamp-base.glb)：13 个网格、8,752 个三角形，烘焙颜色内嵌。两版顶点、法线、UV 与有向三角形一致。
- [基础源图](textures/cast-iron-base.png)、[独立透明笔触源图](textures/quiet-pigment.png)。笔触已检查真实 alpha，不含伪透明棋盘格。
- [基础色图集](textures/iron-base-atlas.png)、[叠色图集](textures/iron-painted-atlas.png)：2048×2048，sRGB。
- [独立油画遮罩](textures/oil-overlay-mask.png)：2048×2048，线性数据，表示四处叠加的有效强度；源笔触 alpha 及节点仍保留。

## 构造与尺度

总高 3.92 米，底座法兰 0.48×0.48 米，灯帽宽 0.67 米。细柱带十二道铸槽，底座有浅铸花、检修盖与固定螺栓；方灯罩包含独立玻璃、边框和中梃、折边灯帽、灯泡与灯座。灯帽厚度、边框、叶片与接触关系通过几何表现，细小磨损留给贴图。

Blender 使用米制、Z 向上；GLB 导出为 Y 向上，原点在底座中心的地面位置。底漆通过路灯局部坐标按实际米制映射；GLB 使用独立、不重叠的 DeliveryUV。移动模型不会让油画色块滑动。基础漆与锈均按非金属表面处理，露出的螺栓独立采用金属响应；玻璃为半透明材质。没有从油画颜色推算法线，也没有把预览灯光烘入基色。

`Construction • individual cast parts` 隐藏集合保存独立构件，用于结构编辑；可见 CastIron 是烘焙和导出用合并体。修改构造后应运行重建脚本重新展开和烘焙，不能假设两个集合自动同步。

## 模组依据与预览位置

来源为 `testmods/grayhaven/Grayhaven_Scenarios/ROAD_main_street.json` 的 `item.main_street.street_lamp`：主街北口最老的铸铁路灯，灯柱保留繁荣年代的铸花。具体外形、尺寸属于本次美术设计。没有把模组中的偶发闪烁编造成固定动画。

Godot 的蓝鸟街景截图只用于检查尺度与颜色，在餐厅附近临时摆放样品；没有改写模组北口位置，也未永久修改蓝鸟默认场景。

## 实际验证

[白模正面](previews/01-white-front.png)、[侧面](previews/02-white-side.png)、[顶视](previews/03-white-top.png)校核形体；[完整基础版](previews/04-base-full.png)与[油画版](previews/06-painted-full.png)采用相同机位、灯光、曝光。[灯罩](previews/07-painted-lantern.png)、[底座叠色](previews/08-painted-base.png)与[基础底座](previews/09-base-detail.png)可近看露底和跨铸花／检修盖的连续性。

Blender 5.2.1 的 Cycles 已实际渲染。Godot 4.7.2 / Forward+ / Apple M5 已检查导入、纹理 mipmap、基础／叠色切换、灯泡与真实局部光源昼夜开关，并保存街景尺度预览。详见 [GPU 报告](../../../../godot-client/demos/streetlamp/qa/validation.json)和[导出审计](source/export-validation.json)。未测试行走碰撞、LOD 性能或蓝鸟自定义油画管线的局部灯照明；夜间灯照在独立标准材质预览场景验证。

## 重建与使用

图像源通过内置 image_gen 制作：[基础提示词](source/base-prompt.txt)、[笔触提示词](source/pigment-prompt.txt)。本地执行下面两步，先基础后叠加：

```sh
Blender --background --python assets/grayhaven/streetlamp/v1/source/build_streetlamp.py
Blender --background --python assets/grayhaven/streetlamp/v1/source/build_streetlamp.py -- --paint
python3 assets/grayhaven/streetlamp/v1/source/verify_exports.py
```

Godot 可实例化 `res://demos/streetlamp/streetlamp.tscn`。独立预览：

```sh
Godot --path godot-client --scene res://demos/streetlamp/preview.tscn
```

按 **1 / 2** 对照基础与油画层，**L** 切换白天／夜间，方向键转向、滚轮缩放。局部光源默认关闭；游戏逻辑可调用 `set_night(bool)`，外观可调用 `set_painted(bool)`。未接入自动时间或模拟状态。
