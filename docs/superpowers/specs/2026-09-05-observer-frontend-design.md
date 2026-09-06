# 观察者前端 — 设计

> 状态：设计已在 2026-09-05 的头脑风暴中逐节确认；已根据代码审阅补齐历史、鉴权、时钟与实时订阅契约，待实现。
> 范围：**只做观察者模式**。玩家模式不在本次范围内，但阅读栏的组件边界按"以后底部能挂一个动作框"来划。
> 线框图：主屏 https://claude.ai/code/artifact/3090864f-0384-448f-b11e-e6f7bb123614 ；阅读栏 https://claude.ai/code/artifact/75c3d55f-d56d-4736-95b3-21b759f8ec02 ；风格板 https://claude.ai/code/artifact/78e5f8d7-233c-4caf-992c-bfbe825113a3 。
> 线框图里顶栏写的"雷德利站"是早期草稿的说法，已在决定 11 中废弃；以线框图的布局为准，以本文的文案为准。

## 1. 背景与目标

后端是一个按分钟推进的 LLM 世界模拟：每个角色是一个自己感知、自己决定、自己写记忆的 agent；世界由代码引擎和 LLM 引擎共同推进。现有前端（`client/src/views/SimulationPage.tsx` 加 Phaser 镇景）是在旧架构上长出来的，呈现的是后端并不拥有的空间保真度，同时把后端最富的东西（文字）藏在侧栏里。

本设计从头定义观察者看到的界面。它的第一用户是**观察者兼实验员**：上帝视角看小镇里涌现的故事，随时切到某个人的眼睛看他所见所为，并能拨天气、投事件、注入角色。

**界面是通用的，不绑定任何模组的设定。** 引擎服务任何模组；界面的框架、命名、气质都不来自某个模组的故事。顶栏显示的是模组名，操作台就叫操作台。

与小镇时间的关系是**按真实分钟节奏运行，以已结算的游戏时间为准**。`SimulationRunner.enableRealTimeSync` 只在启用时对齐时分并保留游戏日期，之后每拍推进一个游戏分钟；暂停或慢拍会让它落后于墙上时钟。本版沿用这一推进方式，不跳过游戏分钟，也不新增加速追赶。观察者随时进来看最新已结算的世界，离开再回来先读"这期间发生了什么"。具体时钟与暂停规则见第 7 节。

## 2. 从后端形态推出的约束

这些不是偏好，是后端数据的形状决定的：

1. **世界是文本，不是坐标。** 场景、道路、物品、外貌、发生的事全是段落；地图是一张带步行分钟数的图。沙盘因此是**示意图**，人是**名牌**，不是瓦片地图和小人。
2. **世界已经是超文本。** 每段描述以 `[id]` 内嵌引用物品、地点、人物；角色能指向的只有段落里出现过的标签。前端把引用渲染成链接，导航结构不需要另行发明。
3. **信息不对称是核心玩法。** 同一分钟每个人读到的段落不同（清晰度 full / limited / trace）。前端呈现"某个人的视角"时必须忠实：只给他读到的，不补上帝视角。
4. **一分钟一拍，大多数拍是空的。** 一小时六十拍里只有几拍值得看。时间轴必须显示密度，没变化的分钟必须折叠。
5. **只有一个时钟。** 顶栏显示服务端已结算的游戏时间，不用浏览器墙上时钟推进；回看时显示所选历史时间。运行节奏与结算状态单独用状态文字表达。
6. **前端路径上不新增任何模型调用。** 摘要、密度、折叠、显著度全部由代码从落库记录推导。
7. **风格必须零美术成本。** 模组是任何人用 JSON 就能写的，风格不能要求每个地点出模型或图片；一切质感由程序从数据生成。

## 3. 主屏：大厅态

一屏四个区域，固定布局：

