# Bluebird · 屋顶相近色涂块

v6主要处理外墙与窗框，屋顶当时沿用原有基础贴图。本版在v6基础上补充上下两层屋面的油画涂块。

- [可编辑屋顶分层模型](bluebird_painterly_layered.blend)
- [烘焙Blender](bluebird_painterly.blend) / [完整GLB](bluebird_painterly.glb)
- [屋顶整体](previews/12-roof-field.png) / [同机位修改前](previews/before-12-roof-field.png)
- [整栋外观](previews/01-exterior.png) / [屋面细节](previews/04-roof-detail.png)
- [放置参数](source/placements.json) / [检查结果](validation.json)

屋面以原有炭灰色和材料纹理为基底，局部添加灰蓝、灰紫、灰橄榄和暖石墨色。用12处不同尺寸、倾角、轮廓和缺口组织画面，不把屋顶铺成彩色马赛克。保留大面积底色与接缝，局部涂块更明确、周围较安静。灯光、曝光和墙面成果沿用v6，区别来自表面绘画。

笔触通过XY坐标与屋面高度、朝上法线限定；与低矮泛水表面相交时连续投射，烟囱竖面和无关构件不被贯穿染色。未修改建筑几何。屋面使用既有BakeUV，三个屋顶构件只增加独立RoofBakeV7通道；保留所有旧UV。

输出一张4K屋面基色和一张2K泛水／构件基色，源模型保留原图及可编辑节点。这里的“分层”指新增屋顶层可编辑，原v6墙面仍以完成后的烘焙贴图保留；如需修改墙面笔触节点，使用相邻v6分层文件。世界投射源模型整体移动时需同步调整投射参数，烘焙交付模型则随UV附着。

本轮新增素材在 `../paint-effects-v2/`，内含完整提示词与来源。没有托管；预览为实际Cycles渲染，未测试浏览器性能。
