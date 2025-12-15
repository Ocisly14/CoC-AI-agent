import { getDirectorTemplate } from "./directorTemplate.js";
import { composeTemplate } from "../../../template.js";
import type { GameState, GameStateManager, VisitedScenarioBasic, DirectorDecision } from "../../../state.js";
import type { ScenarioProfile, ScenarioSnapshot } from "../models/scenarioTypes.js";
import { ScenarioLoader } from "../memory/scenarioloader/scenarioLoader.js";
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
  private userQueryHistory: string[] = [];

  constructor(scenarioLoader: ScenarioLoader) {
    this.scenarioLoader = scenarioLoader;
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
    
    // 获取当前场景的时间线进展选项
    const timeProgressionOptions = this.getTimeProgressionOptions(gameState);
    
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
      
      // 时间推进选项
      timeProgressionOptions,
      
      // 游戏状态统计
      gameStats: {
        sessionId: gameState.sessionId,
        phase: gameState.phase,
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
   * 获取未访问的场景
   */
  private async getUnvisitedScenarios(gameState: GameState): Promise<any[]> {
    // 获取所有可用场景
    const allScenarios = this.scenarioLoader.getAllScenarios();
    
    // 获取已访问的场景ID集合
    const visitedScenarioIds = new Set<string>();
    
    // 添加当前场景
    if (gameState.currentScenario) {
      visitedScenarioIds.add(gameState.currentScenario.scenarioId);
    }
    
    // 添加已访问的场景
    gameState.visitedScenarios.forEach(scenario => {
      visitedScenarioIds.add(scenario.scenarioId);
    });

    // 过滤出未访问的场景，并只返回基础信息
    const unvisitedScenarios = allScenarios
      .filter(scenario => !visitedScenarioIds.has(scenario.id))
      .map(scenario => {
        // 对于每个未访问的场景，返回其第一个时间点的基础信息
        const firstSnapshot = scenario.timeline[0];
        return {
          id: firstSnapshot?.id || scenario.id,
          scenarioId: scenario.id,
          name: firstSnapshot?.name || scenario.name,
          location: firstSnapshot?.location || "Unknown location",
          timePoint: firstSnapshot?.timePoint || { timestamp: "Unknown time" },
          description: firstSnapshot?.description || scenario.description,
          keeperNotes: firstSnapshot?.keeperNotes || ""
        };
      });

    return unvisitedScenarios;
  }

  /**
   * 获取当前场景的时间线推进选项
   */
  private getTimeProgressionOptions(gameState: GameState): any[] {
    if (!gameState.currentScenario || !gameState.currentScenario.scenarioId) {
      return [];
    }

    // 从数据库获取完整的场景信息
    const fullScenario = this.scenarioLoader.getScenarioById(gameState.currentScenario.scenarioId);
    if (!fullScenario) {
      return [];
    }

    // 找到当前时间点在timeline中的位置
    const currentSnapshotId = gameState.currentScenario.id;
    const currentIndex = fullScenario.timeline.findIndex(snapshot => snapshot.id === currentSnapshotId);
    
    if (currentIndex === -1) {
      return [];
    }

    // 返回后续的时间点选项（只包含基础信息）
    const futureSnapshots = fullScenario.timeline.slice(currentIndex + 1);
    
    return futureSnapshots.map(snapshot => ({
      id: snapshot.id,
      scenarioId: snapshot.scenarioId,
      name: snapshot.name,
      location: snapshot.location,
      timePoint: snapshot.timePoint,
      description: snapshot.description,
      keeperNotes: snapshot.keeperNotes
    }));
  }

  /**
   * 执行场景推进 - 根据目标场景ID更新当前场景
   */
  private async executeScenarioProgression(
    targetSnapshotId: string, 
    gameStateManager: GameStateManager,
    estimatedShortActions: number | null = null
  ): Promise<void> {
    try {
      // 从场景加载器中查找目标场景快照
      const allScenarios = this.scenarioLoader.getAllScenarios();
      let targetSnapshot: ScenarioSnapshot | null = null;
      let scenarioName = "";

      // 在所有场景的时间线中搜索目标快照
      for (const scenario of allScenarios) {
        const foundSnapshot = scenario.timeline.find(snapshot => snapshot.id === targetSnapshotId);
        if (foundSnapshot) {
          targetSnapshot = foundSnapshot;
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

        // 执行场景更新
        gameStateManager.updateCurrentScenario({
          snapshot: targetSnapshot,
          scenarioName: scenarioName
        });
        
        console.log(`Director Agent: Progressed to scenario "${scenarioName}" snapshot "${targetSnapshotId}"`);
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
}
