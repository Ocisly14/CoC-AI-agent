# Grayhaven 物体级剖切设计

替代 `depthReveal.ts` 的屏幕空间椭圆羽化透视。放大到一个小场景时，按物体语义隐藏挡住视线的东西：建筑的外壳、屋顶与正对相机的上半段墙，户外近景前方的树。不再靠像素规则猜哪些表面该消失。

## 1. 背景

沙盘用固定朝向的正交相机（`OrbitControls.enableRotate = false`），只允许平移与缩放。现有第四版透视在每个材质的片元着色器里叠加屏幕椭圆距离场与视深阈值，用稳定抖动丢弃像素，并额外绘制一遍反向深度的底层保留通道；靠 `userData.revealProtected` 名单保护地板、家具、灯具与林下物件。它的问题：

- 隐藏与保留由像素位置和深度决定，与物体是什么无关，所以每次调整都要维护保护名单、羽化参数和两遍绘制的状态恢复。
- 羽化是覆盖率抖动，不是连续透明，始终有颗粒。
- 所有场景材质都被打补丁，烘焙与拾取都要绕开它。

相机朝向固定意味着"正对相机的墙"对每栋建筑是一个静态集合，可以用外法线与相机前向的点积一次判定。室内模型已经把每片墙拆成矮墙台与上半段，`bluebirdWalls()` / `sheriffWalls()` 为每片外墙记录了法线与楼层，物体级剖切需要的数据已经存在。

## 2. 目标与非目标

目标：

- 进入任一建筑室内时，隐藏该建筑外壳、屋顶与正对相机的上半段外墙，以及到顶的室内隔断；远侧外墙、矮墙台、地板、家具、灯具保留完整深度。
- 放大到红杉环、海滩这类已建模的户外近景时，隐藏挡在观察中心前方的树；树桩与根撑保留。
- 删除屏幕空间透视：着色器补丁、两遍绘制、保护名单、拾取椭圆判定、烘焙包裹。
- 蓝鸟餐馆与警长办公室一视同仁，契约是数据标签，不是接口。

非目标：

- 不做半透明幽灵墙，不做淡入淡出，不改相机投影或开放旋转。
- 不剖切相邻建筑，不剖切岸边构筑物。
- 不改现有的室内开合逻辑（投影尺寸滞回、预取、200 ms 候选、返回街景）。
- 不改树冠光斑遮罩的生成方式。

## 3. 剖切目标

控制器每帧接收一个目标或空：

| 目标 | 条件 | 足迹 |
| --- | --- | --- |
| 室内 | `interiorState.status === 'open'` | 当前建筑外壳的局部包围盒（`BLUEBIRD` / `SHERIFF` 尺寸）经建筑矩阵变换 |
| 红杉环 | 选中 `SCN_redwood_ring`，或未选中且镜头中心距 `REDWOOD_VIEW` 35 单位内；且缩放达到阈值 | 中心 `REDWOOD_VIEW`，相机平面半径 38 × 29 |
| 海滩 | 选中 `SCN_dock`，或未选中且镜头中心距 `BEACH_VIEW` 35 单位内；且缩放达到阈值 | 中心 `BEACH_VIEW`，相机平面半径 38 × 28 |
| 空 | 其他情况 | 一切复原 |

户外缩放阈值是滞回的瞬间切换：`zoom >= 3.8` 开，`zoom <= 3.2` 关，中间保持上一状态。室内目标不看缩放，开合仍由 `cutawayDecision` 决定。

目标变化、楼层变化或相机朝向变化时重算；同一目标内每帧零开销。

## 4. 建筑规则

### 4.1 外壳

室内目标生效时，控制器把 `target.exterior.visible` 设为 false；目标解除、`suspend` 期间和 `dispose` 时恢复。`closeInterior` 仍把两栋外壳设回可见，两者幂等。这恢复了第三版以前的做法。阴影壳（`createBluebirdShadowShell` / `createSheriffShadowShell`）不变，街上的建筑影子与室内地板上的投影照旧。

