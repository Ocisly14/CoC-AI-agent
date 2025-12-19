import { getKeeperTemplate } from "./keeperTemplate.js";
import { composeTemplate } from "../../../template.js";
import type { GameState, ActionResult, ActionAnalysis, DiscoveredClue } from "../../../state.js";
import { GameStateManager } from "../../../state.js";
import type { CharacterProfile, NPCProfile, ActionLogEntry } from "../models/gameTypes.js";
import {
  ModelProviderName,
  ModelClass,
  generateText,
} from "../../../models/index.js";

interface KeeperRuntime {
  modelProvider: ModelProviderName;
  getSetting: (key: string) => string | undefined;
}

const createRuntime = (): KeeperRuntime => ({
  modelProvider: (process.env.MODEL_PROVIDER as ModelProviderName) || ModelProviderName.OPENAI,
  getSetting: (key: string) => process.env[key],
});

/**
 * Keeper Agent - Game master for narrative generation and storytelling
 */
export class KeeperAgent {

  /**
   * Generate narrative description with clue revelation based on current game state and user query
   */
  async generateNarrative(characterInput: string, gameStateManager: GameStateManager): Promise<{narrative: string, clueRevelations: any, updatedGameState: GameState}> {
    const runtime = createRuntime();
    const gameState = gameStateManager.getGameState();
    
    // 1. 获取完整的场景信息
    const completeScenarioInfo = this.extractCompleteScenarioInfo(gameState);
    
    // 2. 获取所有的 action results（包括玩家和 NPC 的）
    const allActionResultsRaw = this.getAllActionResults(gameState);
    
    // 过滤掉 diceRolls 字段（模板中不使用）
    const allActionResults: Omit<ActionResult, 'diceRolls'>[] = allActionResultsRaw.map(({ diceRolls, ...result }) => result);
    
    // 2.1. 获取最新的完整的action result（用于向后兼容）
    const latestCompleteActionResult = allActionResults.length > 0 ? allActionResults[allActionResults.length - 1] : null;
    
    // 3. 获取action result中涉及的NPC完整属性
    const actionRelatedNpcs = this.extractActionRelatedNpcs(gameState, allActionResults);
    
    // 5. 检测场景变化，如果有变化则获取前一个场景的信息
    const isTransition = gameState.temporaryInfo.transition;
    const previousScenarioInfo = isTransition ? this.extractPreviousScenarioInfo(gameState) : null;
    
    // 6. 检测场景转换被拒绝的情况
    const sceneTransitionRejection = gameState.temporaryInfo.sceneTransitionRejection;
    
    // 7. 获取对话历史（从 contextualData 中）
    const conversationHistory = (gameState.temporaryInfo.contextualData?.conversationHistory as Array<{
      turnNumber: number;
      characterInput: string;
      keeperNarrative: string | null;
    }>) || [];
    
    // 8. 获取RAG检索结果，只保留需要的字段
    // TODO: 暂时注释掉RAG注入，因为正在修改RAG部分
    // const rawRagResults = (gameState.temporaryInfo.ragResults as any[]) || [];
    // const ragResults = rawRagResults.map((evidence: any) => ({
    //   type: evidence.type,
    //   title: evidence.title,
    //   snippet: evidence.snippet,
    //   visibility: evidence.visibility,
    // }));
    const ragResults: any[] = []; // 暂时设置为空数组
    
    // 获取模板
    const template = getKeeperTemplate();
    
    // Prepare template context (JSON-packed to keep template concise)
    const currentLocation = gameState.currentScenario?.location || null;
    const playerCharacterComplete = this.extractCompletePlayerCharacter(gameState.playerCharacter, currentLocation);
    
    // Get full game time
    const stateManager = new GameStateManager(gameState);
    const fullGameTime = stateManager.getFullGameTime();
    
    // Get narrative direction from state (set by Director Agent)
    const directorNarrativeDirection = gameState.temporaryInfo.narrativeDirection || null;
    
    const templateContext = {
      characterInput,
      allActionResults,  // 所有 action results（用于 {{#each}} 循环）
      fullGameTime: fullGameTime,  // Complete display: "Day 1, 08:00 (Morning)"
      tension: gameState.tension,
      phase: gameState.phase,
      isTransition,
      sceneTransitionRejection,  // 对象（用于访问 .reasoning 属性）
      conversationHistory,  // Recent conversation history（用于 {{#each}} 循环）
      // ragResults,  // TODO: 暂时注释掉RAG检索结果，因为正在修改RAG部分
      ragResults: [],  // 暂时设置为空数组
      // JSON 字符串版本（模板中直接使用）
      scenarioContextJson: this.safeStringify(completeScenarioInfo),
      playerCharacterJson: this.safeStringify(playerCharacterComplete),
      actionRelatedNpcsJson: this.safeStringify(actionRelatedNpcs),
      previousScenarioJson: previousScenarioInfo
        ? this.safeStringify(previousScenarioInfo)
        : "null",
      directorNarrativeDirection: directorNarrativeDirection,  // Director 生成的叙事方向指导（从 state 读取）
    };

    // 使用模板和LLM生成叙事和线索揭示
    const prompt = composeTemplate(template, {}, templateContext, "handlebars");

    const response = await generateText({
      runtime,
      context: prompt,
      modelClass: ModelClass.MEDIUM,
    });

    // 解析LLM的JSON响应
    let parsedResponse;
    try {
      // Extract JSON from response (in case LLM wraps it in markdown code blocks)
      const jsonText =
        response.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ||
        response.match(/\{[\s\S]*\}/)?.[0];

      if (!jsonText) {
        console.warn("Failed to extract JSON from keeper response");
        return {
          narrative: response,
          clueRevelations: { scenarioClues: [], npcClues: [], npcSecrets: [] },
          updatedGameState: gameState
        };
      }

      parsedResponse = JSON.parse(jsonText);
    } catch (error) {
      console.error("Failed to parse keeper response as JSON:", error);
      console.warn("Response content:", response.substring(0, 200));
      return {
        narrative: response,
        clueRevelations: { scenarioClues: [], npcClues: [], npcSecrets: [] },
        updatedGameState: gameState
      };
    }

    // 更新游戏状态中的线索状态
    const updatedGameState = this.updateClueStates(gameState, parsedResponse.clueRevelations, gameStateManager);

    // 更新紧张度（如果LLM提供了）
    if (parsedResponse.tensionLevel && typeof parsedResponse.tensionLevel === 'number') {
      const oldTension = gameState.tension;
      gameStateManager.updateTension(parsedResponse.tensionLevel);
      const newTension = gameStateManager.getGameState().tension;
      if (oldTension !== newTension) {
        console.log(`🎭 Tension changed: ${oldTension} → ${newTension}`);
      }
    }

    // 清除 narrative direction（已在本次叙事中使用）
    gameStateManager.clearNarrativeDirection();

    // 清除 transition 标志（已经在叙事中处理过了）
    if (gameState.temporaryInfo.transition) {
      gameStateManager.clearTransitionFlag();
    }

    // 清除场景转换拒绝标志（已经在叙事中处理过了）
    if (gameState.temporaryInfo.sceneTransitionRejection) {
      gameStateManager.clearSceneTransitionRejection();
    }

    // 清空临时 state 内容（在生成叙事和更新状态后）
    const finalGameState = this.clearTemporaryState(updatedGameState, gameStateManager);

    return {
      narrative: parsedResponse.narrative || response,
      clueRevelations: parsedResponse.clueRevelations || { scenarioClues: [], npcClues: [], npcSecrets: [] },
      updatedGameState: finalGameState
    };
  }

