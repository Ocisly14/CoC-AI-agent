# Grayhaven 静态绘画素材

生成日期：2026-09-06。使用内置 imagegen（builtin 模式），开发时一次性生成；页面运行时只加载仓库 PNG，不调用生成服务。未使用《Life is Strange》原作贴图。

| 文件 | 格式 | 用途 |
| --- | --- | --- |
| coastal-materials-v1.png | 1254 × 1254，RGB | 四等分：左上木板、右上瓦片、左下岩层、右下草地与干土 |
| main-street-materials-v1.png | 1536 × 1024，RGB | 六种专用建筑材质，三列两行，详见下文 |
| redwood-studies-v1.png | 1254 × 1254，RGBA | 四种具有透明背景的红杉，四等分，按左上、右上、左下、右下读取 |

加载器 painterlyArt.ts 将每个象限采样为独立的 512 × 512 CanvasTexture，隔离 mipmap 边缘串色。旧图集保留给海岸、地表及非建筑木件，建筑使用下述专用图集；树木使用 alphaTest 和实例化贴片，适用于当前固定方向、可平移缩放的正交相机。树木不支持任意绕视。

地表以大范围顶点色为主，材质着色器降低笔触对比；并未给整个画面添加噪点或像素化滤镜。最初 8 张 RGBA8 纹理含完整 mip 链的估算为 10.67 MiB；加入建筑图集后共 14 张、18.67 MiB，不包含阴影贴图、几何、帧缓冲或驱动开销。纹理加载失败时保留地点目录和文本阅读。

## 素材生成原始提示词

### coastal-materials-v1.png

Use case: stylized-concept. Asset type: production-ready 2x2 square texture atlas for a hand-painted 3D environment, full bleed 1536x1536 or 1024x1024. Four exactly equal square quadrants meet at the horizontal and vertical midpoint, absolutely no gutters, borders, captions or text. TOP LEFT: sun-faded off-white painted horizontal clapboard wood, large subtle dry-brushed patches, sparse thin irregular board seams, neutral cream gray. TOP RIGHT: weathered slate roof, muted neutral gray overlapping wide shingle rows, hand-painted with large simplified brushwork. BOTTOM LEFT: rough coastal rock, broad warm gray and gray violet painted stone planes and stratified horizontal dry pastel marks, no deep black cracks. BOTTOM RIGHT: muted sage grass and pale dry soil, abstract large organic patches with sparse directional dry-brush scumbling, no individually drawn grass blades. STYLE: restrained powdery gouache and soft wax pastel feel, subtle coarse dry-brush breaks and underpainting, low to moderate contrast and saturation, genuine intentional painterly albedo material art, not photographic, not noise-filtered. Each square a flat orthographic seamless repeating material sample, fill square fully edge to edge; surface colors neutral and fairly light to allow 3D tinting. Ambient even illumination, no cast shadows, no directional highlights, no objects, no perspective, no frame, no writing, no watermarks, no glossy relief, no dense visual noise. Grayhaven 1985 northern California coast art direction: credible surfaces simplified into broad tactile color shapes.

### redwood-studies-v1.png

Use case: stylized-concept. Asset type: transparent PNG 2x2 sprite atlas of four mature northern California coast redwood trees for a painterly 3D world map. Square canvas, four equal cells. EXACTLY one complete tree per cell, each tree including trunk and foliage fully contained within its quadrant with 6% clear transparent padding on every side. Background genuinely transparent, including spaces between branches. NO ground, NO roots extending sideways, NO cast shadows, NO labels, NO text, NO frame. Four variants: upper left tall narrow irregular coastal redwood with layered lateral branches and a clearly visible lower trunk; upper right fuller mature asymmetric canopy with tufted irregular branch ends; lower left tall sparse windswept tree with broken lower branches; lower right shorter young redwood with loose rounded branching clumps. Realistic botanical proportions but simplified broad color masses. IMPORTANT avoid geometrically perfect triangular silhouettes or stacked cones, avoid Christmas trees. Foliage should appear hand-painted with opaque muted sage green and blue-green gouache color patches, dry wax-pastel edges and coarse expressive broken brushwork, airy small negative spaces, tiny branches understated. Trunks weathered warm gray reddish brown. Subtle form shading but neutral diffuse lighting, no hard directional light or baked sunlight. Calm impressionistic realism, atmospheric Pacific coast, low saturation, lighter midtones so tree textures stay readable in a game, no photographic needle details, no outline, no black voids. Orthographic front view, parallel vertical trunks, view very slightly from above appropriate for a world overview game camera.