```
┌─ 顶栏：灰港镇 │ 1985-07-08 一 14:32 │ 雾 2/10 │ 14 人在镇 │ 2 人在路上 │ 运行中 │ 操作台 ▸ ────────┐
├─ 左栏 220px ────┬─ 沙盘（其余宽度）──────────────────────────────────────────────────┤
│ 自上次以来        │  手绘示意图：地点是节点，道路是手绘笔画，标步行分钟数                     │
│ 你离开了 3h12m   │  人是名牌，放在所在场景内；在路上的人按走到几分之几放在道路上              │
│ · 11:20 Priya …  │  最近 10 分钟有事的地点发亮；雾和昼夜是整张图上的一层水洗                  │
│ · 12:05 Marisol …│  点地点：右侧滑出该地点的当前段落（引用为链接）、在场的人、物品、出口         │
│ · 12:41 Earl …   │  点人：进入聚焦态（第 4 节）                                             │
├─ 时间带 ─────────┴───────────────────────────────────────────────────────────────────┤
│ 06:00 ······|··||·····|·······||···|···· ▮ ·········· 现在 14:32                           │
│ 竖线高度 = 那一分钟牵涉的人数；拖手柄回到任一分钟，沙盘和左栏同步回到那一刻；松手回"现在"     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **顶栏**：模组名；一个时钟；天气芯片（区域天气，按 `weatherPresets` 的区域）；在镇 / 在路上人数；模拟状态（运行、暂停、结算中，见第 7 节）；操作台按钮。
- **沙盘**：SVG 绘制。布局坐标来自模组的 `map_config.json`（现有 `mapsPrefix` 机制）。名牌按人分配稳定颜色。同场景多人按固定偏移排开。室内场景不单独画节点，归到 `parentLocationId` 的建筑节点下，聚焦时再展开成房间。
- **左栏**：摘要流（第 5.3 节）。默认显示"自上次以来"；按用户和会话保存上次查看的已结算游标及离开时刻，首次打开显示游戏时间的"今天"。"你离开了多久"是现实经过时长，摘要范围按游戏记录计算，暂停期间不虚构事件。点一条：时间带跳到那一分钟，沙盘聚焦到那条的当事人。
- **时间带**：分钟分辨率，显示当天。密度来自第 5.3 节。拖动时进入**回看态**：沙盘用那一分钟的快照重绘，左栏摘要范围改为"到那一分钟为止"，聚焦态的流滚到那一分钟。松手回"现在"。回看态是只读的，操作台在回看态禁用。
- **操作台**：从顶栏拉出的抽屉，复用现有的暂停 / 继续 / 单步、天气、脚本事件、注入角色接口。不在本设计里重画。

### 3.1 视觉风格：程序生成的手绘

默认风格是**手绘示意图**：纸面底色、抖动的墨线、手绘笔画的道路、hachure 填充、衬线或楷体的地名。它满足约束 7 的方式是：**手绘的质感全部由程序从数据生成**，模组只提供节点坐标（已有的 `map_config`），零美术。

- 每个图形（节点、道路、房间轮廓、物品点、名牌边框）用 rough.js 的 generator 生成路径；`seed` 取自实体 id 的稳定哈希，**同一个东西每次渲染的形状一样**，重渲染不抖。
- 纸纹用 `feTurbulence` 生成的噪声层，雾和昼夜是整张纸上的一层半透明水洗，颜色和透明度由天气子系统和日照驱动；不画雨雪粒子。
- 道路用 `perfect-freehand` 把折线变成有粗细变化的笔画，再交给 rough 描边；或直接用 rough 的双描边，实现时取视觉更好的一种。
- 放大到房间：平面草图，房间是 rough 矩形，物品是标名的小点，出口是箭头文字，人是名牌加一句 `spot`；不画家具。
- 阅读栏里的引用链接悬停、聚焦者的名牌，用 rough-notation 画手绘的下划线和圈，让文字区和沙盘说同一种语言。
- 中文全部用霞鹜文楷屏幕版（楷体质感、正文可读）；顶栏模组名可用毛笔体（马善政或龙藏），毛笔体只用于短标题。
- 暗色主题同样是纸：深色纸面、浅色墨线，不做荧光仪表。

**模组皮肤（本次不实现，只留接口）**：模组可选配一小组主题参数——强调色、字体、沙盘底图、明暗。底图是一张作者用任何工具画的干净 SVG，运行时经 `svg2roughjs` 转成手绘，与节点风格统一。第一版只做默认皮肤；皮肤参数的读取点在 `map_config.json` 里预留一个 `theme` 字段，不解析。

### 3.2 沙盘技术栈

全部 MIT 或 OFL；除字体外合计不到 60 kB。版本为 2026-09-05 核对的 npm 最新版。

| 用途 | 包 | 版本 | 说明 |
|---|---|---|---|
| 手绘图形核心 | `roughjs` | 4.6.6 | 直接用 `rough.generator()` 生成路径数据，包一个约 30 行的 `<Rough>` 组件，用 `useMemo` 按数据变化重算。**不引入 `react-rough-fiber`**（0.0.x，需钉 `react-reconciler`）。 |
| 道路笔画 | `perfect-freehand` | 1.2.3 | `getStroke` 出轮廓，`getSvgPathFromStroke` 转 path。 |
| 放大聚焦 | `react-zoom-pan-pinch` | 4.2.0 | `zoomToElement(id)` 与带动画的 `setTransform`；沙盘整体包在 `TransformWrapper` 里。 |
| 文字区手绘标注 | `rough-notation` | 0.5.1 | 下划线、圈、框、荧光笔；3.8 kB，无依赖。2020 年后无更新，但稳定。 |
| 中文字体 | `lxgw-wenkai-screen-webfont` | 1.7.0 | 按 unicode-range 分包，只加载用到的字。 |
| 标题毛笔体 | `@fontsource/ma-shan-zheng` | 5.3.1 | 仅顶栏模组名。 |
| 模组底图转手绘 | `svg2roughjs` | 3.2.3 | 皮肤功能用，本次只作为依赖预留，不接线。 |

排除：`tldraw`（source-available，生产需许可证）；`@excalidraw/excalidraw`（重，手绘引擎即 rough.js 分支；其社区图库可在以后取手绘地点图标）；`wired-elements`（2021 年停在 rc）。

已知风险：rough.js 自 2023-11 起无更新，但它 9 kB、无运行时依赖，Excalidraw 维护着分支 `@excalidraw/roughjs`，必要时可切换。

## 4. 聚焦态：分屏

点沙盘上的一个人（或摘要流的一条、或段落里的人物链接）：

1. 沙盘**放大**到这个人所在的地点（`zoomToElement`），停在左半边（约 52%）。放大后的地点画成一个房间：地点引用的物品是带名字的小点，出口是带箭头的文字，在场的人是名牌，聚焦的人高亮并标出他的 `spot`（"在案板前，背对门"）。
2. 右半边**滑入阅读栏**。
3. 顶部一行：`← 回到全镇` · 当前地点名 · 同屋的人。

### 4.1 阅读栏

头部：姓名、年龄、职业、所在地点；"正在：揉面团 · 第 3 分钟"（只有意图描述和已进行的分钟数）；HP / SAN / 疲劳三个量表。**头部随所选快照变化**：实时态读最新已结算快照，回看态读历史快照中的角色头部字段（第 5.2 节），并标明"回看"；缺少历史字段时显示"无记录"，不拿当前值补历史。

标签页：**此刻** · 档案 · 记忆 (n) · 关系 (n) · 随身 (n) · 这个地方。

**「此刻」是这个人的流**，按分钟向下排，最新在底部，"现在"贴底并跟着走。每一分钟的条目只有三种东西：

| 内容 | 来源 | 呈现 |
|---|---|---|
| 她读到的段落 | `npc_perceived.narrative` | 第一人称段落，引用标签渲染为链接。别人说的话由渲染器写在段落里，显示为引用块 |
| 她做的和说的 | `npc_decided`（新，第 5.1 节） | 左边框的块：意图描述一句；有原话则原话另起一行。continue 显示"继续 …" |
| 她记下的 | `npc_memory_changed`（新，第 5.1 节），按角色、操作发生的 tick 和游戏时间对上 | add 显示"记下：…"，replace 显示"改记为：…"，delete 显示"撤回：…"；relationship 类标出"关于谁"。同分钟多次操作按 `sequence` 排序 |

**这一栏永远不出现**：引擎的时长判定、技能门槛、骰子、结局判定、其他人读到的版本。想看别人眼中的同一分钟，点段落里那个人的链接：时间带不动，阅读栏切成那个人在同一分钟的流。

**折叠**：连续的"没变化"分钟（定义见 5.3）合并成一行，写清跨度，点"展开"逐分钟显示。本版不生成来去摘要：位置变化不能证明角色注意到了谁，也不从自由文本猜测结构化进出。角色实际读到的来去保留在原段落里。沙盘仍可显示客观位置，但不把它转写进角色阅读流。

**引用链接**：`[npc_*]` 点了切人；`[item.*]`、`[SCN_*]`、`[ROAD_*]` 点了在沙盘里高亮；`[stranger_*]` 别名对观察者解析为真人（第 5.1 节的 `aliases`），显示为"陌生人（Earl）"并可切人。

其他标签页取现有 `npc-statuses` 里的档案字段、记忆表、关系图、物品清单、当前地点的段落。这些都是当前值，不随时间带回拖；回看时统一标明"当前资料，不随回看变化"。`NpcMemory` 继续作为当前记忆的来源，但不用于还原历史阅读流或历史显著度。

## 5. 数据模型

### 5.1 新增落库行

都写进现有 `SimulationEvent` 表（`(sessionId, gameDateTime)` 已有索引，随会话级联删除），新增三个 `type`。历史关联以 `(sessionId, tick)` 为拍的身份，`gameDateTime` 用于时间定位和展示；游标使用 tick，不使用浏览器时间。

**`npc_decided`** — 每人每次决定一行，`gameDateTime` 是做决定的那一分钟（也就是感知那一分钟）。

```ts
data: {
  tool: "act" | "continue";
  description?: string;        // act
  utterance?: string;          // act，原话
  objectRefs?: { id: string; role?: string }[];
  skillId?: string;
  receipt: { accepted: boolean; actionId?: string; reason?: string };
}
```

被信任边界驳回且重试后仍被丢弃的 act 也落一行，`accepted: false` 带原因。写入点：`NpcActionController` 拿到 `ActionReceipt` 之后、`continue` 分支处。

**`npc_memory_changed`** — 每次成功的角色记忆操作一行，只追加。行上的 `gameDateTime` 是操作发生时刻，不是被修改记忆的原始时刻；`actorNpcId` 是记忆所属角色。

```ts
data: {
  operationId: string;         // 操作开始时生成，持久化重试复用；也作为事件 id
  sequence: number;            // 同角色同 tick 内的操作顺序
  source: "decision" | "consolidation";
  op: "add" | "replace" | "delete";
  memoryId: string;
  handle: string;
  before?: { type: string; content: string; targetId?: string };
  after?: { type: string; content: string; targetId?: string };
}
```

add 只有 `after`，replace 有 `before` 和 `after`，delete 只有 `before`。这些是当时的内容副本，不在读取时回查可变的记忆表。成功的 `writeMemory` 和角色主动整理记忆的 add / replace / delete 都覆盖；失败操作、访问次数更新和重要度衰减不生成此事件。操作台修改长期意图属于观察者操作，不伪装成角色自己记下的内容。

写入点在记忆持久化层：把操作时间、tick、sequence 和 source 从角色决策/整理上下文传入，**当前记忆的变更与对应事件写入使用同一数据库事务**；不得只在工具成功返回之后补写日志。按稳定的 `operationId` 去重，持久化重试不得重复修改记忆或新增事件。事件随会话清理，但不随单条记忆撤回而删除。对旧会话无法恢复已被覆盖或删除的原文，显示"此阶段无记忆操作历史"，不从当前记忆反推历史。

**`tick_record`** — 每拍一行，`actorNpcId: "system"`，`location: "global"`。

```ts
data: {
  schemaVersion: 1;
  previousSettledTick: number | null;
  perceptionFailures: string[]; // 本拍尝试渲染但失败的角色 id，不能折叠成安静分钟
  occurrences: {
    id: string;
    source: "engine" | "feature";
    actionIds: string[];
    actorId?: string;
    locationId: string;
    speech: boolean;
    utterance?: string;
    content?: string;
    targetIds: string[];
    perceivers: { characterId: string; clarity: "full" | "limited" | "trace" }[];
  }[];
  transitions: { actionId: string; actorId: string; from: string; to: string; reason?: string }[];
  damage: { characterId: string; field: "hp" | "san" | "fatigue"; delta: number }[];
  scripted: string[];          // 本拍触发的脚本事件 id
  world: {                     // 本拍结束时的小状态，整份存，不做增量
    weather: Record<string, { type: string; intensity: number }>;   // regionId →
    blocked: string[];         // 被封的 connectionId
  };
}
```

**occurrence 来源必须与角色路由一致**：目前 `NpcActionController.processTickReport` 会把 `featureEvents` 转成合成 occurrence，但不回写 `TickReport.occurrences`。实现时提取一次性的规范化步骤，把引擎 occurrence 与这批合成 occurrence 合并、分配稳定且不冲突的 id；角色路由和观察者落库共用这份结果，不各自重新推导感知者。转换沿用现有规则，不新增模型调用；同一事件不得因两条来源重复计数。`scripted` 记录本拍实际触发的脚本 id，不能由是否存在引擎 occurrence 推断。

写入点：`SimulationRunner` 在 Applier flush、角色感知与决定、记忆操作全部完成之后，与 `npc_position_snapshot` 同处。`world` 每拍整份存的理由：区域和边的数量都很小，整份比"整点快照加增量重放"简单得多，回看时不需要重放。整拍发布边界见第 5.4 节。

**`npc_perceived` 补一个字段**：`data.aliases: Record<string, string>`，本分钟该视角的别名到真实 id 的映射。观察者靠它把 `[stranger_*]` 解析成人。

### 5.2 某一分钟的世界快照

`快照(T) = npc_position_snapshot(T) + tick_record(T).world`，并携带 `{ tick, gameDateTime }`。新快照的角色集合就是当拍存在的角色，包含已死亡者；死亡状态来自当拍角色字段，历史回看不混入后来注入的角色。旧快照可结合 `{ 死亡 ≤ T }` 降级展示位置。

扩充 `npc_position_snapshot.data`，保留现有 `positions` 和字符串形式的 `currentActions` 以兼容现有消费者，新增：

```ts
characters: Record<string, {
  name: string;
  age?: number;
  occupation?: string;
  locationId: string;
  locationName: string;
  hp: number;
  maxHp: number;
  san: number;
  maxSan: number;
  fatigue: number;
  isAlive: boolean;
  action: {
    actionId: string;
    description: string;
    progressMinutes: number;
  } | null;
}>;
```

这些字段在当拍角色决定结束后、发布前从同一状态采样。`action` 只取引擎中已经 active 的动作；刚提交但未开始的意图留在 decision 条目，不显示为"正在"。`progressMinutes` 直接取动作运行态，不按描述字符串或浏览器经过时间推算；不返回判定时长、技能门槛等引擎内部字段。扩充 `npc-statuses` 返回 `fatigue` 与同结构的 `action` 供当前资料使用，但历史头部只读快照。

### 5.3 推导（纯函数，服务端）

- **某人某分钟是否"没变化"**：仅对记录完整的已结算拍计算；该人不在 `tick_record(T)` 完整 occurrence 集合的任何 `perceivers` 里，且 `npc_decided(该人, T)` 不存在或 `tool = continue`，且该分钟没有该人的 `npc_memory_changed`。缺行、渲染失败或旧数据覆盖不足的分钟不得推断为安静分钟。
- **折叠边界**：只合并游戏时间连续、记录完整且 `quiet = true` 的分钟；不跨越缺失记录或未知历史。角色流不返回由位置快照推导的 `presence`，也不生成来去摘要。
- **密度(T)**：`tick_record(T)` 所有 occurrence 的 `perceivers` 并集大小。
- **显著度**：对完整集合中的每条 occurrence 打分，基础 1；`speech` +2；感知者每多一人 +1，上限 +4；所引动作有 `to ∈ {failed, interrupted}` 的 transition +3；任一感知者本拍有 `hp` 或 `san` 负向 damage +3；本拍有脚本事件 +3；任一感知者本分钟的 `npc_memory_changed` 为 add / replace 且 `after.type` 是 `secret` 或 `relationship` 时 +1。一分钟的分数取其最高的 occurrence，没有 occurrence 时为 0。后续记忆修改或撤回不改变过去的分数。
- **摘要**：给定 `[from, to]`，取分数最高的 N 分钟按时间排序，N = `clamp(6, 跨度分钟数 / 30, 12)`。每条：时间、当事人（最高分 occurrence 的 `actorId`，没有则第一位感知者）、标题（该 occurrence `content` 的第一句；`speech` 行用"X 对 Y 说了……"的形式，不引原话）。**这是整个界面唯一出现引擎客观段落的地方**，作索引用。

### 5.4 已结算边界与持久化

`tick_record` 同时是该拍观察者数据完整的提交标记。感知、决定、位置/角色快照、其余拍内事件、运行时存档及 `tick_record` 在最后一个数据库事务中提交；此前记忆操作已按第 5.1 节与当前记忆逐操作原子提交。最终提交前检查该拍记忆操作均已完成。所有新增观察者 HTTP 查询只能读取有提交标记的拍，提前落库的记忆事件也必须经过这个条件过滤。

同会话每 tick 只允许一个提交标记，使用由 `(sessionId, tick, type)` 派生的稳定事件 id 实现幂等。最终事务失败时不得推进已结算游标、不得发送 `tick_settled`，暂停并报告原因；内存状态和部分已完成的记忆操作不能当作完整历史发布。恢复后沿用已有 tick 编号，不复用失败 tick；允许编号有空洞，由 `previousSettledTick` 串联成功提交的拍，失败拍显示为缺失记录，不视为安静。此规则保证观察者不会读到半拍，不承诺对整个引擎运行做事务回滚。

`tick_settled` 只在事务提交后发送。提交成功但广播失败时不回滚，客户端用已提交游标补齐。握手、HTTP 和广播都读取同一个持久化已结算边界，不能直接使用尚在推进中的 `dgsm.getGameDateTime()`。

## 6. 接口

新增三个读接口（挂在 `mapRoutes` 之后，路由显式应用鉴权和会话所有权中间件，不能只依赖挂载顺序）。角色接口额外校验角色属于该会话。它们只读第 5.4 节已提交的记录。

共同参数：普通时间查询使用 `from` / `to`（含端点）及 `throughTick` 上界；补帧使用 `afterTick` / `throughTick`，范围为 `(afterTick, throughTick]`。时间范围与补帧范围二选一。`throughTick` 固定为订阅握手或聚焦确认返回的已结算游标，翻页期间不随新拍移动。首次无游标时 `afterTick = 0`；此处 tick 从 1 开始，0 表示未结算任何拍。限制每页大小，返回不透明的 `nextCursor`（末页为 null）和 `complete`；后续通过 `?cursor=...` 读取同一接口。分页游标保留原查询范围、throughTick、角色和页内位置，并绑定当前用户/会话；不能通过改变 afterTick 缩小原摘要范围，也不能静默截断。

| 接口 | 返回 |
|---|---|
| `GET /api/simulation/:id/timeline?from&to&throughTick`，或 `?afterTick&throughTick` | `{ throughTick, settledTicks: {tick, previousSettledTick, gameDateTime}[], density: {tick, gameDateTime, count, locationIds}[], digest: {tick, gameDateTime, score, actorNpcId, actorName, locationId, headline}[], nextCursor, complete }`。即使密度为零也返回该拍的 `settledTicks`；`locationIds` 是完整 occurrence 集合所在的地点，沙盘用最近 10 个游戏分钟的并集决定哪些地点发亮 |
| `GET /api/simulation/:id/minute/:gameDateTime?throughTick` | 第 5.2 节的快照。只匹配不超过边界的已结算记录；没有快照时返回明确的缺失状态，不用当前状态替代。握手还返回最新已结算时间，客户端用它定位首屏 |
| `GET /api/simulation/:id/characters/:npcId/stream?from&to&throughTick`，或 `?afterTick&throughTick` | `{ throughTick, entries: {tick, gameDateTime, narrative?, aliases, decision?, memories: MemoryChange[], recordStatus: "complete" \| "render_failed" \| "legacy_incomplete", quiet: boolean}[], nextCursor, complete }`。`MemoryChange` 包含事件 id 和第 5.1 节记忆操作字段；不从 `NpcMemory` 补历史 |

折叠在客户端做（根据 `quiet`、`recordStatus` 与时间连续性），不返回 `presence`。历史游标页的 digest 在整个固定查询范围选取 top N，而非每页分别选 N 条；分页只切分返回数据，不改变摘要范围。旧会话没有提交标记的记录走显式的历史降级读取分支，标明覆盖不足，不作为新协议的完整已结算拍。

### 6.1 Socket 鉴权与订阅

现有 `WebSocketManager` 的 `type=simulation` 分支会在鉴权前注册观察者，**实现时必须移除这个提前注册/返回路径**。连接先验证有效凭证和会话所有权，通过后才能注册、读取订阅游标或发送任何会话数据；缺失/过期凭证与非所有者连接关闭，HTTP 对应返回 401 / 403。凭证沿用应用现有认证机制，禁止把凭证写入日志。长连接在凭证过期时关闭，重连重新鉴权。`focus` 还要验证角色属于该会话，非法请求不改变当前订阅。现有公共地图接口不因此自动获得私密角色流。

服务端为每个已鉴权客户端保存 `{ sessionId, focusedNpcId, focusRevision }`；同会话多个客户端互不覆盖。客户端发送 `{ type: "subscribe", npcId?: string }`。服务端先注册该连接的事件缓冲，再在同一会话发布锁内读取已提交边界、发送 `{ type: "subscribed", sessionId, settledTick, settledGameDateTime, state, settling, focusRevision }`，然后排出边界之后的消息。保证注册、取边界与拍发布之间没有漏帧窗口。尚无提交拍时 `settledTick = 0`、`settledGameDateTime = null`，显示"等待首拍"。

**实时消息**：每拍提交后向订阅者推一条 `tick_settled`，含 `{ sessionId, tick, previousSettledTick, gameDateTime, focusRevision, focusedNpcId }`，以及该分钟快照、density、摘要候选（若分数 > 0）和当前聚焦者的 stream 条目。无聚焦者则不带条目；角色不在该拍角色集合内时明确返回空条目。条目形状与 HTTP 一致。只向对应客户端发送聚焦者条目，不把所有 `npc_perceived` 或记忆操作追加到现有全员广播中。

客户端切人发送 `{ type: "focus", npcId: string | null, requestId }`；null 表示退出聚焦。服务端在同一发布锁内更新该连接的聚焦者和递增 `focusRevision`，返回 `{ type: "focus_ack", requestId, npcId, focusRevision, settledTick, settledGameDateTime }`，之后的 tick 携带新版本。客户端立即停止把旧人物条目写入当前阅读栏，按确认边界补取新人物的所需历史，再合并确认之后缓存的对应版本条目。快速切换时仅采用最新 requestId 的确认与 HTTP 结果；旧版本可更新全局快照，但不能串入新人物阅读流。

运行/暂停和是否正在结算由 `simulation_status` 消息发送，带会话内单调递增的 `statusRevision`；订阅确认同时返回其当前值。HTTP 补帧不覆盖较新的状态消息。状态消息不推进已结算游标。

操作台复用现有接口：`pause / resume / step / stop`、`config`（天气）、`characters`（注入）、脚本事件。

## 7. 实时与追赶

### 7.1 时钟与暂停

- "现在"是最新已提交拍的游戏时间，由订阅确认、受边界约束的 HTTP 和 `tick_settled` 共同确定。浏览器时间只计算离开时长，不推算模拟进度。时区或客户端时钟偏差不能改变游戏分钟。
- 一拍开始时服务端发送 `settling: true`；顶栏保留最后已结算的时间并显示"结算中"。例如 14:32 之后的一拍正在执行，显示"14:32 · 结算中"，提交后才显示 14:33。仅墙上时钟跨分钟不触发状态变化。
- 暂停请求按现有 runner 语义让当前拍先结束；暂停后时间冻结，显示"暂停"。恢复从该游戏时间继续逐拍推进，不跳到墙上时钟、不补造暂停期间的分钟。单步只推进实际执行的拍数。
- 一拍的模型调用需要几秒到几十秒是正常延迟；超过一分钟也不并发启动追赶拍。停机恢复后同样从持久化游戏时间继续。运行中的会话不自动再次调用 `enableRealTimeSync` 重设时间，避免历史时间重叠。
- 回看态顶栏显示所选游戏时间和"回看"；实时订阅继续缓存和更新最新边界，不能把沙盘或头部强行推回现在。

### 7.2 首次加载、补帧与重连

1. 按用户、会话读取本地上次查看游标，先建立已鉴权 Socket 并 subscribe；握手前也缓存消息。收到 `subscribed` 后固定边界 H，后续实时拍先缓存。
2. 拉取截至 H 的 timeline（首次为游戏当天，返回访问为上次游标之后）、H 对应的 minute 快照，以及聚焦角色所需范围的 stream。分页读完固定边界，再安装同一边界的数据。无首拍时保持等待状态；没有本地历史缓存时，为当天时间带和阅读窗口另拉截至 H 的范围，不能把本地游标当作已缓存完整历史的证明。
3. 按 tick 合并 H 之后缓存的实时消息，重复拍幂等覆盖；通过 `previousSettledTick` 检查是否接上本地边界（首拍的 null 对应未结算的 0），而不是要求整数 tick 连续。断链时暂停推进客户端游标，从当前边界重新握手补帧。聚焦流另按 npcId / focusRevision 管理覆盖范围，全局快照的进度不能代表新聚焦者已补齐。
4. 仅在查询范围全部加载完成、消息链完整合并后更新同步游标。"上次查看"游标在页面可见且数据已显示时更新，作为下次摘要起点；后台收到了数据不代表用户看过。两类游标按用户和会话隔离。
5. 断线显示"连接中断"并保留最后画面，不按墙上时间伪造进度。重连重新握手取得 H，走同样的固定边界补帧与合并流程；新建连接时重新声明聚焦角色。提交后广播丢失的拍由 HTTP 补回，不依赖服务端内存消息历史。

## 8. 错误处理

| 情况 | 处理 |
|---|---|
| 一拍被引擎整体拒绝（无变化） | 时间带上标空拍记号；不补、不猜 |
| 观察者整拍提交失败 | 不发布该拍、不推进已结算游标；暂停并报告原因。已有部分记忆操作不作为完整历史返回；恢复后的编号空洞显示为缺失记录 |
| 模拟器因重复错误自停 | 顶栏显示暂停与原因；操作台可继续 |
| 某人某分钟渲染失败 | `perceptionFailures` 记录角色 id，stream 返回 `recordStatus: "render_failed"`、`quiet: false`；条目写"这一分钟她没有留下记录"，不折叠成安静分钟 |
| 引用指向的物品已不在 | 链接照常渲染，高亮不到，提示"已不在这里" |
| 回拖超出范围 | 钳制到会话开始与最后结算分钟之间 |
| 快照缺行（历史会话未落 `tick_record`） | 沙盘只画已有位置，天气、封路与缺失的历史头部字段显示"无记录"；返回历史覆盖不足，不用于推断安静分钟 |
| 历史会话没有记忆操作事件 | 显示"此阶段无记忆操作历史"；当前记忆标签页仍可用，但不反推过去的记忆内容 |
| HTTP / Socket 鉴权失败或凭证过期 | 停止订阅，提示重新登录或无权访问；不能降级到公共 Socket 获取角色流 |
| HTTP 补帧失败、乱序或缓存消息接不上游标 | 保留已完整显示的数据与游标，重试握手和补帧；不跳过缺口 |
| 字体分包未加载完 | 先用系统楷体回退（`font-display: swap`），不阻塞渲染 |

## 9. 测试

- 5.3 的安静判定、密度、显著度与摘要是纯函数，单元测试；客户端折叠边界另测。夹具从一次真实运行落库的行里截取，并补齐下列边界场景；不以已有 60 拍恰好没出错代替覆盖。
- **记忆历史**：T1 add、T2 replace、T3 delete 后，T1 原文不变，T2/T3 各显示当时的修改/撤回，当前记忆已删除；同分钟多操作排序稳定，后续操作不改过去分数。覆盖整理记忆、操作失败不产生日志、事务失败同时回滚记忆与事件、相同 operationId 重试不重复写，以及旧会话不反推历史。
- **完整感知事件**：只有 feature/scripted 合成 occurrence、没有引擎 occurrence 的拍，角色路由与落库的 perceivers 一致，密度与摘要可见，continue 且不写记忆也不会被折叠；同一事件不重复计数。
- **视角与折叠**：某人客观进出但聚焦角色未感知，阅读流不能出现位置推导的来去；实际读到的进出保留原段落；渲染失败、缺行和旧数据不足不折叠。
- **接口与访问控制**：三个读接口在种子会话上做集成测试；HTTP 和 Socket 都覆盖未登录、过期凭证、其他用户、其他会话角色。两位客户端聚焦不同人物互不覆盖；公共模拟器入口不能绕过角色流的所有权校验。
- **订阅与一致性**：用可控同步屏障分别让一拍提交在握手注册前后、HTTP 各请求之间、分页期间；再覆盖重复/乱序消息、提交后广播丢失、断线重连、快速切人及迟到的旧 HTTP 响应，验证最终没有漏拍、重复条目或人物串流。最终持久化事务失败时没有提交标记和 `tick_settled`，HTTP 也读不到半拍；允许失败 tick 编号空洞，按 previousSettledTick 检查链条。
- **时钟与头部**：用假时钟覆盖暂停多分钟再恢复、单拍超过 60 秒、单步、停机恢复、浏览器时区/时间偏差。结算状态只来自服务端，未提交不推进时间；回看头部使用当拍 HP/SAN/疲劳、地点和 action.progressMinutes，缺失字段不借用当前值，新注入角色不出现在过去。
- 组件测试：引用变链接（含别名解析）、折叠、时间带的分钟与像素换算、rough 路径的 seed 稳定性（同 id 两次渲染路径字符串相等）、后台同步不更新上次查看游标。以上协议与状态测试使用假服务端/假模型，不调用真实模型。
- **回放模式**：录一次真实的 60 拍运行，导出落库行为 JSON 夹具（`client/src/observer/fixtures/`），前端可以脱离服务端直接吃夹具运行。开发界面不打模型，不花钱。不做打真实模型的端到端测试。
- 手绘参数（roughness、bowing、hachureGap、纸纹频率、雾的透明度）用 `playground` 插件生成一个单文件调参台调好，参数写成常量，不做运行时可调。

## 10. 落地与范围

**服务端**：`src/roleSim/` 提取供角色路由与观察者共用的 occurrence 规范化步骤，传递记忆操作上下文并报告渲染失败；`src/memory/` 为成功的角色记忆操作原子写入 `npc_memory_changed`。`src/simulation/` 写入 `npc_decided`、`tick_record`，补 `aliases` 和历史角色头部快照，实现整拍提交边界；`src/simulation/observer/` 放 5.3 的纯推导及已结算查询。`client/server/simulation/observerRoutes.ts` 提供三个有所有权校验、固定边界和分页的读接口；`mapService` 的当前 npc-statuses 补 fatigue 与 action。`WebSocketManager` 修复模拟器连接鉴权，增加 subscribe / subscribed、tick_settled、focus / focus_ack 与 simulation_status，实现每客户端聚焦、发布锁和游标补帧契约。同步事件类型声明与持久化过滤规则，私密感知/记忆事件不进入现有全员广播。复用现有节奏调度，不把游戏时钟改为墙上时间。

**前端（替换）**：新目录 `client/src/observer/`：`ObserverPage`（布局）、`TopBar`、`Sandbox`（SVG，含放大到房间）、`TimeRibbon`、`DigestRail`、`ReadingPane`（含标签页）、`OperatorDesk`（包装现有 ConfigPanel / ControlPanel）；`rough/`：`Rough.tsx`（generator 包装）、`seed.ts`（id 哈希）、`paper.tsx`（纸纹与水洗滤镜）、`strokes.ts`（perfect-freehand 道路）；hooks：`useTimeline`、`useMinuteSnapshot`、`useCharacterStream`、`useLiveTick`；纯函数：`fold.ts`、`citations.ts`、`ribbonScale.ts`。路由 `/simulation/:sessionId` 指向 `ObserverPage`。

**依赖**：新增 `roughjs`、`perfect-freehand`、`react-zoom-pan-pinch`、`rough-notation`、`lxgw-wenkai-screen-webfont`、`@fontsource/ma-shan-zheng`、`svg2roughjs`；移除 `phaser`。

**删除**：`SimulationPage.tsx`、`components/simulation/` 下的 `TownScene.ts`、`InteriorScene.ts`、`PhaserContainer.tsx`、`WeatherOverlay.tsx`、`SidePanel.tsx`、`NpcCard.tsx`、`NpcDetail.tsx`、`SceneInfoPanel.tsx`、`EventLog.tsx`、`GameClock.tsx`。保留 `ConfigPanel`、`ControlPanel`、`SimulationSelectorModal`。

**Godot**：`godot-client` 原样保留，不接本设计。它的位置是以后的玩家模式或"要游戏感"的一版，届时吃同一套接口。观察者界面是文本产品，浏览器是它的原生介质（长文排版、超链接、零安装）；Godot 的强项在这个屏幕上用不上，且手绘渲染要从零写。

**不在范围内**：玩家模式；地点描述文字的历史还原（变化已落库，以后可加）；引擎判定 / 调试抽屉；多观察者在场提示；模组皮肤的解析与切换；暂停后的墙上时间追赶；从自由文本提取角色来去摘要；旧会话被覆盖/删除记忆的历史恢复。

## 11. 决定记录（2026-09-05）

1. 第一用户：观察者兼实验员；玩家模式以后再做。
2. 时间关系：按真实分钟节奏运行的活小镇；审阅修订后明确以已结算游戏时间为准，暂停与慢拍不跳时、不加速追赶。
3. 方向：沙盘 + 时间带 + 摘要流 + 阅读栏，共一个时钟；否决"信息流为主、无地图"和"舞台化、游戏引擎"。
4. 主屏：中间沙盘、底部时间带、左栏摘要；点人放大聚焦。
5. 聚焦态：分屏（沙盘靠左、右栏阅读），否决浮层标注。
6. 阅读栏只有三种东西：她读到的、她做的和说的、她记下的；引擎判定一律不进；别人的版本靠切人看。
7. 流最新在底部跟着"现在"走；没变化的分钟折叠。
8. 摘要行用客观段落第一句作索引；回拖不还原地点描述历史。
9. 前端路径上不新增模型调用；开发用录制夹具回放。
10. 替换现有模拟页面，删 Phaser。
11. **界面通用，去掉一切模组设定的说法**（早期草稿曾以灰港的"雷德利站控制大厅"为框架，因引擎服务任何模组且纸面风格与高科技设定矛盾而废弃）。
12. **默认风格为程序生成的手绘**；模组皮肤留接口不实现；否决暗色仪表、等距卡通、写实。
13. 技术栈：`roughjs` generator 直用、`perfect-freehand`、`react-zoom-pan-pinch`、`rough-notation`、霞鹜文楷；不用 `react-rough-fiber`、`tldraw`、Excalidraw 编辑器。
14. Godot 客户端保留不动，留给玩家模式；观察者走 Web。
15. HTTP 和模拟器 Socket 均校验会话所有权；角色流仅发给该连接的聚焦者，多连接独立聚焦。
16. 历史记忆改读只追加的 npc_memory_changed，当前记忆仍读 NpcMemory；后来的修改和撤回不改写过去。
17. 角色路由与观察者落库共用包含 feature/scripted 合成事件的完整 occurrence 集合。
18. 先订阅、固定已结算边界、补历史、再合并实时消息；整拍提交后才能发布，按 tick 游标和 previousSettledTick 检查缺口。
19. 本版折叠只显示跨度，不从客观位置生成"她眼里的来去"；原段落保持角色实际感知。
20. 阅读头部跟随所选快照，新增历史状态和动作进度字段；其余当前资料标签页明确标注不随回看变化。