  /**
   * 清空临时 state 内容
   */
  private clearTemporaryState(gameState: GameState, gameStateManager: GameStateManager): GameState {
    console.log("\n🧹 [Keeper Agent] 清空临时 state 内容...");
    
    // 使用新的 GameStateManager 来更新状态
    const stateManager = new GameStateManager(gameState);
    
    // 清空 action results
    stateManager.clearActionResults();
    console.log("   ✓ 已清空 action results");
    
    // 清空 NPC response analyses
    stateManager.clearNPCResponseAnalyses();
    console.log("   ✓ 已清空 NPC response analyses");
    
    // 清空 action analysis
    stateManager.clearActionAnalysis();
    console.log("   ✓ 已清空 action analysis");
    
    // 清空临时规则和 RAG results
    const updatedState = stateManager.getGameState() as GameState;
    updatedState.temporaryInfo.rules = [];
    updatedState.temporaryInfo.ragResults = [];
    console.log("   ✓ 已清空临时规则和 RAG results");
    
    console.log("✅ [Keeper Agent] 临时 state 内容已清空");
    
    return updatedState;
  }

  /**
   * 1. 提取完整的场景信息
   */
  private extractCompleteScenarioInfo(gameState: GameState) {
    const currentScenario = gameState.currentScenario;
    
    if (!currentScenario) {
      return {
        hasScenario: false,
        message: "No current scenario loaded"
      };
    }

    // Simplified scenario info - keep essential dynamic state
    // Include clue text so Keeper can decide what to reveal
    return {
      hasScenario: true,
      id: currentScenario.id,
      name: currentScenario.name,
      location: currentScenario.location,
      // Characters present in the scene (dynamic state)
      characters: currentScenario.characters || [],
      // Provide clue details for Keeper decision-making
      clues: (currentScenario.clues || []).map(clue => ({
        id: clue.id,
        clueText: clue.clueText,
        location: clue.location,
        category: clue.category,
        difficulty: clue.difficulty,
        reveals: clue.reveals,
        discovered: clue.discovered,
        // Keep discovery details if the clue was discovered
        ...(clue.discovered && clue.discoveryDetails ? { discoveryDetails: clue.discoveryDetails } : {})
      }))
    };
  }

