# CoC Multi-Agent System Architecture

## 系统概述

这是一个基于 LangGraph 的 Call of Cthulhu (克苏鲁的呼唤) TRPG 多智能体系统。系统使用 SQLite 数据库持久化存储游戏数据和规则，通过协同工作的 agents 提供完整的游戏体验。

## 核心架构

### 工作流程

```
用户输入
   ↓
Orchestrator (分析并决定需要哪些 agents)
   ↓
ExecuteAgents (执行队列中的 agents)
   ↓
[Memory Agent] [Character Agent] (并行/顺序执行)
   ↓
CheckCompletion (检查是否所有 agents 完成)
   ↓
Keeper (综合所有结果生成最终叙事)
   ↓
用户输出
```

## Agent 职责

### 1. **Orchestrator** (编排者)
- **职责**: 分析玩家输入，决定需要咨询哪些数据 agents
- **输出**: Agent 队列 `["memory", "character"]`
- **不再包含**: Keeper (自动执行) 和 Rule (已合并到 Memory)

### 2. **Memory Agent** (统一的记忆与规则代理)
**这是系统的核心数据层，合并了原来的 Rule Agent 功能**

#### 历史记录功能
- 📝 记录游戏事件 (`logEvent`)
- 🔍 查询历史 (`queryHistory`)
- 📊 会话管理 (`createSession`, `getSessionSummary`)
- 🔎 线索追踪 (`recordDiscovery`, `getDiscoveries`)
- 👥 NPC 关系管理 (`trackRelationship`)
- 🔎 全文搜索 (`searchLogs`)

#### 规则数据库功能
- 📚 技能查询 (`getSkill`, `getAllSkills`)
- ⚔️ 武器数据 (`getWeapon`, `getAllWeapons`)
- 📖 规则查找 (`lookupRule`)
- 🎲 理智触发器 (`getSanityLoss`, `getAllSanityTriggers`)
- 🎲 技能检定 (`skillCheck`)
- 🧠 理智检定 (`sanityCheck`)
- 💪 伤害计算 (`calculateBonusDamage`, `rollDamage`)

**文件位置**: `coc_multiagents_system/agents/memory/memoryAgent.ts`

### 3. **Character Agent** (角色代理)
- **职责**: 管理玩家角色的能力、装备和状态
- **输出**: 角色相关的能力信息、装备、风险评估
- **范围**: 仅处理角色特定的数据

### 4. **Keeper** (守密人/叙事生成器)
- **职责**: 接收所有 agents 的结果，生成统一的、有氛围感的叙事
- **特点**:
  - 永远是最后执行的节点
  - 不在 agent 队列中
  - 使用结构化 template 自动填充信息
- **输入**: `agentResults[]` from Memory and Character
- **输出**: 最终的游戏叙事文本

**Template 位置**: `coc_multiagents_system/agents/keeper/keeperTemplate.ts`

## 数据库架构

### 位置
`data/coc_game.db` (SQLite 数据库)

### 表结构

#### 规则数据 (静态参考)
- `rules` - CoC 7e 游戏规则
- `skills` - 所有技能及基础值
- `weapons` - 武器数据
- `sanity_triggers` - 理智触发器

#### 游戏数据 (动态记录)
- `sessions` - 游戏会话
- `game_events` - 游戏事件日志 (带全文搜索)
- `discoveries` - 发现的线索
- `relationships` - 角色与 NPC 的关系

## 数据流

```typescript
// 1. 用户输入
"我检查书架寻找线索"

// 2. Orchestrator 决定
agents: ["memory", "character"]

// 3. Memory Agent 查询
- 历史: "之前在这里发现过笔记"
- 规则: "需要 Spot Hidden 检定，难度 Regular"
- 返回: agentResults[0] = { agentId: 'memory', content: '...' }

// 4. Character Agent 查询
- 角色能力: "Spot Hidden: 65%"
- 返回: agentResults[1] = { agentId: 'character', content: '...' }

// 5. Keeper 综合
Template 自动填充:
- MEMORY AGENT: 历史 + 规则信息
- CHARACTER AGENT: 角色能力

生成: "回忆起之前的笔记，你仔细检查书架。
      请进行 Spot Hidden 检定（技能值 65%）..."
```

## 关键文件

### 核心逻辑
- `src/graph.ts` - Graph 结构定义
- `src/runtime.ts` - 所有 agent 节点实现
- `src/state.ts` - State 定义

### Agents
- `coc_multiagents_system/agents/memory/memoryAgent.ts` - 统一的 Memory Agent
- `coc_multiagents_system/agents/keeper/keeperTemplate.ts` - Keeper Template
- `coc_multiagents_system/agents/character/` - Character Agent (待实现)

### 数据库
- `coc_multiagents_system/shared/database/schema.ts` - 数据库架构
- `coc_multiagents_system/shared/database/seedData.ts` - 初始数据加载

## Agent 类型定义

```typescript
export type AgentId = "character" | "memory";
// keeper: 不在队列中，自动执行
// rule: 已合并到 memory agent
```

## 优势

### 简化的架构
✅ 从 4 个 agents (rule, memory, character, keeper) 简化到 2 个数据 agents + 1 个叙事 agent
✅ Rule 和 Memory 都是查询类 agent，合并后更清晰
✅ 减少了 agent 间的协调复杂度

### 统一的数据访问
✅ 所有数据通过一个 SQLite 数据库
✅ Memory Agent 是唯一的数据访问层
✅ 规则数据作为静态参考，只读访问

### 更好的用户体验
✅ 单一的、连贯的叙事输出
✅ Keeper 可以完整综合所有信息
✅ 自动化的信息填充和叙事生成

## 环境要求

```json
{
  "dependencies": {
    "@langchain/langgraph": "^0.0.32",
    "@langchain/openai": "^0.3.4",
    "better-sqlite3": "^11.7.0",
    "dotenv": "^16.4.7",
    "langchain": "^0.3.8"
  }
}
```

## 运行

```bash
# 安装依赖
npm install

# 构建
npm run build

# 运行
npm run dev
```

首次运行会自动：
- 创建 `data/` 目录
- 初始化 `coc_game.db` 数据库
- 加载所有 CoC 7e 规则数据

## 未来扩展

- [ ] Character Agent 完整实现
- [ ] Web UI 界面
- [ ] 多玩家支持
- [ ] 自定义规则导入
- [ ] 战役管理系统