### 4.2 墙的标签契约

室内模型里任何 `Object3D` 可以挂两种标签之一：

- `userData.cutawayNormal: [x, y, z]`：建筑局部坐标的外法线。控制器把它按建筑根节点的四元数转到世界坐标，与相机前向做点积，`dot < 0` 即正对相机，隐藏；否则可见。
- `userData.cutawayPartition: true`：到顶的室内隔断。无论朝向，剖切激活时一律隐藏。一片隔断总有一侧挡住某个房间，按房间判定是过度设计。

没有标签的对象永不被控制器碰。矮墙台、地板、家具、灯具、低隔断、楼梯栏杆都不打标签。上层楼板随现有 `setFloor` 隐藏，二层视图上方开天。

控制器在室内模型根节点下遍历一次收集带标签的对象并缓存；模型按需加载完成后立即 `registerInterior`，不等到首次成为目标。

### 4.3 两栋建筑的落点

蓝鸟餐馆（`bluebirdInterior.ts`）：每层的上半段外墙现在都进 `walls[floor]` 一个组按材质合并。改为按外法线分四个侧组，每个侧组挂 `cutawayNormal`。餐厅与后厨之间、二层客厅与卧室之间的隔断都只有 1 单位高，不打标签。按蓝鸟当前朝向计算，隐藏的是卡座窗那面（局部 −x）和后厨后墙（局部 −z），街面墙与右墙留作背景。

警长办公室（`sheriffInterior.ts`）：`sheriffWalls()` 的高墙部分按外法线分四个侧组，挂 `cutawayNormal`；`partition()` 生成的三段前厅隔断高墙和办公室与拘留室之间 x = 0 的分隔高墙放进一个隔断组，挂 `cutawayPartition`。绿色护墙板与踢脚线部分不动。剖切后整层只剩两面远侧外墙、地板与所有隔断的护墙板，是标准的娃娃屋视角。

`interiorLighting.material()` 的第四个参数 `revealOccluder` 与 `revealProtected` 标记一并删除；上半段墙与矮墙台共用同一材质。

## 5. 树木规则

### 5.1 判定

树用基点 `base` 与高度 `height` 描述。把目标足迹的八个角点与树的线段（`base` 到 `base + height · up`）都变换到相机视空间；正交相机下视空间 XY 就是相机平面上的世界单位，与缩放无关，减去目标中心后与平移也无关。

一棵树被隐藏当且仅当同时满足：

1. 在前方：`depth(base) < depth(center) − 2`，深度取视空间 −z。
2. 挡住：树线段的视空间 XY 包围盒与目标足迹的视空间 XY 矩形相交。

红杉环上半径与中心同深的巨树既不在前方也不在后方，判定为保留，作为背景。这条规则对室内目标同样生效，镇边树若挡在建筑前也会隐藏。

因为判定与缩放、平移无关，每个目标的隐藏集合只算一次并缓存，直到目标或相机朝向变化。

### 5.2 森林实例

`buildForest()` 里的四类 `InstancedMesh`（三种贴片树、巨杉躯干与树冠、镇边树）向控制器登记：`registerInstanced(mesh, trees: { base, height }[])`。控制器保存一份原始 `instanceMatrix` 数组；隐藏时对相应索引写零缩放矩阵，恢复时写回原矩阵，两者都置 `instanceMatrix.needsUpdate`。零缩放的实例不产生片元，也不产生阴影。

红杉环场景（`redwoodRingScene.ts`）的枝桩实例批次通过 `mesh.userData.cutawayInstances`（与实例索引对齐的 `{ base, height, radius }` 数组）登记，基点与高度取所属巨树；根撑批次不登记。

### 5.3 红杉环巨树