  /**
   * 提取前一个场景的信息（用于场景转换时）
   */
  private extractPreviousScenarioInfo(gameState: GameState) {
    const visitedScenarios = gameState.visitedScenarios;
    
    if (!visitedScenarios || visitedScenarios.length === 0) {
      return {
        hasPreviousScenario: false,
        message: "No previous scenario available"
      };
    }

    // 获取最近访问的场景（第一个元素是最新的）
    const previousScenario = visitedScenarios[0];

    return {
      hasPreviousScenario: true,
      id: previousScenario.id,
      name: previousScenario.name,
      location: previousScenario.location
    };
  }

  /**
   * 2. 获取所有的 action results（包括玩家和 NPC 的）
   */
  private getAllActionResults(gameState: GameState): ActionResult[] {
    const actionResults = gameState.temporaryInfo.actionResults || [];
    
    // 返回所有 action results 的完整信息
    return actionResults.map(result => ({
      ...result,
      diceRolls: result.diceRolls || []
    }));
  }

  /**
   * 3. 提取所有 action results 中涉及的 NPC 完整属性
   */
  private extractActionRelatedNpcs(gameState: GameState, allActionResults: Omit<ActionResult, 'diceRolls'>[]) {
    if (!allActionResults || allActionResults.length === 0) {
      return [];
    }

    // 收集所有 action results 中相关的 NPC 名称（去重）
    const relatedNpcNames = new Set<string>();
    const playerName = gameState.playerCharacter.name;
    
    // 从所有 action results 中提取相关 NPC
    for (const actionResult of allActionResults) {
      // 添加 action result 中的角色（如果是 NPC）
      if (actionResult.character && actionResult.character !== playerName) {
        relatedNpcNames.add(actionResult.character);
      }
      
      // 从 action result 文本中提取可能的 NPC 名称（简单匹配）
      if (actionResult.result) {
        gameState.npcCharacters.forEach(npc => {
          if (actionResult.result.toLowerCase().includes(npc.name.toLowerCase())) {
            relatedNpcNames.add(npc.name);
          }
        });
      }
    }

    // 从 action analysis 中获取目标角色
    const actionAnalysis = gameState.temporaryInfo.currentActionAnalysis;
    if (actionAnalysis?.target?.name) {
      relatedNpcNames.add(actionAnalysis.target.name);
    }

    // 找到相关的 NPC 并获取完整属性
    const actionRelatedNpcs = [];
    const addedNpcIds = new Set<string>();
    
    for (const npcName of relatedNpcNames) {
      // 查找 NPC
      const npc = gameState.npcCharacters.find(n => 
        n.name.toLowerCase() === npcName.toLowerCase() ||
        n.name.toLowerCase().includes(npcName.toLowerCase())
      );
      
      if (npc && !addedNpcIds.has(npc.id)) {
        // 避免重复添加同一个 NPC
        addedNpcIds.add(npc.id);
        const currentLocation = gameState.currentScenario?.location || null;
        actionRelatedNpcs.push({
          source: 'action_related',
          character: this.extractCompleteCharacterAttributes(npc, currentLocation)
        });
      }
    }

    return actionRelatedNpcs;
  }

