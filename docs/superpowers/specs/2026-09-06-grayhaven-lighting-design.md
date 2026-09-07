# Grayhaven 光照设计研究：全局光照与阴影

日期：2026-09-06 · 状态：已按 `docs/superpowers/plans/2026-09-06-grayhaven-lighting.md` 实现，待验证 · 适用 `client/src/observer/grayhaven/` 的固定斜俯视正交沙盘

本文延续《Grayhaven 艺术风格指导》§7（光照、雾）与 §10（Three.js 落地）的约定，回答一个具体问题：**在现有 Three.js 大地图上，如何组织全局光照（间接光、环境遮蔽、反弹色）与阴影，使画面接近 2015 年初代《Life is Strange》的柔和有色光感。** 文中所有参数都是本项目的制作建议，不是原作的工程数值。

## 0. 结论

1. 现在的光照链路是"一个太阳 + 一盏均匀半球光 + 三盏点光 + 林冠遮罩 + 线性距离雾 + ACES"。它缺三样东西：**空间上变化的间接光**（哪里被遮挡、哪里有地面反弹）、**接触遮蔽**（建筑与树根不接地）、**有方向的天空光与反射**（暗部只有一种颜色）。这三样恰恰是原作靠预计算光照得到的"光感"来源。
2. 推荐路线是 **"世界光照图集"（World Light Atlas）**：利用相机固定、场景静态、正交投影这三个条件，在进入页面时从正上方烘焙一次"高度 → 天空可见度 → 地面反弹色"，运行时所有不透明材质按世界坐标 XZ 采样。它是现有 `CanopySunlight` 遮罩思路的推广，世界空间稳定，平移缩放不会闪烁，每片元只多三次纹理采样。
3. 天空改为**程序化渐变天空 → PMREM 环境贴图**，替代单一半球光，让暗部带有天空方向的冷色、朝阳一侧的暖色，同时给金属屋顶、玻璃和湿沙提供一致的反射。
4. 阴影保留单张静态太阳阴影图，但做三处修正：去掉 12% 的太阳漏光、悬崖参与投影、用 PCSS 得到"贴地处硬、离地处软"的接触硬化软阴影。只在同机位截图证明不够时，才考虑第二张跟随视野的细节阴影图。
5. **不推荐**屏幕空间 AO/GI（无 TAA 时平移抖动，树牌是平面，几何要画两遍）、浏览器内渐进光照贴图（地形 UV 是重复贴图，无法展开）、实时多次反弹 GI（正交静态沙盘不需要）。

## 1. 现状审计

依据 `GrayhavenWorld.ts`、`lighting.ts`、`waterDynamics.ts`、`architectureMaterials.ts` 读代码得出；本轮没有启动开发服务器做浏览器检查。

| 环节 | 现状 | 观察 |
| --- | --- | --- |
| 太阳 | `DirectionalLight`，`PCFSoftShadowMap`，桌面 3072 / 窄屏 2048，`shadowMap.autoUpdate=false`，只在切换预设时重绘（`GrayhavenWorld.ts:71-106`） | 阴影图覆盖整张地图（1240 × 1480 单位），光空间每纹素 0.40–0.48 单位。`shadow.intensity = 0.88` 让 12% 太阳直射漏进阴影，阴影因此偏暖、偏平，与"有色阴影"目标相反 |
| 天空 / 间接光 | 一盏 `HemisphereLight`（`fill` / `bounce` 两色，`GrayhavenWorld.ts:30`） | 全图每一点收到相同的天空色与地面色；没有遮蔽（巷子、屋檐下、树根与空地一样亮），没有局部反弹（沙滩旁的墙不会被沙色照暖） |
| 环境贴图 | 无 `scene.environment` | `MeshStandardMaterial` 的镜面项只来自太阳；金属屋顶、玻璃、湿沙的反射靠 `createOverviewGlazing` 的解析近似各自处理 |
| 林冠遮罩 | `CanopySunlight`：1024 世界空间 Canvas 遮罩，按太阳方向投影树冠，只调制太阳直射（`lighting.ts:35-123`） | 只挂在地面和道路材质上（`GrayhavenWorld.ts:193, 340`），建筑、崖壁、岩石、树牌本身不受林荫；`attach()` 覆盖 `customProgramCacheKey`，与 `lightPaintedFoliage` 的键互相覆盖，是潜在的着色器程序缓存冲突 |
| 投影体 | 地形投影；悬崖 `castShadow=false`（`GrayhavenWorld.ts:245`）；镇边树 `receiveShadow` 未开 | 夕照时崖壁不会把长影投到沙滩上，这是海岸落日最有辨识度的一笔 |
| 树 | 实例化手绘贴片，弯曲法线，`alphaTest` 参与阴影 | 贴片受光层次已有；缺根部接触暗部，缺林下相互遮蔽 |
| 雾 | 线性 `THREE.Fog`，颜色 = 预设 `sky`（`GrayhavenWorld.ts:814`） | 正交相机下视深与屏幕纵向几乎一一对应，距离雾退化成"上重下轻的屏幕渐变"，`.gh-film` 的 CSS 渐变又叠了一层同方向的暗角 |
| 色调 | `ACESFilmicToneMapping`，每预设独立曝光，无后处理合成器，MSAA + alpha-to-coverage | ACES 对高光去饱和且提升中调对比，与"粉质、低对比"的目标有张力；three 0.180 已提供 `AgXToneMapping` 可做同机位对比 |
| 局部灯 | 灯塔、小屋、码头三盏点光，两盏带局部阴影 | 与本文无冲突，保持 |