`trunkGeometry()` 在 3 单位高处拆成树桩与上段两份几何。树冠、上段树干、枝桩挂 `userData.cutawayTree: { base, height }`（`base` 为世界坐标，红杉环根节点位于原点），控制器按 5.1 判定后切 `visible`。树桩、根撑、烧空树洞的拱门不挂标签，等同树的矮墙台，红杉环的形状仍可辨认。`redwood-trunk-N` 名字保留在上段；18 个树桩合并成一个不带标签的网格 `redwood-trunk-stumps`，避免多出 18 个绘制调用。

`protect()` 材质副本删除；林下物件与地面贴片不再需要保护材质。

### 5.4 海滩

海滩没有树在前方时判定自然为空。岸边构筑物低矮，不参与剖切。

## 6. 阴影与烘焙

隐藏的树连同影子一起消失，空地被阳光照到，读作掀开树冠。建筑保留阴影壳，因为那是既有设计。

反弹光烘焙 `bakeBounce` 用场景材质渲染，若在剖切激活时烘焙会缺掉隐藏的树。控制器提供 `suspend(fn)`：复原全部隐藏、执行 `fn`、重新应用。`bakeStatic` 用覆盖材质，不受影响，但同样用 `suspend` 包裹以保持一致。这两处原来是 `depthReveal.withoutReveal`。

树冠光斑遮罩按全部树生成，不随剖切变化。已知局限，影响轻微。

## 7. 拾取、雾、标签

- 拾取：删除 `depthReveal.contains` 判定。室内开启时直接对 `activeModel.hits` 中当前楼层的拾取盒射线；外壳隐藏后其地点拾取盒被现有的 `parent.visible` 过滤排除。远侧墙在房间后方，不会挡住物件。
- 海雾：`seaMist.render` 的 `drawScene` 回调参数删除，恢复 `renderer.render(scene, camera)`；室内体积排除不变。
- 标签：不变。

## 8. 模块与接口

新增 `client/src/observer/grayhaven/cutaway.ts`：

```ts
// 纯函数，可单测
export function facesCamera(localNormal: Vector3, rotation: Quaternion, forward: Vector3): boolean;
export function treeOccludes(tree: { base: Vector3; height: number }, footprint: Footprint, view: Matrix4): boolean;
export function outdoorCutawayActive(zoom: number, previous: boolean): boolean; // 3.8 开 / 3.2 关
export type Footprint = { center: Vector3; corners: Vector3[] }; // 世界坐标
export function boxFootprint(transform: Matrix4, halfExtents: Vector3, center?: Vector3): Footprint;
export function discFootprint(center: Vector3, radii: Vector2, camera: Camera): Footprint;

// 控制器
export function createCutaway(): {
  registerInstanced(mesh: InstancedMesh, trees: { base: Vector3; height: number }[]): void;
  registerTrees(root: Object3D): void;      // 收集 userData.cutawayTree 与 userData.cutawayInstances
  registerInterior(root: Object3D): void;   // 收集 cutawayNormal / cutawayPartition
  setTarget(target: CutawayTarget | null, camera: Camera): void;
  suspend<T>(fn: () => T): T;
  dispose(): void;
};
export type CutawayTarget =
  | { kind: 'interior'; root: Object3D; exterior: Object3D; footprint: Footprint }
  | { kind: 'outdoor'; id: string; footprint: Footprint };
```

`GrayhavenWorld` 的改动：

- 字段 `depthReveal` 换成 `cutaway`；`buildForest` 与红杉环加载后登记；室内模型加载后 `registerInterior`。
- `revealTarget()` 改名 `cutawayTarget()`，返回 `CutawayTarget | null`，逻辑对应第 3 节；户外滞回的上一状态保存在 `GrayhavenWorld` 的一个布尔字段里，`outdoorCutawayActive` 本身是纯函数。
- 控制器缓存上次的目标身份与相机四元数，两者都未变时 `setTarget` 直接返回。
- 渲染循环：`cutaway.setTarget(this.cutawayTarget(), this.camera)`，最后 `this.seaMist.render(renderer, scene, camera)`。
- 外壳显隐归控制器：应用室内目标时隐藏 `target.exterior`，解除时恢复；`closeInterior` 仍把两栋外壳设回可见。
- 两处烘焙用 `cutaway.suspend` 包裹。
- `pointerUp` 去掉椭圆判定。

