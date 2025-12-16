import { getDirectorTemplate } from "./directorTemplate.js";
import { composeTemplate } from "../../../template.js";
import type { GameState, GameStateManager, VisitedScenarioBasic, DirectorDecision } from "../../../state.js";
import type { ScenarioProfile, ScenarioSnapshot } from "../models/scenarioTypes.js";
import { ScenarioLoader } from "../memory/scenarioloader/scenarioLoader.js";
import { updateCurrentScenarioWithCheckpoint } from "../memory/index.js";
import type { CoCDatabase } from "../memory/database/index.js";
import {
  ModelProviderName,
  ModelClass,
  generateText,
} from "../../../models/index.js";

interface DirectorRuntime {
  modelProvider: ModelProviderName;
  getSetting: (key: string) => string | undefined;
}

const createRuntime = (): DirectorRuntime => ({
  modelProvider: (process.env.MODEL_PROVIDER as ModelProviderName) || ModelProviderName.OPENAI,
  getSetting: (key: string) => process.env[key],
});

/**
 * Director Agent - 剧情推进和场景转换导演
 * 负责监控游戏进度并推进剧情发展
 */
export class DirectorAgent {
  private scenarioLoader: ScenarioLoader;
  private db: CoCDatabase;
  private userQueryHistory: string[] = [];

  constructor(scenarioLoader: ScenarioLoader, db: CoCDatabase) {
    this.scenarioLoader = scenarioLoader;
    this.db = db;
  }

  /**
   * 分析当前游戏状态并提供剧情推进建议
   */
  async analyzeProgressionNeeds(gameStateManager: GameStateManager, userQuery?: string): Promise<DirectorDecision> {
    const runtime = createRuntime();
    const gameState = gameStateManager.getGameState();
    
    // 记录用户查询历史
    if (userQuery) {
      this.addToQueryHistory(userQuery);
    }
    
    // 获取当前场景完整信息
    const currentScenarioInfo = this.extractCurrentScenarioInfo(gameState);
    
    // 获取已发现的线索信息
    const discoveredCluesInfo = this.extractDiscoveredClues(gameState);
    
    // 获取用户最近10条查询
    const recentQueries = this.getRecentQueries();
    
    // 获取未访问的场景选项
    const unvisitedScenarios = await this.getUnvisitedScenarios(gameState);
    
    
    // 获取模板
    const template = getDirectorTemplate();
    
    // 准备模板上下文
    const templateContext = {
      // 当前游戏状态
      currentScenario: currentScenarioInfo,
      
      // 已发现的线索
      discoveredClues: discoveredCluesInfo,
      
      // 用户查询历史
      recentQueries,
      
      // 未访问的场景
      unvisitedScenarios,
      
      // 游戏状态统计
      gameStats: {
        sessionId: gameState.sessionId,
        phase: gameState.phase,
        gameDay: gameState.gameDay,
        timeOfDay: gameState.timeOfDay,
        tension: gameState.tension,
        totalCluesDiscovered: gameState.discoveredClues.length,
        visitedScenarioCount: gameState.visitedScenarios.length,
        playerStatus: {
          hp: gameState.playerCharacter.status.hp,
          maxHp: gameState.playerCharacter.status.maxHp,
          sanity: gameState.playerCharacter.status.sanity,
          maxSanity: gameState.playerCharacter.status.maxSanity
        }
      },
      
      // 最新用户查询
      latestUserQuery: userQuery || "No recent query"
    };

    // 使用模板和LLM分析剧情推进需求
    const prompt = composeTemplate(template, {}, templateContext, "handlebars");

    const response = await generateText({
      runtime,
      context: prompt,
      modelClass: ModelClass.MEDIUM,
    });

    // 解析LLM的JSON响应
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(response);
    } catch (error) {
      console.error("Failed to parse director response as JSON:", error);
      return {
        shouldProgress: false,
        targetSnapshotId: undefined,
        reasoning: "Unable to analyze progression needs - JSON parse error",
        timestamp: new Date()
      };
    }

    const estimatedShortActions = 
      typeof parsedResponse.estimatedShortActions === "number" && parsedResponse.estimatedShortActions > 0
        ? parsedResponse.estimatedShortActions
        : null;
    const increaseShortActionCapBy =
      typeof parsedResponse.increaseShortActionCapBy === "number" && parsedResponse.increaseShortActionCapBy > 0
        ? parsedResponse.increaseShortActionCapBy
        : null;

