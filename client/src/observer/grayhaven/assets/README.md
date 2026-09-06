# Grayhaven 静态绘画素材

生成日期：2026-09-06。使用内置 imagegen（builtin 模式），开发时一次性生成；页面运行时只加载仓库 PNG，不调用生成服务。未使用《Life is Strange》原作贴图。

| 文件 | 格式 | 用途 |
| --- | --- | --- |
| coastal-materials-v1.png | 1254 × 1254，RGB | 四等分：左上木板、右上瓦片、左下岩层、右下草地与干土 |
| redwood-studies-v1.png | 1254 × 1254，RGBA | 四种具有透明背景的红杉，四等分，按左上、右上、左下、右下读取 |

加载器 painterlyArt.ts 将每个象限采样为独立的 512 × 512 CanvasTexture，隔离 mipmap 边缘串色。墙面、屋顶、岩层和地表共用纹理；树木使用 alphaTest 和实例化贴片，适用于当前固定方向、可平移缩放的正交相机。树木不支持任意绕视。

地表以大范围顶点色为主，材质着色器降低笔触对比；并未给整个画面添加噪点或像素化滤镜。8 张 RGBA8 纹理含完整 mip 链的估算为 10.67 MiB，不包含阴影贴图、几何、帧缓冲或驱动开销。纹理加载失败时保留地点目录和文本阅读。

## 素材生成原始提示词

### coastal-materials-v1.png

Use case: stylized-concept. Asset type: production-ready 2x2 square texture atlas for a hand-painted 3D environment, full bleed 1536x1536 or 1024x1024. Four exactly equal square quadrants meet at the horizontal and vertical midpoint, absolutely no gutters, borders, captions or text. TOP LEFT: sun-faded off-white painted horizontal clapboard wood, large subtle dry-brushed patches, sparse thin irregular board seams, neutral cream gray. TOP RIGHT: weathered slate roof, muted neutral gray overlapping wide shingle rows, hand-painted with large simplified brushwork. BOTTOM LEFT: rough coastal rock, broad warm gray and gray violet painted stone planes and stratified horizontal dry pastel marks, no deep black cracks. BOTTOM RIGHT: muted sage grass and pale dry soil, abstract large organic patches with sparse directional dry-brush scumbling, no individually drawn grass blades. STYLE: restrained powdery gouache and soft wax pastel feel, subtle coarse dry-brush breaks and underpainting, low to moderate contrast and saturation, genuine intentional painterly albedo material art, not photographic, not noise-filtered. Each square a flat orthographic seamless repeating material sample, fill square fully edge to edge; surface colors neutral and fairly light to allow 3D tinting. Ambient even illumination, no cast shadows, no directional highlights, no objects, no perspective, no frame, no writing, no watermarks, no glossy relief, no dense visual noise. Grayhaven 1985 northern California coast art direction: credible surfaces simplified into broad tactile color shapes.

### redwood-studies-v1.png

Use case: stylized-concept. Asset type: transparent PNG 2x2 sprite atlas of four mature northern California coast redwood trees for a painterly 3D world map. Square canvas, four equal cells. EXACTLY one complete tree per cell, each tree including trunk and foliage fully contained within its quadrant with 6% clear transparent padding on every side. Background genuinely transparent, including spaces between branches. NO ground, NO roots extending sideways, NO cast shadows, NO labels, NO text, NO frame. Four variants: upper left tall narrow irregular coastal redwood with layered lateral branches and a clearly visible lower trunk; upper right fuller mature asymmetric canopy with tufted irregular branch ends; lower left tall sparse windswept tree with broken lower branches; lower right shorter young redwood with loose rounded branching clumps. Realistic botanical proportions but simplified broad color masses. IMPORTANT avoid geometrically perfect triangular silhouettes or stacked cones, avoid Christmas trees. Foliage should appear hand-painted with opaque muted sage green and blue-green gouache color patches, dry wax-pastel edges and coarse expressive broken brushwork, airy small negative spaces, tiny branches understated. Trunks weathered warm gray reddish brown. Subtle form shading but neutral diffuse lighting, no hard directional light or baked sunlight. Calm impressionistic realism, atmospheric Pacific coast, low saturation, lighter midtones so tree textures stay readable in a game, no photographic needle details, no outline, no black voids. Orthographic front view, parallel vertical trunks, view very slightly from above appropriate for a world overview game camera.