### main-street-materials-v1.png

2026-09-06 建筑材质修订，内置 imagegen / builtin 模式生成。1536 × 1024，三列两行、每格 512 × 512；依次为涂漆横向搭接挂板、竖板压条、木瓦、镀锌波纹铁皮、深色卷材、未涂漆旧封板。原始输出已逐格目视检查；生成结果的板行数与提示词目标有差异，铺设尺寸按实际约 12 行挂板、9 行木瓦设置。每格独立提取，避免图集相邻材质串色；未进行像素级无缝边缘保证。

这六张纹理只用于建筑，不替换地形和树林。新材质按几何尺寸铺设，漆色由建筑配色控制；克制的凹凸响应与太阳光共同表达搭接。屋面方向按坡面法线或预制屋坡轴确定，竖直山墙单独使用挂板。新增六张 RGBA8 纹理含 mip 链约 8 MiB，全部艺术纹理共 14 张、约 18.67 MiB；招牌与光照遮罩另计。

原始完整提示词：

```text
Use case: stylized-concept
Asset type: production 3D game material texture atlas, physically tiled on actual architectural geometry.
Primary request: Generate exactly ONE landscape 3:2 texture atlas for a 1985 northern California coast historic wooden small-town commercial street. Image size preferred 1536x1024 or 3072x2048. Exactly 3 columns by 2 rows, all SIX tiles are equal squares touching edge to edge. Column boundaries exactly at 1/3 and 2/3 image width; row boundary exactly at 1/2 image height. No gutters, gaps, margins, borders, dividers, labels, or text.
Materials, exact reading order:
TOP LEFT: light neutral off-white PAINTED HORIZONTAL LAP SIDING. 16 thin overlapping horizontal courses per square tile. Flat broad painted surfaces, restrained edge wear, tiny cracks only, very light neutral paint to allow later tinting. NO thick barn planks.
TOP MIDDLE: neutral faded light painted vertical board-and-batten rear-wall siding. About 10 narrow vertical boards with slim battens, subtle age, no excessive grunge.
TOP RIGHT: weathered cedar WOOD SHINGLES in 14 staggered overlapping horizontal rows. Narrow irregular small wooden rectangles, clearly wooden shingle construction, silvery warm gray. NO stone, slate, or ceramic tiles.
BOTTOM LEFT: weathered galvanized corrugated sheetmetal roofing. 20 thin vertical ribs across this square tile, tiny dull zinc mottling, extremely sparse faded oxidation, medium neutral gray.
BOTTOM MIDDLE: dark charcoal mineral-surfaced rolled roofing / built-up flat roof. Restrained fine matte grain, subtle broad horizontal lap seams. NO shingles or tiles.
BOTTOM RIGHT: unpainted silver-gray rough-sawn boarding for shuttered shop windows. About 8 horizontal planks, modest wood grain, no paint.
Style/medium: consistent restrained painterly realistic game albedo throughout, Life is Strange inspired simplified brushwork, low noise and clear fine construction patterns. Not a photoreal photo texture. No heavy chalk mottling or exaggerated flaky distressing.
Composition and lighting: Every square is an individually seamless repeating texture, perfectly orthographic straight-on flat albedo, fully covering its square to all four edges. Even diffuse illumination, zero perspective, zero cast shadows, no strong directional shading, no vignette. Each individual tile's opposite edges must match to tile seamlessly. These are flat material swatches only.
Avoid: buildings, scenes, objects, windows, glass, letters, numbers, logos, watermark, borders, grout, thick chunky forms, dramatic shading. Preserve the precise six-square atlas layout.
```


### 树木透明边缘修复（2026-09-06）

