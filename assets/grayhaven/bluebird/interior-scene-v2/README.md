# 蓝鸟餐馆一层 · 整体粗笔触版

- 生成方式：内置 image_gen，对第一版进行风格编辑。
- 图片：`bluebird-ground-floor.png`，1536 × 1024，固定镜头静态合成场景图，非平铺材质或 UV 图集。
- 编辑输入：`../interior-scene-v1/bluebird-ground-floor.png`。
- 完整编辑提示词：`prompt.txt`。
- 用户确认第一版边界；本版保留构图与纯黑背景，加强整个室内的粗笔触、溢出色块、污渍和拖抹。所有绘画效果直接合入成图，不依赖运行时二次添加。
- 依据：模组 SCN_bluebird_dining.json、SCN_bluebird_kitchen.json；docs/art-direction/README.md 与巡回画派通用艺术指导。用户本轮的一次成型要求优先于既有独立绘画叠加流程。
- 视觉参考：《极乐迪斯科》室内截图 https://www.rpgfan.com/wp-content/uploads/2020/12/Disco-Elysium-Screenshot-029.jpg ，只参考空间及绘画表达，未作为源像素拼贴。
- 状态：已目视检查成图；属于场景贴图候选，生成细节与布局并非逐物件精确还原；未接入 Godot。