  /**
   * 提取角色的完整属性信息
   * @param character 角色信息
   * @param currentLocation 当前场景位置（用于过滤 action log）
   */
  private extractCompleteCharacterAttributes(character: CharacterProfile, currentLocation: string | null = null) {
    const npcData = character as NPCProfile;
    
    // 过滤 action log：只保留当前地点的 action log
    let filteredActionLog: ActionLogEntry[] = [];
    if (character.actionLog && character.actionLog.length > 0) {
      if (currentLocation) {
        // 只保留 location 匹配当前场景的 action log
        filteredActionLog = character.actionLog.filter(log => 
          log.location && log.location.toLowerCase() === currentLocation.toLowerCase()
        );
      } else {
        // 如果没有当前场景位置，不包含任何 action log
        filteredActionLog = [];
      }
    }
    
    return {
      // 基本信息
      id: character.id,
      name: character.name,
      isNPC: npcData.isNPC || true,
      
      // 个人详细信息
      occupation: npcData.occupation || "Unknown",
      age: npcData.age || "Unknown",
      appearance: npcData.appearance || "No description",
      personality: npcData.personality || "Unknown personality",
      background: npcData.background || "Unknown background",
      
      // 目标和秘密
      goals: npcData.goals || [],
      secrets: npcData.secrets || [],
      
      // 完整属性
      attributes: {
        STR: character.attributes.STR,
        CON: character.attributes.CON,
        DEX: character.attributes.DEX,
        APP: character.attributes.APP,
        POW: character.attributes.POW,
        SIZ: character.attributes.SIZ,
        INT: character.attributes.INT,
        EDU: character.attributes.EDU
      },
      
      // 完整状态
      status: {
        hp: character.status.hp,
        maxHp: character.status.maxHp,
        sanity: character.status.sanity,
        maxSanity: character.status.maxSanity,
        luck: character.status.luck,
        mp: character.status.mp || 0,
        conditions: character.status.conditions || [],
        damageBonus: character.status.damageBonus || "0",
        build: character.status.build || 0,
        mov: character.status.mov || 7
      },
      
      // 物品
      inventory: character.inventory || [],
      
      // Action Log（只包含当前地点的）
      actionLog: filteredActionLog,
      
      // 线索（如果是NPC）
      clues: npcData.clues || [],
      
      // 关系（如果是NPC）
      relationships: npcData.relationships || [],
      
      // 当前位置
      currentLocation: npcData.currentLocation || null,
      
      // 备注
      notes: character.notes || ""
    };
  }

  /**
   * 提取玩家角色完整信息
   * @param player 玩家角色信息
   * @param currentLocation 当前场景位置（用于过滤 action log）
   */
  private extractCompletePlayerCharacter(player: CharacterProfile, currentLocation: string | null = null) {
    return this.extractCompleteCharacterAttributes(player, currentLocation);
  }