截图中的问题树对应原树图集左下格：断梢加上稀疏叶簇，部分低透明度区域被原来的 0.38 裁切阈值去掉，使剪影呈现破碎木杆形态。该格停止参与树林分配，也不再加载到 GPU；保留左上、右上、右下三棵完整树形。

原 PNG 不修改。每格按原生 627 × 627 加载，取消压到 512 的步骤；放大采用线性采样，缩小使用三线性 mipmap。裁切阈值降为 0.12，并在现有 MSAA 渲染器上启用 alpha-to-coverage，以样本覆盖柔化透明边缘，保持不透明深度写入。森林与镇边树共用这一修正。GPU 纹理预算改按各贴图实际尺寸累加，目前共 13 张艺术纹理，约 19.33 MiB，招牌和光照纹理另计。

曾尝试通过内置 imagegen 修复图集，但返回图片没有真实 alpha，因此未采用或发布该输出；没有将棋盘格背景当作透明贴图使用。

### redwood-tapered-v1.png

2026-09-06，内置 imagegen / builtin 模式重新生成，替代旧树图集的运行时引用。新轮廓以中下部树冠较宽、向顶端逐步收窄为主，保留自然枝层与不对称。实际输出为 1254 × 1254 RGBA，每格 627 像素；选取左上、右上、右下三格。没有插值放大源文件。上部树冠与中下部树冠的逐行宽度中位数对比，三格的下部约为上部 3.0–3.4 倍（alpha ≥ 96，上部行 100–229，下部行 350–499）；此项用于检查剪影方向，不是植物测量标准。

透明背景有效，树干与主体叶簇的 alpha 峰值为 252，边缘存在低透明度像素；不是严格二值透明，也未达到提示词要求的 2048 分辨率和 5% 留白。当前不透明裁切加样本覆盖渲染能保留主体，使用原生尺寸及独立格采样。树干基部由图像中央区域 alpha ≥ 128 的最低有效行确定，按实例高度扣除底部透明留白。GPU 预算不变。本图已做素材目视和 alpha 数据检查，未执行浏览器视觉复核。

完整生成提示词：

```text
Use case: stylized-concept
Asset type: transparent tree sprite atlas for the Grayhaven website.
Create ONE NEW image: a 2048 x 2048 pixel PNG with a true RGBA alpha channel and genuinely transparent background. Arrange exactly four isolated coast redwood trees in a precise 2 x 2 grid of equal 1024 x 1024 cells, one complete tree per cell, with no visible cell boundaries. Each tree must stay fully inside a 5 percent margin of its cell; its fine top tip is around 5 percent of cell height and its root base around 95 percent. All four trees fill comparable height; each tree's widest canopy occupies approximately 55–65 percent of its cell width.

Subject and silhouette: four naturally irregular young to middle-aged Northern California coast redwoods. The LIVE CROWN IS BROADEST AT ITS LOWER THIRD and tapers progressively narrower toward a fine LEAFY growing tip. Longest branches are low in the live crown; medium-length branches are above these; upper branches are very short. This broad-low, narrow-top taper is the most important requirement. Conical overall, but organically irregular and slightly asymmetric, with dense overlapping painterly foliage masses and uneven natural branching rhythms. A modest amount of trunk is visible below foliage, only the bottom 15–20 percent of the tree. The narrow top is leafy and living. Do not make a bare leader or barren pole. Do not put wide horizontal branches high in the crown. No top-heavy umbrella-shaped crowns. No spreading flat canopy at the top.

Style: simplified hand-painted realism inspired by Life is Strange, broad readable foliage forms, nonpixelated, restrained diffuse internal shading, no directional sunlight or bright rim lighting. Low-saturation forest greens and sage greens, reddish gray-brown trunks. Each tree differs subtly in branching rhythm, green tint, and modest asymmetry while preserving the same broad-lower-crown to narrow-leafy-top taper. Trees should look like natural redwoods, not decorative Christmas trees and not geometrically perfect triangles.

Transparency and rendering: actual transparent PNG alpha outside every tree and inside clear branch gaps. Foliage interiors opaque; soft antialiasing only at silhouette edges. No painted checkerboard, no background color or scenery, no ground, no cast shadows, no borders, no text, no extra objects. Exactly four separate complete trees.
```