删除：`depthReveal.ts`、`depthReveal.test.ts`、`buildingInteriors.ts` 的 `interiorRevealTarget` 与 `RevealTarget` 引用、`interiorLighting.ts` 的 `revealOccluder` / `revealProtected`、`redwoodRingScene.ts` 的 `protect()`、`docs/superpowers/plans/2026-09-07-grayhaven-elliptical-reveal.md`。

README 新增章节"物体级剖切（2026-09-06，替代椭圆羽化透视）"，并在警署室内一节把"椭圆深度显露"改为指向新章节。

## 9. 测试

`cutaway.test.ts`（算法逻辑）：

- 朝向判定：用测试里已有的相机位姿与建筑旋转 1.4988，四个外法线里恰好两个判为正对相机；旋转建筑 180° 后另外两个。
- 树遮挡：前方且相交隐藏；后方相交保留；前方不相交保留；同深保留；缩放 1 与 6、平移前后结果一致。
- 滞回：3.5 保持上一状态，3.8 开，3.2 关。
- 控制器：`registerInstanced` 后设目标，被判定的实例矩阵为零，恢复后与原矩阵逐项相等；`suspend` 内全部复原、抛错后仍重新应用；`registerInterior` 隐藏带 `cutawayNormal` 的正对组与全部 `cutawayPartition`，未标签对象可见性不变；目标置空后一切复原。

改现有测试：

- `buildingInteriors.test.ts`："keeps floors and props solid while upper walls remain revealable" 改为检查每层上半段墙分在四个带 `cutawayNormal` 的侧组，地板与家具无标签。
- `sheriffInterior.test.ts`：高外墙四个侧组带 `cutawayNormal`，隔断组带 `cutawayPartition`，护墙板无标签。
- `cutawayNavigation.test.ts`：去掉 `interiorRevealTarget` / `projectedRevealEllipse`；`revealTarget()` 改为 `cutawayTarget()`，断言室内 `closed / loading / error` 时为空，红杉环选中且缩放 4 时为户外目标。
- `redwoodRingScene.test.ts`：每棵巨树的上段与树冠带 `cutawayTree`，合并的树桩网格与根撑不带，枝桩实例批次带 `cutawayInstances`；不再断言受保护材质。

## 10. 验证

```sh
pnpm exec vitest run client/src/observer/grayhaven
pnpm --dir client exec tsc --noEmit --target ESNext --lib DOM,DOM.Iterable,ESNext --module ESNext --moduleResolution Bundler --skipLibCheck --resolveJsonModule --allowSyntheticDefaultImports --jsx react-jsx src/observer/grayhaven/GrayhavenWorld.ts
node scripts/export-grayhaven-site.mjs <临时目录>
pnpm --dir client exec vite build <临时目录> --config <临时目录>/vite.config.mjs
git diff --check
```

验收条件：

- 进入餐馆一层：外壳消失，卡座窗墙与后厨后墙的上半段消失，街面墙与右墙完整，矮墙台、地板、柜台、卡座、吊灯可见；二层同理且上方开天。
- 进入警署：两面远侧外墙留下，三段前厅隔断与办公室拘留室分隔只剩护墙板。
- 红杉环放大到 3.8 以上：近侧巨树只剩树桩与根撑，远侧巨树完整，火塘、朽木、树洞拱门可见；缩回 3.2 以下全部恢复。
- 返回街道与全景：外壳、墙、树全部复原，没有残留。
- 调时间滑块触发烘焙时剖切状态不变，烘焙结果与未剖切一致。
- 控制台无 error / warn。

浏览器视觉验收按用户要求另行安排。

## 11. 已知局限

- 树冠光斑遮罩不随剖切变化。
- 相邻建筑若挡住目标不会被剖切，这是布局问题。
- 隔断一律隐藏，不按选中房间保留远侧隔断。
