# Grayhaven 椭圆羽化透视实现计划

## 目标与方案

在现有材质 shader 中叠加屏幕空间椭圆距离场和观察目标前方的深度判断。
放大时透视范围随目标投影扩大，中心露出内部，外缘用 smoothstep 羽化；
椭圆之外保持完整场景。沿用现有深度缓冲和下层保留绘制，不新增双视图或离屏合成。

## 实施步骤

- [x] 为 depthReveal 增加目标中心、椭圆半径、视口尺寸与展开强度；统一 CPU/GPU 数学定义。
- [x] 将径向羽化与深度覆盖率相乘，只处理椭圆内、观察目标前方的像素；保留阴影和烘焙隔离。
- [x] 室内中心使用房间/楼层的真实世界坐标，不使用为避让侧栏而偏移的 controls.target。
- [x] 室内成功加载后才开启；户外已建模的红杉环、海滩继续支持近景观察；没有内部数据的建筑保持外观。
- [x] 为室内内容和上部遮挡墙分离材质透视策略，保护地板、家具、低墙和灯具。
- [x] 让拾取与透视范围一致，避免点击椭圆之外被外壳挡住的室内物件。
- [x] 增加中心/边缘/外侧、深度保护、宽窄屏、缩放、加载及 shader 补丁回归检查。
- [x] 执行场景测试、定向类型检查、独立站构建和原生 GPU 羽化采样检查；完成本地预览。

## 实现约束

使用项目已安装的 Three.js 0.180.0。保持已有光照、雾效、阴影、底层保留和其他工作区修改。
羽化仍采用稳定的像素覆盖抖动以维护不透明深度写入，不能把它描述成连续 alpha 合成；
此方案可能残留细颗粒，避免用普通透明材质引入多层排序错误。
现有 Sites 发布工具要求明确的发布请求；本轮用户授权计划和实现，不更新线上版本。
椭圆统一使用渲染视口归一化坐标，按相机投影计算两个半径，避免窄屏/DPR 拉伸。
实现阶段先完成数学/控制器测试和原生 GPU 检查；随后用户明确要求视觉验收，浏览器检查与修复记录见文末。

## 验收

中心近景遮挡被移除；边缘覆盖率连续单调；椭圆外和目标后方完全保留。
全景与未加载/错误状态保持外观；房间内容不受前景裁切规则影响。
侧栏构图偏移、楼层切换和视口尺寸变化后，透视仍对准目标。
着色器编译、状态恢复、现有场景测试和生产构建通过。

## 参考

- Three.js Render Targets: https://threejs.org/manual/en/rendertargets.html
- Three.js Material / alphaHash: https://threejs.org/docs/pages/Material.html
- Khronos smoothstep: https://www.khronos.org/files/webgl20-reference-guide.pdf

## 完成记录

2026-09-07 已完成：

- `depthReveal.ts`：外侧 30% 的 smoothstep 羽化，目标投影中心与独立横纵半径，实际渲染视口坐标，展开强度阻尼；无目标时跳过下层保留额外绘制。
- `buildingInteriors.ts` / `GrayhavenWorld.ts`：房间真实中心与完整房间体积投影决定椭圆；室内加载成功才允许展开，手动构图使用独立缩放阈值，避免窄屏拟合后透视不出现。
- `interiorLighting.ts` / `bluebirdInterior.ts`：上部墙独立使用可透视材质；低墙、地板、家具与灯具保留完整深度。原有材质光照补丁、物件坐标与模型改动保留。
- 拾取使用同一归一化视口坐标，排除透视区域外的室内命中。
- 19 个场景测试文件共 82 项通过，定向 TypeScript 检查通过，独立站生产构建通过，`git diff --check` 通过。
- 原生 OpenGL 编译了实际透视补丁与展开后的 Three.js standard 片元；检查 5,595,480 个 framebuffer 像素，覆盖 640×480、390×844、1280×960、视口偏移、目标后方与关闭状态，0 项失败。羽化带的实测保留率约 0.055 / 0.322 / 0.681 / 0.946，中心为 0、外侧为 1。
- 独立构建位于 `/private/tmp/grayhaven-elliptical-reveal-site/dist`；实际浏览器视觉与设备帧率未验收。提供过本地预览，本轮没有更新线上版本。

## 验证命令

```sh
pnpm exec vitest run client/src/observer/grayhaven
pnpm --dir client exec tsc --noEmit --target ESNext --lib DOM,DOM.Iterable,ESNext --module ESNext --moduleResolution Bundler --skipLibCheck --resolveJsonModule --allowSyntheticDefaultImports --jsx react-jsx src/observer/grayhaven/GrayhavenWorld.ts
node scripts/export-grayhaven-site.mjs /private/tmp/grayhaven-elliptical-reveal-site
pnpm --dir client exec vite build /private/tmp/grayhaven-elliptical-reveal-site --config /private/tmp/grayhaven-elliptical-reveal-site/vite.config.mjs
```

GPU 探针使用临时脚本 `/private/tmp/probe-grayhaven-ellipse.mts` 导出真实 shader，
由 `/private/tmp/ellipse-gpu-probe.c` 在原生 OpenGL 编译、绘制并采样；这不能替代浏览器视觉验收。


## 浏览器视觉验收与修复（2026-09-07）

用户随后授权边做视觉验收边完善。在现有本地预览中实际点击、滚轮缩放、切换房间与楼层，并检查截图和控制台。

### 发现并修复

1. 餐馆外景使用实心盒体，其水平顶面与二层的木地板重合，出现条纹与虚假楼板残影。`exteriorWallGeometry` 保留四周侧墙、去除水平封盖；实际屋顶、室内地板和物理阴影壳保持各自职责。一层顶部残片与二层地板条纹消除。
2. 红杉环的地面和物件同样被通用深度规则裁切。为林下内容提供受保护的材质副本，保留共享光照补丁与实时 uniform；树干、树冠和大根枝仍参与透视。火塘、朽木与树洞实体可在放大后查看。
3. 红杉环大块地面贴片使用单中心三角扇，跨越斜坡时会与实际地形穿插。改成多圈采样网格，保留轻微不规则外缘。沿路的浅色步道仍保留，减少大块三角形地形穿插。

### 实际检查

| 场景 / 条件 | 观察结果 |
| --- | --- |
| 1440×900，堂座 / 后厨 / 二层 | 地板、柜台、桌椅可见；外景水平封盖残影消除；房间切换正常 |
| 390×844，二层含底部手记 | 房间保持在导航与手记之间；进入与切换可用 |
| 621×678，红杉环 | 透视保留林下物件；放大后火塘石圈、朽木可见；手记收在底部 |
| 21:00，海雾 100%，手机二层 | 灯光可见，室内仍可辨认，无雾效或 shader 报错 |
| 后厨画面点击铸铁汤锅 | 打开对应物件文字，拾取正常 |
| 返回街道 / 回到全景 | 完整外壳恢复，无残留透视孔洞 |
| 街景滚轮放大 / 缩小 | 自动开启室内，缩小后室内导航关闭并恢复外景 |
| 最终控制台 | 未记录 error / warn |

静止采样：621×678 红杉环中位约 16.7ms、P95 17ms；1440×900 后厨中位约 16.7ms、P95 18.5ms。仅代表本机当前浏览器与静止采样，未做其他浏览器、真实手机或长时间性能测试。

新增外壳射线、林下材质光照继承和贴片离地高度回归检查。84 项场景测试、定向类型检查与最终生产构建通过；最终构建资源 `index-2U7P_f5t.js`。羽化仍有稳定的像素覆盖颗粒，未改成额外双视图合成。本轮未发布线上。
