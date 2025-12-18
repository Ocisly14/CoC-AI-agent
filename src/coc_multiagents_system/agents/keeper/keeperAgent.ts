import { getKeeperTemplate } from "./keeperTemplate.js";
import { composeTemplate } from "../../../template.js";
import type { GameState, ActionResult, ActionAnalysis } from "../../../state.js";
import { GameStateManager } from "../../../state.js";
import type { CharacterProfile, NPCProfile } from "../models/gameTypes.js";
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
    const allActionResults = this.getAllActionResults(gameState);
    
    // 2.1. 获取最新的完整的action result（用于向后兼容）
    const latestCompleteActionResult = allActionResults.length > 0 ? allActionResults[allActionResults.length - 1] : null;
    
    // 3. 获取场景中所有角色的完整属性
    const allSceneCharacters = this.extractAllSceneCharactersWithCompleteAttributes(gameState);
    
    // 4. 获取action result中涉及的NPC完整属性（与场景角色去重）
    const actionRelatedNpcs = this.extractActionRelatedNpcsWithDeduplication(
      gameState, 
      latestCompleteActionResult, 
      allSceneCharacters
    );
    
    // 4.5. 获取当前位置与场景位置相同的NPC（与场景角色和action相关NPC去重）
    const locationMatchingNpcs = this.extractLocationMatchingNpcsWithDeduplication(
      gameState,
      allSceneCharacters,
      actionRelatedNpcs
    );
    
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
    const rawRagResults = (gameState.temporaryInfo.ragResults as any[]) || [];
    const ragResults = rawRagResults.map((evidence: any) => ({
      type: evidence.type,
      title: evidence.title,
      snippet: evidence.snippet,
      visibility: evidence.visibility,
    }));
    
    // 获取模板
    const template = getKeeperTemplate();
    
    // Prepare template context (JSON-packed to keep template concise)
    const playerCharacterComplete = this.extractCompletePlayerCharacter(gameState.playerCharacter);
    
    // Get time description
    const stateManager = new GameStateManager(gameState);
    const timeDescription = stateManager.getTimeOfDayDescription();
    const fullGameTime = stateManager.getFullGameTime();
    
    const templateContext = {
      characterInput,
      completeScenarioInfo,
      allActionResults,  // 所有 action results
      latestCompleteActionResult,
      playerCharacterComplete,
      allSceneCharacters,
      actionRelatedNpcs,
      locationMatchingNpcs,
      gameDay: gameState.gameDay,
      timeOfDay: gameState.timeOfDay,
      timeDescription: timeDescription,  // Human-readable time (Morning, Evening, etc.)
      fullGameTime: fullGameTime,  // Complete display: "Day 1, 08:00 (Morning)"
      tension: gameState.tension,
      phase: gameState.phase,
      isTransition,
      previousScenarioInfo,
      sceneTransitionRejection,
      conversationHistory,  // Recent conversation history (last 3 turns)
      ragResults,  // RAG检索结果（已过滤，只包含 type, title, snippet, anchors, visibility）
      scenarioContextJson: this.safeStringify(completeScenarioInfo),
      allActionResultsJson: this.safeStringify(allActionResults),  // 所有 action results 的 JSON
      latestActionResultJson: latestCompleteActionResult
        ? this.safeStringify(latestCompleteActionResult)
        : "null",
      playerCharacterJson: this.safeStringify(playerCharacterComplete),
      sceneCharactersJson: this.safeStringify(allSceneCharacters),
      actionRelatedNpcsJson: this.safeStringify(actionRelatedNpcs),
      locationMatchingNpcsJson: this.safeStringify(locationMatchingNpcs),
      previousScenarioJson: previousScenarioInfo 
        ? this.safeStringify(previousScenarioInfo)
        : "null",
      conversationHistoryJson: this.safeStringify(conversationHistory),
      ragResultsJson: this.safeStringify(ragResults),  // RAG结果的JSON
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

    // 更新NPC位置（如果LLM提供了）
    if (parsedResponse.npcLocationUpdates && Array.isArray(parsedResponse.npcLocationUpdates)) {
      this.updateNpcLocations(updatedGameState, parsedResponse.npcLocationUpdates, gameStateManager);
    }

    // 更新紧张度（如果LLM提供了）
    if (parsedResponse.tensionLevel && typeof parsedResponse.tensionLevel === 'number') {
      const oldTension = gameState.tension;
      gameStateManager.updateTension(parsedResponse.tensionLevel);
      const newTension = gameStateManager.getGameState().tension;
      if (oldTension !== newTension) {
        console.log(`🎭 Tension changed: ${oldTension} → ${newTension}`);
      }
    }

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

    return {
      hasScenario: true,
      id: currentScenario.id,
      name: currentScenario.name,
      location: currentScenario.location,
      description: currentScenario.description,
      characters: currentScenario.characters || [],
      clues: currentScenario.clues || [],
      conditions: currentScenario.conditions || [],
      events: currentScenario.events || [],
      keeperNotes: currentScenario.keeperNotes || "",
      permanentChanges: currentScenario.permanentChanges
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
   * 2.1. 获取最新的完整的action result（用于向后兼容）
   */
  private getLatestCompleteActionResult(gameState: GameState): ActionResult | null {
    const allActionResults = this.getAllActionResults(gameState);
    
    if (allActionResults.length === 0) {
      return null;
    }
    
    // 返回最新的action result
    return allActionResults[allActionResults.length - 1];
  }

  /**
   * 3. 提取场景中所有角色的完整属性
   */
  private extractAllSceneCharactersWithCompleteAttributes(gameState: GameState) {
    return gameState.npcCharacters.map(npc => ({
      source: 'scene',
      character: this.extractCompleteCharacterAttributes(npc)
    }));
  }

  /**
   * 4. 提取action result中涉及的NPC完整属性（与场景角色去重）
   */
  private extractActionRelatedNpcsWithDeduplication(
    gameState: GameState, 
    latestActionResult: ActionResult | null,
    allSceneCharacters: any[]
  ) {
    if (!latestActionResult) {
      return [];
    }

    // 从action result中识别涉及的角色
    const actionCharacterName = latestActionResult.character;
    const actionResult = latestActionResult.result;
    
    // 从action analysis中获取目标角色
    const actionAnalysis = gameState.temporaryInfo.currentActionAnalysis;
    const targetName = actionAnalysis?.target?.name;

    // 收集相关的NPC名称
    const relatedNpcNames = new Set<string>();
    
    // 添加action result中的角色（如果是NPC）
    if (actionCharacterName && actionCharacterName !== gameState.playerCharacter.name) {
      relatedNpcNames.add(actionCharacterName);
    }
    
    // 添加目标角色
    if (targetName) {
      relatedNpcNames.add(targetName);
    }
    
    // 从action result文本中提取可能的NPC名称（简单匹配）
    gameState.npcCharacters.forEach(npc => {
      if (actionResult.toLowerCase().includes(npc.name.toLowerCase())) {
        relatedNpcNames.add(npc.name);
      }
    });

    // 找到相关的NPC并获取完整属性
    const actionRelatedNpcs = [];
    const sceneCharacterNames = new Set(allSceneCharacters.map(sc => sc.character.name));
    
    for (const npcName of relatedNpcNames) {
      // 查找NPC
      const npc = gameState.npcCharacters.find(n => 
        n.name.toLowerCase() === npcName.toLowerCase() ||
        n.name.toLowerCase().includes(npcName.toLowerCase())
      );
      
      if (npc) {
        // 检查是否已在场景角色中（去重）
        if (!sceneCharacterNames.has(npc.name)) {
          actionRelatedNpcs.push({
            source: 'action_related',
            character: this.extractCompleteCharacterAttributes(npc)
          });
        }
      }
    }

    return actionRelatedNpcs;
  }

  /**
   * 5. 提取当前位置与场景位置相同的NPC完整属性（与场景角色和action相关NPC去重）
   */
  private extractLocationMatchingNpcsWithDeduplication(
    gameState: GameState,
    allSceneCharacters: any[],
    actionRelatedNpcs: any[]
  ) {
    const currentScenario = gameState.currentScenario;
    if (!currentScenario || !currentScenario.location) {
      return [];
    }

    const scenarioLocation = currentScenario.location;
    const sceneCharacterNames = new Set(allSceneCharacters.map(sc => sc.character.name));
    const actionRelatedNpcNames = new Set(actionRelatedNpcs.map(an => an.character.name));

    const locationMatchingNpcs = [];

    for (const npc of gameState.npcCharacters) {
      const npcProfile = npc as NPCProfile;
      
      // 检查NPC是否有当前位置，且与场景位置相同
      if (npcProfile.currentLocation && 
          npcProfile.currentLocation.toLowerCase() === scenarioLocation.toLowerCase()) {
        
        // 检查是否已在场景角色中（去重）
        if (!sceneCharacterNames.has(npc.name)) {
          // 检查是否已在action相关NPC中（去重）
          if (!actionRelatedNpcNames.has(npc.name)) {
            locationMatchingNpcs.push({
              source: 'location_match',
              character: this.extractCompleteCharacterAttributes(npc)
            });
          }
        }
      }
    }

    return locationMatchingNpcs;
  }

  /**
   * 提取角色的完整属性信息
   */
  private extractCompleteCharacterAttributes(character: CharacterProfile) {
    const npcData = character as NPCProfile;
    
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
   */
  private extractCompletePlayerCharacter(player: CharacterProfile) {
    return this.extractCompleteCharacterAttributes(player);
  }

  /**
   * 更新NPC位置
   */
  private updateNpcLocations(gameState: GameState, locationUpdates: Array<{npcId: string, currentLocation: string}>, gameStateManager: GameStateManager): void {
    if (!locationUpdates || locationUpdates.length === 0) return;

    for (const update of locationUpdates) {
      // 跳过无效的位置更新
      if (!update.currentLocation || !update.npcId) {
        continue;
      }

      const npc = gameState.npcCharacters.find(n => n.id === update.npcId) as NPCProfile;
      if (npc) {
        const oldLocation = npc.currentLocation || null;
        npc.currentLocation = update.currentLocation;
        if (oldLocation !== update.currentLocation) {
          const oldLocationDisplay = oldLocation || "Unknown";
          console.log(`📍 NPC ${npc.name} location updated: ${oldLocationDisplay} → ${update.currentLocation}`);
        }
      }
    }
  }

  /**
   * 更新游戏状态中的线索状态
   */
  private updateClueStates(gameState: GameState, clueRevelations: any, gameStateManager: GameStateManager): GameState {
    const stateManager = new GameStateManager(gameState);
    const newDiscoveredClues: string[] = [];
    
    // 更新场景线索状态
    if (clueRevelations.scenarioClues && clueRevelations.scenarioClues.length > 0) {
      const currentScenario = gameState.currentScenario;
      if (currentScenario && currentScenario.clues) {
        clueRevelations.scenarioClues.forEach((clueId: string) => {
          const clue = currentScenario.clues.find(c => c.id === clueId);
          if (clue && !clue.discovered) {
            clue.discovered = true;
            clue.discoveryDetails = {
              discoveredBy: gameState.playerCharacter.name,
              discoveredAt: new Date().toISOString(),
              method: "Keeper revelation"
            };
            newDiscoveredClues.push(clue.clueText);
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
            newDiscoveredClues.push(clue.clueText);
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
          newDiscoveredClues.push(`Secret: ${secret}`);
        }
      });
    }

    // 将新发现的线索添加到全局发现列表
    newDiscoveredClues.forEach(clueText => {
      if (!gameState.discoveredClues.includes(clueText)) {
        gameState.discoveredClues.push(clueText);
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