    // 构建 Director Decision
    const decision: DirectorDecision = {
      shouldProgress: parsedResponse.shouldProgress || false,
      targetSnapshotId: parsedResponse.targetSnapshotId,
      estimatedShortActions,
      increaseShortActionCapBy,
      reasoning: parsedResponse.reasoning || parsedResponse.recommendation || "No reasoning provided",
      timestamp: new Date()
    };

    // 保存决策到 game state
    gameStateManager.setDirectorDecision(decision);

    // 如果需要推进且有目标场景ID，直接执行场景更新
    if (decision.shouldProgress && decision.targetSnapshotId) {
      await this.executeScenarioProgression(decision.targetSnapshotId, gameStateManager, estimatedShortActions);
    } else if (!decision.shouldProgress && increaseShortActionCapBy) {
      this.extendCurrentScenarioActionCap(gameStateManager, increaseShortActionCapBy);
    }

    return decision;
  }

  /**
   * 提取当前场景的完整信息
   */
  private extractCurrentScenarioInfo(gameState: GameState) {
    if (!gameState.currentScenario) {
      return null;
    }

    // 返回完整的当前场景状态
    return gameState.currentScenario;
  }

  /**
   * 提取已发现的线索信息
   */
  private extractDiscoveredClues(gameState: GameState) {
    const discoveredClues = [];

    // 从全局发现列表获取
    const globalClues = gameState.discoveredClues.map(clue => ({
      source: "global",
      clueText: clue
    }));
    discoveredClues.push(...globalClues);

    // 从当前场景获取已发现的线索
    if (gameState.currentScenario && gameState.currentScenario.clues) {
      const scenarioClues = gameState.currentScenario.clues
        .filter(clue => clue.discovered)
        .map(clue => ({
          source: "scenario",
          id: clue.id,
          clueText: clue.clueText,
          location: clue.location,
          discoveryMethod: clue.discoveryMethod,
          reveals: clue.reveals
        }));
      discoveredClues.push(...scenarioClues);
    }

    // 从NPC获取已揭示的线索
    gameState.npcCharacters.forEach(npc => {
      const npcData = npc as any;
      if (npcData.clues) {
        const revealedNpcClues = npcData.clues
          .filter((clue: any) => clue.revealed)
          .map((clue: any) => ({
            source: "npc",
            npcName: npc.name,
            clueText: clue.clueText
          }));
        discoveredClues.push(...revealedNpcClues);
      }
    });

    return discoveredClues;
  }

  /**
   * 添加用户查询到历史记录
   */
  private addToQueryHistory(query: string) {
    this.userQueryHistory.push(query);
    
    // 只保留最近20条查询（比需要的多一些以便筛选）
    if (this.userQueryHistory.length > 20) {
      this.userQueryHistory = this.userQueryHistory.slice(-20);
    }
  }

  /**
   * 获取最近10条用户查询
   */
  private getRecentQueries(): string[] {
    return this.userQueryHistory.slice(-10);
  }

  /**
   * 获取未访问的场景（仅返回24小时内且有连接的场景）
   */
  private async getUnvisitedScenarios(gameState: GameState): Promise<any[]> {
    if (!gameState.currentScenario) {
      return [];
    }

    // 获取连接的场景
    const connectedScenes = await this.getConnectedScenes(gameState.currentScenario);
    
    // 获取已访问的场景ID集合（使用 snapshot id）
    const visitedSnapshotIds = new Set<string>();
    
    // 添加当前场景的 id
    visitedSnapshotIds.add(gameState.currentScenario.id);
    
    // 添加已访问场景的 id
    gameState.visitedScenarios.forEach(scenario => {
      visitedSnapshotIds.add(scenario.id);
    });

    // 过滤出未访问的连接场景
    const unvisitedScenarios = connectedScenes
      .filter(snapshot => !visitedSnapshotIds.has(snapshot.id))
      .map(snapshot => ({
        id: snapshot.id,
        name: snapshot.name,
        location: snapshot.location,
        description: snapshot.description.length > 200 ? snapshot.description.slice(0, 200) + "..." : snapshot.description,
        keeperNotes: snapshot.keeperNotes || "",
        hoursFromNow: snapshot.timeDifferenceHours,
        connectionType: snapshot.connectionType,
        connectionDescription: snapshot.connectionDescription,
        clueCount: snapshot.clues.length,
        characterCount: snapshot.characters.length
      }));

    return unvisitedScenarios;
  }

  // Time progression removed - scenarios are now static snapshots without timeline

  /**
   * 执行场景推进 - 根据目标场景ID更新当前场景
   */
  private async executeScenarioProgression(
    targetSnapshotId: string, 
    gameStateManager: GameStateManager,
    estimatedShortActions: number | null = null
  ): Promise<void> {
    try {
      // 从场景加载器中查找目标场景快照（每个场景只有一个snapshot）
      const allScenarios = this.scenarioLoader.getAllScenarios();
      let targetSnapshot: ScenarioSnapshot | null = null;
      let scenarioName = "";

      // 在所有场景中搜索目标快照
      for (const scenario of allScenarios) {
        if (scenario.snapshot.id === targetSnapshotId) {
          targetSnapshot = scenario.snapshot;
          scenarioName = scenario.name;
          break;
        }
      }

      if (targetSnapshot) {
        // 将短行动估算附加到目标场景快照，方便后续状态追踪
        if (estimatedShortActions && estimatedShortActions > 0) {
          targetSnapshot.estimatedShortActions = estimatedShortActions;
        } else {
          targetSnapshot.estimatedShortActions = undefined;
        }

        // 执行场景更新（带 checkpoint 保存）
        await updateCurrentScenarioWithCheckpoint(
          gameStateManager,
          {
            snapshot: targetSnapshot,
            scenarioName: scenarioName
          },
          this.db
        );
        
        console.log(`Director Agent: Progressed to scenario "${scenarioName}" snapshot "${targetSnapshotId}" (checkpoint created)`);
      } else {
        console.warn(`Director Agent: Could not find target snapshot "${targetSnapshotId}"`);
      }
    } catch (error) {
      console.error("Error executing scenario progression:", error);
    }
  }

  /**
   * 处理Director Agent的输入请求
   */
  async processInput(input: string, gameStateManager: GameStateManager): Promise<DirectorDecision> {
    try {
      const result = await this.analyzeProgressionNeeds(gameStateManager, input);
      return result;
    } catch (error) {
      console.error("Error in Director Agent:", error);
      const errorDecision: DirectorDecision = {
        shouldProgress: false,
        targetSnapshotId: undefined,
        estimatedShortActions: null,
        reasoning: "Director Agent encountered an error analyzing progression needs",
        timestamp: new Date()
      };
      gameStateManager.setDirectorDecision(errorDecision);
      return errorDecision;
    }
  }

  /**
   * 扩充当前场景的短行动上限（在不推进场景时使用）
   */
  private extendCurrentScenarioActionCap(gameStateManager: GameStateManager, increaseBy: number): void {
    const gameState = gameStateManager.getGameState();
    if (!gameState.currentScenario) {
      console.warn("Director Agent: No current scenario to extend short action cap");
      return;
    }

    const currentCap = gameState.currentScenario.estimatedShortActions || 3;
    const newCap = currentCap + increaseBy;
    gameState.currentScenario.estimatedShortActions = newCap;
    console.log(`Director Agent: Extended current scenario short action cap from ${currentCap} to ${newCap}`);
  }

  /**
   * 处理 Action Agent 发起的场景切换请求
   * 直接执行场景切换，不需要判断进度条件
   */
  async handleActionDrivenSceneChange(
    gameStateManager: GameStateManager,
    targetSceneName: string,
    reason: string
  ): Promise<void> {
    console.log(`\n=== Director Agent: Handling action-driven scene change ===`);
    console.log(`Target: ${targetSceneName}`);
    console.log(`Reason: ${reason}`);
  }

  /**
   * 获取相关连接的场景（不再有时间限制）
   */
  async getConnectedScenes(currentScenario: ScenarioSnapshot): Promise<ConnectedSceneInfo[]> {
    try {
      // Find the scenario profile that contains this snapshot
      const allScenarios = this.scenarioLoader.getAllScenarios();
      const currentScenarioProfile = allScenarios.find(s => s.snapshot.id === currentScenario.id);
      
      if (!currentScenarioProfile || !currentScenarioProfile.connections) {
        console.log("No scenario profile or connections found");
        return [];
      }

      // 获取所有连接的 scenario IDs
      const connectedScenarioIds = currentScenarioProfile.connections.map(conn => conn.scenarioId);
      
      if (connectedScenarioIds.length === 0) {
        console.log("No connected scenarios");
        return [];
      }

      const connectedScenes: ConnectedSceneInfo[] = [];

      // 遍历每个连接的 scenario
      for (const connectedScenarioId of connectedScenarioIds) {
        const scenarioProfile = this.scenarioLoader.getScenarioById(connectedScenarioId);
        if (!scenarioProfile) continue;

        // 找到对应的 connection 信息
        const connectionInfo = currentScenarioProfile.connections!.find(
          conn => conn.scenarioId === connectedScenarioId
        );

        // Get the single snapshot for this scenario (no timeline)
        const snapshot = scenarioProfile.snapshot;
              
        connectedScenes.push({
          ...snapshot,
          connectionType: connectionInfo?.relationshipType || "unknown",
          connectionDescription: connectionInfo?.description || "",
          timeDifferenceHours: 0, // No time difference concept anymore
        });
      }

      console.log(`Found ${connectedScenes.length} connected scenes`);
      return connectedScenes;
    } catch (error) {
      console.error("Error getting connected scenes:", error);
      return [];
    }
  }

  /**
   * 使用场景切换模板进行决策
   */
  async decideSceneTransition(gameStateManager: GameStateManager): Promise<SceneTransitionDecision> {
    const runtime = createRuntime();
    const gameState = gameStateManager.getGameState();
    const { getSceneTransitionTemplate } = await import("./directorTemplate.js");
    
    if (!gameState.currentScenario) {
      throw new Error("No current scenario to transition from");
    }

    // 获取连接的场景
    const connectedScenes = await this.getConnectedScenes(gameState.currentScenario);

    // 打包当前场景信息
    const discoveredCount = gameState.currentScenario.clues.filter(c => c.discovered).length;
    const totalCount = gameState.currentScenario.clues.length;
    const actionCount = Object.values(gameState.scenarioTimeState.playerTimeConsumption)
      .reduce((sum, p: any) => sum + (p.totalShortActions || 0), 0);

    const currentScene = {
      name: gameState.currentScenario.name,
      location: gameState.currentScenario.location,
      description: gameState.currentScenario.description,
      cluesDiscovered: discoveredCount,
      cluesTotal: totalCount,
      characterCount: gameState.currentScenario.characters.length,
      actionCount,
      keeperNotes: gameState.currentScenario.keeperNotes,
    };

    // 打包可用场景信息
    const availableScenes = connectedScenes.map(scene => ({
      id: scene.id,
      name: scene.name,
      location: scene.location,
      connectionType: scene.connectionType,
      connectionDesc: scene.connectionDescription,
      description: scene.description.length > 200 ? scene.description.slice(0, 200) + "..." : scene.description,
      clueCount: scene.clues.length,
      characterCount: scene.characters.length,
      keeperNotes: scene.keeperNotes,
    }));

    // 打包活动摘要
    const recentActions = gameState.temporaryInfo.actionResults.slice(-5);
    const discoveredClues = gameState.currentScenario.clues.filter(c => c.discovered);
    
    const activityParts = [];
    if (recentActions.length > 0) {
      activityParts.push(`**Recent**: ${recentActions.map((a, i) => `${i+1}.${a.character}:${a.result}`).join("; ")}`);
    }
    if (discoveredClues.length > 0) {
      activityParts.push(`**Clues**: ${discoveredClues.map(c => c.clueText.slice(0, 40)).join("; ")}`);
    }
    const timeConsumption = Object.entries(gameState.scenarioTimeState.playerTimeConsumption)
      .map(([name, data]: [string, any]) => `${name}:${data.totalShortActions}acts`).join(", ");
    if (timeConsumption) {
      activityParts.push(`**Time**: ${timeConsumption}`);
    }

    const activitySummary = activityParts.length > 0 ? activityParts.join("\n") : "*No activity yet*";

    // 构建模板数据
    const templateData = {
      currentScene,
      availableScenes,
      activitySummary,
    };

    const template = getSceneTransitionTemplate();
    const prompt = composeTemplate(template, templateData);

    console.log("\n=== Director: Scene Transition Analysis ===");
    console.log(`Current Scene: ${gameState.currentScenario.name}`);
    console.log(`Connected Scenes Available: ${connectedScenes.length}`);

    const response = await generateText({
      runtime,
      context: prompt,
      modelClass: ModelClass.LARGE,
    });

    console.log("\n=== Director Response ===");
    console.log(response);

    // 解析 JSON 响应
    const decision = this.parseSceneTransitionDecision(response);
    
    // 验证目标场景 ID
    if (decision.shouldTransition && decision.targetSceneId) {
      const targetScene = connectedScenes.find(s => s.id === decision.targetSceneId);
      if (!targetScene) {
        console.warn(`Target scene ${decision.targetSceneId} not found in connected scenes`);
        decision.shouldTransition = false;
        decision.targetSceneId = null;
      }
    }

    return decision;
  }

  /**
   * 解析场景切换决策 JSON
   */
  private parseSceneTransitionDecision(response: string): SceneTransitionDecision {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || 
                       response.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      return {
        shouldTransition: parsed.shouldTransition || false,
        targetSceneId: parsed.targetSceneId || null,
        reasoning: parsed.reasoning || "No reasoning provided",
        urgency: parsed.urgency || "low",
        transitionType: parsed.transitionType || "player-initiated",
        suggestedTransitionNarrative: parsed.suggestedTransitionNarrative || "",
      };
    } catch (error) {
      console.error("Failed to parse scene transition decision:", error);
      return {
        shouldTransition: false,
        targetSceneId: null,
        reasoning: "Failed to parse director response",
        urgency: "low",
        transitionType: "player-initiated",
        suggestedTransitionNarrative: "",
      };
    }
  }

  /**
   * 决策并自动执行场景切换（如果决策为 true）
   */
  async decideAndTransition(gameStateManager: GameStateManager): Promise<SceneTransitionResult> {
    // 第一步：做决策
    const decision = await this.decideSceneTransition(gameStateManager);

    console.log("\n=== Director: Transition Decision ===");
    console.log(`Should Transition: ${decision.shouldTransition}`);
    console.log(`Reasoning: ${decision.reasoning}`);

    // 如果不需要切换，保存拒绝信息并返回
    if (!decision.shouldTransition || !decision.targetSceneId) {
      // 保存场景转换拒绝信息，让 Keeper 可以生成合理的叙述
      gameStateManager.setSceneTransitionRejection(decision.reasoning);
      
      return {
        decision,
        transitioned: false,
        message: "No transition needed"
      };
    }

    // 第二步：执行切换
    try {
      const targetScenarioId = decision.targetSceneId;
      
      // 从 scenarioLoader 获取完整的 scenario
      const targetScenario = this.scenarioLoader.getScenarioById(targetScenarioId);
      if (!targetScenario) {
        console.error(`Target scenario not found for snapshot ID: ${targetScenarioId}`);
        return {
          decision,
          transitioned: false,
          message: `Target scenario not found: ${targetScenarioId}`
        };
      }

      // 获取场景的单个snapshot（每个场景现在只有一个snapshot）
      const targetSnapshot = targetScenario.snapshot;
      
      // 验证snapshot ID是否匹配
      if (targetSnapshot.id !== targetScenarioId) {
        console.error(`Snapshot ID mismatch: expected ${targetScenarioId}, got ${targetSnapshot.id}`);
        return {
          decision,
          transitioned: false,
          message: `Snapshot ID mismatch: ${targetScenarioId}`
        };
      }

      // 更新场景（带 checkpoint 保存）
      await updateCurrentScenarioWithCheckpoint(
        gameStateManager,
        {
          snapshot: targetSnapshot,
          scenarioName: targetScenario.name
        },
        this.db
      );

      console.log(`\n✓ Scene Transition Executed (checkpoint saved)`);
      console.log(`  From: ${gameStateManager.getGameState().visitedScenarios[0]?.name || "Unknown"}`);
      console.log(`  To: ${targetSnapshot.name}`);
      console.log(`  Narrative: ${decision.suggestedTransitionNarrative}`);

      return {
        decision,
        transitioned: true,
        message: `Transitioned to: ${targetSnapshot.name}`,
        newScenario: targetSnapshot
      };

    } catch (error) {
      console.error("Failed to execute scene transition:", error);
      return {
        decision,
        transitioned: false,
        message: `Transition failed: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }
}

/**
 * 场景切换结果
 */
export interface SceneTransitionResult {
  decision: SceneTransitionDecision;
  transitioned: boolean;
  message: string;
  newScenario?: ScenarioSnapshot;
}

/**
 * 连接场景信息（扩展了 ScenarioSnapshot）
 */
export interface ConnectedSceneInfo extends ScenarioSnapshot {
  connectionType: string;
  connectionDescription: string;
  timeDifferenceHours: number;
}

/**
 * 场景切换决策
 */
export interface SceneTransitionDecision {
  shouldTransition: boolean;
  targetSceneId: string | null;
  reasoning: string;
  urgency: "low" | "medium" | "high";
  transitionType: "immediate" | "gradual" | "player-initiated";
  suggestedTransitionNarrative: string;
}