  /**
   * 更新游戏状态中的线索状态
   */
  private updateClueStates(gameState: GameState, clueRevelations: any, gameStateManager: GameStateManager): GameState {
    const stateManager = new GameStateManager(gameState);
    const newDiscoveredClues: DiscoveredClue[] = [];

    // 更新场景线索状态
    if (clueRevelations.scenarioClues && clueRevelations.scenarioClues.length > 0) {
      const currentScenario = gameState.currentScenario;
      if (currentScenario && currentScenario.clues) {
        clueRevelations.scenarioClues.forEach((item: string | { clueId: string }) => {
          const clueId = typeof item === "string" ? item : item?.clueId;
          if (!clueId) return;
          const clue = currentScenario.clues.find(c => c.id === clueId);
          if (clue && !clue.discovered) {
            const discoveredAt = new Date().toISOString();
            clue.discovered = true;
            clue.discoveryDetails = {
              discoveredBy: gameState.playerCharacter.name,
              discoveredAt,
              method: "Keeper revelation"
            };

            // Create detailed clue info
            newDiscoveredClues.push({
              text: clue.clueText,
              type: "scenario",
              sourceName: currentScenario.name,
              discoveredBy: gameState.playerCharacter.name,
              discoveredAt,
              category: clue.category,
              difficulty: clue.difficulty,
              method: "Keeper revelation"
            });
          }
        });
      }
    }

    // 更新NPC线索状态
    if (clueRevelations.npcClues && clueRevelations.npcClues.length > 0) {
      clueRevelations.npcClues.forEach((item: {npcId: string, clueId: string}) => {
        const npc = gameState.npcCharacters.find(n => n.id === item.npcId) as NPCProfile;
        if (npc && npc.clues) {
          const clue = npc.clues.find(c => c.id === item.clueId);
          if (clue && !clue.revealed) {
            clue.revealed = true;

            // Create detailed clue info
            newDiscoveredClues.push({
              text: clue.clueText,
              type: "npc",
              sourceName: npc.name,
              discoveredBy: gameState.playerCharacter.name,
              discoveredAt: new Date().toISOString(),
              category: clue.category as any,
              difficulty: clue.difficulty as any,
              method: "Social interaction"
            });
          }
        }
      });
    }

    // 处理NPC秘密揭示（秘密是字符串数组，用索引标识）
    if (clueRevelations.npcSecrets && clueRevelations.npcSecrets.length > 0) {
      clueRevelations.npcSecrets.forEach((item: {npcId: string, secretIndex: number}) => {
        const npc = gameState.npcCharacters.find(n => n.id === item.npcId) as NPCProfile;
        if (npc && npc.secrets && npc.secrets[item.secretIndex]) {
          const secret = npc.secrets[item.secretIndex];

          // Create detailed secret info
          newDiscoveredClues.push({
            text: `Secret: ${secret}`,
            type: "secret",
            sourceName: npc.name,
            discoveredBy: gameState.playerCharacter.name,
            discoveredAt: new Date().toISOString(),
            method: "Secret revelation"
          });
        }
      });
    }

    // 将新发现的线索添加到全局发现列表
    newDiscoveredClues.forEach(discoveredClue => {
      // Check if clue text already exists
      const exists = gameState.discoveredClues.some(c => c.text === discoveredClue.text);
      if (!exists) {
        gameState.discoveredClues.push(discoveredClue);
      }
    });

    return stateManager.getGameState() as GameState;
  }

  /**
   * 处理输入并生成适当的叙事响应
   */
  async processInput(input: string, gameStateManager: GameStateManager): Promise<{narrative: string, clueRevelations: any, updatedGameState: GameState}> {
    try {
      const result = await this.generateNarrative(input, gameStateManager);
      return result;
    } catch (error) {
      console.error("Error generating narrative:", error);
      return {
        narrative: "The shadows seem to obscure the scene, making it difficult to discern what transpires... [Keeper Agent Error]",
        clueRevelations: { scenarioClues: [], npcClues: [], npcSecrets: [] },
        updatedGameState: gameStateManager.getGameState()
      };
    }
  }

  private safeStringify(obj: any): string {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (error) {
      return typeof obj === "string" ? obj : "";
    }
  }
}