三处基础尺度换算（相机半高 262 单位，按 1280 × 720 记录）：

| 缩放 | 地面每像素 | 太阳阴影纹素在屏幕上的宽度（横切光向 / 顺光向，夕照） |
| --- | --- | --- |
| 100% | 0.73 单位 | 0.66 px / 1.5 px |
| 235%（选中地点） | 0.31 单位 | 1.5 px / 3.5 px |
| 340%（最大） | 0.21 单位 | 2.2 px / 5 px |

顺光向的拉伸来自太阳高度：午后约 48°（×1.34），夕照约 26°（×2.3）。结论：分辨率在 235% 以内够用，问题在阴影的**颜色、软硬和接触**，不在纹素数量。3072 阴影图约占 75 MiB 显存（RGBA8 深度打包 + 深度附件），保持"只在切换预设时重绘"是前提。

## 2. 原作证据与转译

沿用艺术指导的三级证据：**主创陈述**、**二手转述**、**本项目建议**。

| 等级 | 内容 | 来源 |
| --- | --- | --- |
| 主创陈述 | 概念艺术家 Edouard Caplain：游戏有两大主调，"one very warm, sunsety colors... and a dark one, blue-ish"；"the lighting was tweaked so we could have the banding we have in the concepts" | [80 Level 访谈，2016-03-03](https://80.lv/articles/life-is-strange-concept-artist-talks-about-art) |
| 公开事实 | 运行于改良的 Unreal Engine 3，复用了为《Remember Me》开发的光照与景深工具；贴图全部手绘，Michel Koch 称之为 "impressionistic rendering" | [Wikipedia：Life Is Strange (video game)](https://en.wikipedia.org/wiki/Life_Is_Strange_(video_game)) |
| 二手转述 | 据粉丝维基转述 Raoul Barbet 在 LiU Game Conference 2015 的发言：将 UE3 深度改造为 PBR 引擎；光照是视觉风格中最重要的部分，因此在简化画面的同时为光照使用高端技术；团队有三名专职光照艺术家 | [Life is Strange Wiki](https://life-is-strange.fandom.com/wiki/Life_is_Strange)。本次未核对原始录像，不作为事实引用 |
| 本项目推断 | 2015 年 UE3 项目的静态场景光照普遍依赖预计算（光照贴图 + 预计算遮蔽），柔和、有颜色、无噪点的间接光是这一工艺的典型结果 | 推断，非原作事实 |

从中提取四条可以转译到正交沙盘的原则：

1. **光第一，材质第二。** 表面已经简化为大色面，画面质量由光照组织决定。对应本项目：先解决间接光与阴影，再回头调材质。
2. **冷暖是两套间接光，不只是太阳颜色。** 暖的一侧来自阳光和被阳光照亮的地面反弹，冷的一侧来自天空。因此反弹色必须**随位置变化**（沙滩、街道、林地各不相同），且在阴影里消失。
3. **"色阶感"（banding）。** 受光面与背光面是两个清楚的色阶，边界柔和但存在；不是到处都是细腻渐变。对应：阴影边缘软但有形状，接触处有一道明确的暗带，中间调不要被泛光填平。
4. **不搬第三人称的镜头效果。** 景深、倒带时的双重曝光和屏幕粒子与全景地图无关，排除。

## 3. 目标与验收

在艺术指导 §12.2 的基础上，光照专项的通过标准：

| 检查 | 通过标准 |
| --- | --- |
| 接地 | 100% 与 235% 下，建筑基座、树根、码头桩、灯塔底部有连续的接触暗带；关闭太阳阴影后仍能看出物体贴地 |
| 有色阴影 | 午后阴影偏灰蓝，夕照阴影偏灰紫、朝光面的暗部带琥珀反弹，蓝调暗部不发黑；三预设材质身份不变 |
| 崖壁 | 夕照时崖壁向沙滩投长影，但暗面不是连续近黑切面（艺术指导 §4.3） |
| 软硬 | 屋檐投影远端变软、贴墙处清楚；林冠斑驳光只出现在太阳直射项 |
| 稳定 | 平移、缩放、拖动过程中无噪点游动、无阴影闪烁、无 AO 抖动；录 GIF 对比 |
| 成本 | 平移缩放不重绘阴影图；每片元新增采样 ≤ 3 次；新增纹理总量记入 `data-render-stats`，并在目标设备记录帧时间中位数与 P95 |
| 界面 | React DOM 文字不受任何画面处理影响 |

## 4. 全局光照方案比较

| 方案 | 做法 | 优点 | 代价与风险 | 结论 |
| --- | --- | --- | --- | --- |
| **A. 世界光照图集** | 进入页面时从正上方烘焙高度、天空可见度、地面反弹色；材质按世界 XZ 采样 | 世界空间稳定；运行时几乎零成本；与 `CanopySunlight` 同一模式；可直接表达"沙滩暖反弹、林地暗反弹" | 2.5D：一格一个高度，表现不了屋檐下、门廊内；墙面只得到随高度衰减的接触暗带；树以代理体参与烘焙 | **推荐** |
| B. 屏幕空间 AO（`GTAOPass`）± 屏幕空间 GI | 每帧法线/深度预通道 + 全屏采样 | 通用；对任意几何有效；three 0.180 的 GTAO 已支持正交相机 | 无 TAA 时平移出现噪点游动，违背运动检查；几何要画两遍（约 839 → 1700 次绘制）；树牌在深度中是一片薄板，AO 会在牌面与地面交界产生假晕 | 不采用；如需对照，可作为实验开关 |
| C. 浏览器内渐进光照贴图（`ProgressiveLightMap`） | 抖动阴影相机多帧累积到 lightmap | 真正的软阴影与遮蔽烘焙 | 需要每个网格有唯一 UV2；地形用世界坐标重复贴图，几十个建筑小盒子需要打包图集；每次切预设重烘数秒 | 不采用 |
| D. 实时 GI（体素锥追踪、SSGI、路径追踪） | — | — | 与静态正交沙盘不匹配，WebGL 下不稳健 | 排除 |
| E. 只调半球光 | 现状加参数 | 零改动 | 无法产生空间变化，接地问题不可解 | 不足 |

## 5. 推荐设计

### 5.1 世界光照图集（World Light Atlas）

**范围与分辨率。** 沿用 `CanopySunlight` 的世界范围 x ∈ [−430, 1120]、z ∈ [−1100, 950]（1550 × 2050 单位）。图集取 **1536 × 2048**，每纹素约 1 × 1 单位（正方形纹素），RGBA8 约 12.6 MiB，含 mip 约 16.8 MiB。建筑接触带宽 3–6 单位，对应 3–6 纹素，足以形成柔和暗带。

**通道。**

| 纹理 | 通道 | 内容 | 何时烘焙 |
| --- | --- | --- | --- |
| `atlas`（1536 × 2048，RGBA8） | R | 天空可见度（地面 AO），0 = 全遮蔽 | 进入页面一次 |
|  | G | 林冠太阳遮罩（迁移现有 `CanopySunlight` 的结果） | 切换预设时 |
|  | B、A | 占位（A 恒为 255） | — |
| `groundHeight`（768 × 1024，RGBA16F） | R | 地形高度，世界单位。实现时改为单独的半精度纹理：8 位打包在 3.5 单位的接触带内只有 3 级，会出现台阶 | 一次 |
| `bounce`（384 × 512，RGBA16F） | RGB | 被照亮的地面平均出射色（线性空间） | 切换预设时，在太阳阴影图重绘之后 |

**烘焙流程。**

1. **高度通道**：一台正上方的 `OrthographicCamera` 覆盖上述范围，用深度材质渲染所有静态不透明几何（建筑、码头、灯塔、岩石、地形、崖壁）。树牌俯视是一条线，不参与；改用按 `makeForestLayout()` 的位置、高度、宽度生成的实例化椭球代理体，仅对烘焙相机可见（`layers`）。
2. **天空可见度**：对高度图做一次全屏地平线遮蔽计算：12 个方位 × 8 步、半径约 20 单位，取各方位最大仰角，`skyVisibility = 1 − mean(sin(horizon))`。这是地形 AO 的标准做法，一次性开销在毫秒级。
3. **地形高度**：用 `elevation(x, z)` 在 CPU 填充，或单独渲染地形网格；与第 1 步分开，是为了在着色器里区分"地面"和"物体顶面"。
4. **反弹色**：用同一台烘焙相机按正常光照（太阳 + 阴影 + 天空）渲染场景到 384 × 512，再做半径约 10 单位的可分离模糊。它近似"一面墙或一个物体底面向下看到的平均亮度"。阴影里的地面反弹自然为零，夕照时朝光面前的地面把琥珀色反弹到背光墙上。

**材质接入。** 一个可组合的材质补丁（见 §6）替代 `CanopySunlight.attach`，挂到**所有**受光不透明材质（地面、道路、崖壁、岩石、建筑、码头、树牌）。伪 GLSL：

```glsl
vec2 atlasUv   = (worldPos.xz - uAtlasOrigin) / uAtlasSize;
vec4 atlas     = texture2D(uAtlas, atlasUv);
float ground   = texture2D(uGroundHeight, atlasUv).r;
float lift     = clamp((worldPos.y - ground - 1.0) / uContactHeight, 0.0, 1.0); // 0 贴地，1 高于接触带；1 单位余量吸收地形纹理插值误差
float ao       = mix(atlas.r, 1.0, lift * uContactFade);                       // 接触暗带随高度消失
float canopy   = 1.0 - atlas.g * uDapple * (1.0 - opening * .94);              // 现有林冠公式
vec3  bounce   = texture2D(uBounce, atlasUv).rgb * uBounceStrength;
float downward = 0.5 - 0.5 * worldNormal.y;                                    // 墙面 0.5，底面 1，顶面 0

directLight.color *= canopy;                       // 只作用于太阳直射（不变）
irradiance        += bounce * downward * ao;       // 与半球光同量纲加入间接漫反射
ambientOcclusion   = ao;                           // 走 three 自带的 aomap_fragment 路径，
                                                   // 同时得到 computeSpecularOcclusion
```

接入点：`#include <lights_fragment_maps>` 之后加反弹项；把 `#include <aomap_fragment>` 换成同样逻辑但用 `ao` 代替 `aoMap` 采样，这样 `indirectDiffuse` 与 `indirectSpecular` 的遮蔽都由 three 现有代码完成。`lights_fragment_begin` 中对 `getDirectionalLightInfo` 的替换保持现状。

**2.5D 的边界要写明。** 一个 XZ 只有一个高度，所以：屋檐下、门廊内没有遮蔽；相邻两家店之间的巷子地面会变暗，但墙面只在离地 `uContactHeight`（建议 3–4 单位）内变暗；台地边缘的墙脚会得到略强的暗带。这些在当前最外层 LOD 的尺度下可接受，进入局部场景时另议。

### 5.2 程序化天空与环境贴图

用一个 64 像素每面的立方体渲染程序化渐变天空（天顶色、地平线色、朝太阳方向的暖光瓣、地面色），经 `PMREMGenerator.fromScene()` 生成 `scene.environment`，每个预设生成一次，约 1 MiB。作用：

- 间接漫反射有了方向：朝天面偏冷、朝太阳地平线一侧的暗部偏暖，替代单一 `HemisphereLight`。可保留一盏低强度半球光作为美术补光，但主量应来自天空。
- 镜面反射一致：镀锌屋顶、玻璃、湿沙、灯塔灯室读到同一个天空。`createOverviewGlazing` 可以继续用解析近似，也可以改为采样环境贴图；海面着色器独立，是否采样另议。
- 雾色与背景色直接取该天空的地平线色，三者不会再各自定义。

量纲提醒：three 的半球光辐照度直接进入 `irradiance`，而环境贴图辐照度是 `PI * envColor * envMapIntensity`。现有 `ambient: 1.35` 大致对应环境亮度 0.43，不能把数值直接搬过去，需要按 π 换算后再看图调整。

### 5.3 阴影

按收益排序，每一步都保持 `shadowMap.autoUpdate = false`。

1. **去漏光**：`sun.shadow.intensity` 从 0.88 改为 1.0。阴影的颜色由天空辐照度与反弹色提供，而不是漏进来的太阳。若阴影过暗，提高天空亮度，不回退到漏光。
2. **悬崖投影**：`cliff.castShadow = true`。崖壁网格是 `DoubleSide`，需要复核 `normalBias`，避免自遮挡条纹。镇边树打开 `receiveShadow`。
3. **PCSS 接触硬化软阴影**：以 three 官方 `webgl_shadowmap_pcss` 示例的方式替换 `shadowmap_pars_fragment` 中方向光的 PCF 块：先在阴影图上做遮挡物搜索（16 个泊松样本），由遮挡物与接收面的深度差估算半影宽度，再以可变核做 PCF（16–25 样本）。平行光下半影正比于"遮挡物到接收面的距离 × 光源角尺寸"，每预设一个 `penumbra` 参数：午后小、夕照大、蓝调最大。点光阴影不改。窄屏或低端设备回退到现有 `PCFSoftShadowMap`。
4. **可选的笔触边缘**：在采样阴影坐标前加一层世界坐标哈希噪声的微小偏移，让阴影边缘像干笔断口而不是像素直线。世界空间，平移不游动。放在 P2，先看 PCSS 后是否还需要。
5. **分辨率**：维持 3072 / 2048。只有在 235% 同机位截图证明夕照顺光向 3.5 px 纹素不可接受时，才加第二张跟随视野、纹素对齐、拖动结束后重绘的 2048 细节阴影图，并在同一补丁里取两图较暗值。three 自带的 CSM 插件已支持正交相机（`CSMFrustum.setFromProjectionMatrix` 判断 `isOrthographic`），但它默认每帧更新级联，并且直接覆盖全局的 `ShaderChunk.lights_fragment_begin`（`CSM.js:416`），会把林冠补丁所依赖的原始块换掉，故不作首选。
6. **烘焙顺序**：切换预设时先置 `shadowMap.needsUpdate = true`，再渲染反弹通道（这次渲染会顺带完成阴影图更新），再生成环境贴图。

### 5.4 雾

正交相机下距离雾只是屏幕纵向渐变，不表达空间。建议加**高度雾**表现湾内海雾：在 `fog_fragment` 中把线性雾因子与高度项合并，`fogFactor = 1 − (1 − distance)(1 − height)`，`height = uMist × smoothstep(uMistTop, uMistFloor, worldY)`。海面与湾底低地略含混、山脊清楚，`uMist` 跟随现有海雾滑块。默认强度要低（海平面约 15–25%），因为主街本身位于低地，不能为了雾牺牲街道可读性。艺术指导 §7.3 允许"少量局部雾层"，这不是体积雾，不加动画噪声。落地后重新评估 `.gh-film` 的 CSS 暗角是否还需要。

### 5.5 色调映射与后处理

- 在任何光照改动之前，先做一次 **ACES 与 AgX 的同机位对比**（three 0.180 提供 `AgXToneMapping`）。AgX 高光滚降更缓、色相偏移更小，更接近粉质色面；但切换会改变三个预设的观感，需要重调曝光。先定色调曲线，后面的所有调参才有意义。
- 仍不引入 `EffectComposer`。泛光只在蓝调的窗光、霓虹、灯塔上有意义，且要走多级模糊，放到 P2 单独评估。
- 正交相机看不到太阳，屏幕空间光束不成立；林间光束需要额外几何，暂不做。

### 5.6 预设参数的重新组织

`lightPresets` 在现有字段之外增加：`skyZenith`、`skyHorizon`、`sunGlow`、`envIntensity`、`bounceStrength`、`aoStrength`、`contactHeight`、`penumbra`、`mistTop` / `mistFloor`。原则不变：三预设共享全部材质，只改变光。`ambient` 在天空环境贴图接管后降为美术补光。

## 6. 工程落地

**文件。**

| 文件 | 职责 |
| --- | --- |
| `lightingPatch.ts`（新） | 可组合的 `MeshStandardMaterial` 补丁：每个补丁提供 `key` 与 `apply(shader)`，组合后 `customProgramCacheKey` 返回键的拼接。顺带修复 `lightPaintedFoliage` 与 `CanopySunlight` 互相覆盖缓存键的问题 |
| `worldLightAtlas.ts`（新，替代 `CanopySunlight`） | 烘焙相机、树代理体、高度/天空可见度/反弹三个通道、`update(preset)`、纹理释放 |
| `proceduralSky.ts`（新） | 渐变天空立方体、PMREM 生成、地平线色输出给雾与背景 |
| `softShadows.ts`（新） | PCSS 着色器块与回退开关 |
| `lighting.ts` | 预设扩展；`projectCanopy` 与弯曲法线保留 |
| `GrayhavenWorld.ts` | 建场后调用烘焙；`setAtmosphere` 按 §5.3 第 6 条排序；`data-render-stats` 记入新增纹理；`dispose` 释放 |

**测试**（只覆盖算法，不为薄封装写测试）：图集 UV 映射与边界；高度归一化与 `lift` 计算；天空可见度对简单台阶高度图的数值；预设不变量（蓝调反弹低于夕照、午后半影最小）；半球光到环境亮度的 π 换算。着色器仍按既有做法在本机 OpenGL 上做编译检查，不等同浏览器验收。

**实施顺序。** 每一步只改一类问题，保留同机位截图（午后 / 夕照 / 蓝调 × 100% / 235%）：

| 阶段 | 内容 | 判断依据 |
| --- | --- | --- |
| P0 | 色调映射 A/B；去漏光；悬崖投影；补丁组合层 | 三张同机位截图，无其他改动 |
| P0 | 图集 R/B 通道：接触遮蔽 | 建筑与树根接地；平移无抖动 |
| P0 | 反弹通道 + 程序化天空环境贴图 | 夕照背光墙出现琥珀反弹，午后暗部偏灰蓝 |
| P1 | PCSS | 屋檐远端软、贴墙清楚；帧时间 P95 变化记录 |
| P1 | 高度雾 | 山脊与湾底分层，主街仍清楚 |
| P2 | 笔触边缘、蓝调泛光、细节阴影图 | 仅在前两阶段截图证明需要时 |

**成本预算。** 新增纹理：图集约 16.8 MiB（含 mip）、反弹约 1.5 MiB、PMREM 约 1 MiB；阴影显存不变。载入时多两次场景渲染（高度、反弹）与一次全屏遮蔽计算，预计几十毫秒内；切换预设多一次反弹渲染与一次 PMREM。每片元新增两次采样与十余条算术指令；PCSS 在受阴影片元上增加约 32 次采样，是唯一需要在目标设备实测的项。

**风险。** 2.5D 限制（§5.1）；树代理体只是近似；换色调曲线要重调三套预设；PCSS 在集成显卡上的成本；着色器补丁之间的替换字符串冲突，必须通过组合层集中管理；程序缓存键必须唯一。

## 7. 待决定

1. 图集分辨率：1536 × 2048（约 1 单位 / 纹素，16.8 MiB）还是 768 × 1024（约 2 单位，4.2 MiB，接触带更糊）。建议前者。
2. 天空环境贴图接管间接光后，`HemisphereLight` 是保留为低强度补光还是移除。建议保留但降到辅助。
3. 高度雾是否进入本轮。建议进入 P1，但默认强度低。
4. 色调映射是否允许改为 AgX。建议先做 A/B，不预设结论。
5. 是否需要第二张细节阴影图。建议不做，等 235% 截图。

## 8. 来源

| 来源 | 使用方式 |
| --- | --- |
| [Edouard Caplain 访谈，80 Level，2016-03-03](https://80.lv/articles/life-is-strange-concept-artist-talks-about-art) | 主创陈述：两大冷暖主调、为色阶感调整光照 |
| [Wikipedia：Life Is Strange (video game)](https://en.wikipedia.org/wiki/Life_Is_Strange_(video_game)) | 引擎与手绘贴图的公开事实 |
| [Life is Strange Wiki](https://life-is-strange.fandom.com/wiki/Life_is_Strange) | 二手转述 LiU Game Conference 2015 发言，未核对原始录像 |
| [Three.js Color Management](https://threejs.org/manual/en/color-management.html) | 颜色链路 |
| 仓库内 `client/node_modules/three@0.180.0` 源码 | 核对 `AgXToneMapping`、`GTAOPass` 的正交相机支持、`CSMFrustum` 的正交分支、`aomap_fragment` / `fog_fragment` / `lights_fragment_maps` 的接入点、半球光与 IBL 辐照度的量纲 |
| [Grayhaven 艺术风格指导](./2026-09-06-grayhaven-art-direction.md) | §4 色板、§7 光照与雾原则、§12 验收 |

查阅日期：2026-09-06。原作参考只用于原则提取，没有导入任何游戏资产或参数。