### sequoia-giants-v1.png

2026-09-06，内置 imagegen / builtin 模式生成的独立巨杉图集。与普通红杉分开加载、分批实例化；强调红褐色粗树干、纵向沟纹和外扩根基。实际为 1254 × 1254 RGBA，四等格各 627 像素；选用上排两棵，下排因树梢触及格边未启用。保留源文件，不做程序化抠图或放大。50.03% 像素完全透明；非零 alpha 中 74.61% ≥ 192，主体多为 249–252。已逐格目视及读取 alpha 检查，未达到提示词 2048 像素和 5% 留白，但上排剪影完整，可用于当前裁切渲染。

两张 627² RGBA8 纹理含 mip 链约增加 4 MiB；巨杉共 20 棵，其中两棵位于锯木厂两侧，其他分布在后方坡地。树干色不乘普通林木的偏绿调色。普通红杉素材保持不变。

完整生成提示词：

```text
Use case: stylized-concept.
Asset type: one transparent game sprite atlas, requested 2048 x 2048 pixel square RGBA PNG, arranged as a precise 2 x 2 grid of four distinct complete giant sequoia / redwood trees. This is a dedicated species atlas for 18 monumental giants around an old coastal sawmill.
Primary request: Four unmistakably massive giant sequoias, distinguished above all by their VERY THICK warm cinnamon / reddish-brown, deeply fluted trunks with massive flared buttressed bases. The stout exposed lower trunk occupies about 30 percent of total tree height. Trunk width at base is 14–18 percent of total tree height; canopy width is 40–55 percent of total tree height. Trunks remain visibly thick through gaps in foliage. Weighty lateral branches support dense large foliage masses. These must feel like ancient monumental giants, not enlarged skinny conifers or Christmas firs.
Silhouette: Tall full trees with soft leafy tips and an overall upward-tapering green crown: lower branches longer than upper branches. No upper horizontal umbrella or top-heavy crown, no bare or broken leader. Four subtly asymmetric distinct crown shapes and branch arrangements, with comparable tree heights and consistent viewing direction.
Style and texture: Natural painted realism, low-saturation Life is Strange environmental art feeling. Dense large painted moss-green foliage masses, readable at game scale, no noisy needle detail. Russet trunks contrast clearly with moss green crowns. Neutral diffuse form shading, no baked strong sunlight or cast shadows.
Composition: Each tree fully contained in one equal square quadrant, centered horizontally, with its tip at approximately 5 percent of cell height and root base at approximately 95 percent. Maintain at least 5 percent transparent padding within every cell; no element crosses a cell boundary. Every tree shows its full base and whole crown. No grid lines, visible gutters, labels, text, ground, grass, stones or other objects.
Transparency: GENUINELY TRANSPARENT BACKGROUND WITH REAL ALPHA CHANNEL. Outside the trees and in gaps between branches alpha must be zero, not painted white, gray or checkerboard. Foliage interiors and trunks should be near opaque with softly antialiased boundaries only. Output precisely one PNG atlas.

```


#### 按用户照片校正巨杉比例

用户随后提供了长直主干、高位树冠的仰视照片。以照片再次编辑图集的结果缺少真实 alpha，未导入项目。最终保留此图集的有效透明素材，在几何层拆为长直立体树干与顶部树冠：树干从图中主干中央采样一条纵向树皮区域，根部小幅外扩并伸入地面；树冠只使用原图上部，放在树高约上方三分之一，底边柔化以免出现裁切直线。没有修改原 PNG 像素。普通树林图集不变。

巨杉高度为 64–88 个场景单位，地上主干底部直径约为总高的 13%，树冠宽约总高的 28%–32%。树干是 12 段旋转曲面、两组实例；树冠是另外两组实例。光斑按高位树冠的高度与实际宽度计算，避免透明留白扩大阴影。此方案以可见形态接近参考照片为目的，不是对物种实际尺寸的测绘。
