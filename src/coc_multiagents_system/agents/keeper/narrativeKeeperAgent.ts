import { getNarrativeKeeperTemplate } from "./narrativeKeeperTemplate.js";
import { composeTemplate } from "../../../template.js";
import type { GameState, ActionResult, ActionAnalysis } from "../../../state.js";
import { GameStateManager } from "../../../state.js";
import type { CharacterProfile, NPCProfile } from "../models/gameTypes.js";
import {
  ModelProviderName,
  ModelClass,
  generateText,
} from "../../../models/index.js";

interface NarrativeKeeperRuntime {
  modelProvider: ModelProviderName;
  getSetting: (key: string) => string | undefined;
}

const createRuntime = (): NarrativeKeeperRuntime => ({
  modelProvider: (process.env.MODEL_PROVIDER as ModelProviderName) || ModelProviderName.OPENAI,
  getSetting: (key: string) => process.env[key],
});

/**
 * Narrative Keeper Agent - 专门处理无检定的narrative行动
 * 包括聊天对话、简单场景互动、角色扮演等
 */
export class NarrativeKeeperAgent {

  /**
   * 生成narrative行动的叙事描述和状态更新
   */
  async generateNarrativeResponse(userQuery: string, gameStateManager: GameStateManager): Promise<{narrative: string, stateUpdates: any, updatedGameState: GameState}> {
    const runtime = createRuntime();
    const gameState = gameStateManager.getGameState();
    
    // 获取当前action analysis
    const actionAnalysis = gameState.temporaryInfo.currentActionAnalysis;
    
    // 提取相关的场景和角色信息
    const contextInfo = this.extractNarrativeContext(gameState, actionAnalysis);
    
    // 获取模板
    const template = getNarrativeKeeperTemplate();
    
    // 准备模板上下文
    const templateContext = {
      // 用户输入
      userQuery,
      
      // 行动分析
      actionAnalysis,
      
      // 当前场景简要信息
      currentScenario: gameState.currentScenario ? {
        name: gameState.currentScenario.name,
        location: gameState.currentScenario.location,
        description: gameState.currentScenario.description,
        conditions: gameState.currentScenario.conditions || []
      } : null,
      
      // 玩家角色信息
      playerCharacter: this.formatPlayerForNarrative(gameState.playerCharacter),
      
      // 相关NPC信息
      relevantNpcs: contextInfo.relevantNpcs,
      
      // 场景环境信息
      environmentInfo: contextInfo.environmentInfo,
      
      // 游戏状态
      timeOfDay: gameState.timeOfDay,
      tension: gameState.tension,
      phase: gameState.phase,
      
      // 最近的行动结果（用于上下文连续性）
      recentActions: this.getRecentNarrativeActions(gameState)
    };

    // 使用模板和LLM生成narrative响应
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
      console.error("Failed to parse narrative keeper response as JSON:", error);
      return {
        narrative: response,
        stateUpdates: {},
        updatedGameState: gameState
      };
    }

    // 应用状态更新
    const updatedGameState = this.applyNarrativeUpdates(gameState, parsedResponse.stateUpdates, gameStateManager);

    // 记录narrative行动结果
    this.recordNarrativeAction(updatedGameState, userQuery, parsedResponse.narrative, gameStateManager);

    return {
      narrative: parsedResponse.narrative || response,
      stateUpdates: parsedResponse.stateUpdates || {},
      updatedGameState
    };
  }

  /**
   * 提取narrative行动相关的上下文信息
   */
  private extractNarrativeContext(gameState: GameState, actionAnalysis: ActionAnalysis | null) {
    const relevantNpcs = [];
    const environmentInfo = {
      currentLocation: gameState.currentScenario?.location || "Unknown location",
      atmosphere: "",
      activeElements: []
    };

    // 如果有目标NPC，获取其详细信息
    if (actionAnalysis?.target?.name) {
      const targetNpc = gameState.npcCharacters.find(npc => 
        npc.name.toLowerCase().includes(actionAnalysis.target.name!.toLowerCase())
      );
      
      if (targetNpc) {
        relevantNpcs.push(this.formatNpcForNarrative(targetNpc));
      }
    }

    // 如果没有特定目标，包含场景中的主要NPC（限制数量避免信息过载）
    if (relevantNpcs.length === 0) {
      const mainNpcs = gameState.npcCharacters.slice(0, 2); // 只取前2个NPC
      relevantNpcs.push(...mainNpcs.map(npc => this.formatNpcForNarrative(npc)));
    }

    // 从场景中提取环境信息
    if (gameState.currentScenario) {
      environmentInfo.atmosphere = this.extractAtmosphere(gameState.currentScenario.conditions || []);
      environmentInfo.activeElements = gameState.currentScenario.events || [];
    }

    return {
      relevantNpcs,
      environmentInfo
    };
  }

  /**
   * 为narrative格式化玩家角色信息
   */
  private formatPlayerForNarrative(player: CharacterProfile) {
    return {
      name: player.name,
      id: player.id,
      currentHp: player.status.hp,
      maxHp: player.status.maxHp,
      currentSanity: player.status.sanity,
      maxSanity: player.status.maxSanity,
      conditions: player.status.conditions || [],
      mood: this.determineMood(player.status), // 根据状态判断心情
      notes: player.notes || ""
    };
  }

  /**
   * 为narrative格式化NPC信息
   */
  private formatNpcForNarrative(npc: CharacterProfile) {
    const npcData = npc as NPCProfile;
    return {
      name: npc.name,
      id: npc.id,
      occupation: npcData.occupation || "Unknown",
      appearance: npcData.appearance || "Ordinary appearance",
      personality: npcData.personality || "Reserved",
      currentMood: this.determineMood(npc.status),
      attitude: this.determineAttitude(npcData),
      currentHp: npc.status.hp,
      currentSanity: npc.status.sanity,
      conditions: npc.status.conditions || [],
      backgroundHints: npcData.background || "Unknown background"
    };
  }

  /**
   * 根据角色状态判断心情
   */
  private determineMood(status: any): string {
    const hpRatio = status.hp / status.maxHp;
    const sanityRatio = status.sanity / status.maxSanity;
    
    if (hpRatio < 0.3 || sanityRatio < 0.3) return "distressed";
    if (hpRatio < 0.7 || sanityRatio < 0.7) return "concerned";
    if (status.conditions && status.conditions.length > 0) return "affected";
    
    return "normal";
  }

  /**
   * 确定NPC对玩家的态度
   */
  private determineAttitude(npcData: NPCProfile): string {
    if (!npcData.relationships) return "neutral";
    
    // 简化的态度判断逻辑
    const playerRelation = npcData.relationships.find(rel => 
      rel.relationshipType === "ally" || rel.relationshipType === "friend"
    );
    
    if (playerRelation) {
      if (playerRelation.attitude > 50) return "friendly";
      if (playerRelation.attitude > 0) return "cordial";
      if (playerRelation.attitude < -50) return "hostile";
      return "suspicious";
    }
    
    return "neutral";
  }

  /**
   * 从环境条件中提取氛围信息
   */
  private extractAtmosphere(conditions: any[]): string {
    if (!conditions || conditions.length === 0) return "calm";
    
    const atmosphereKeywords = conditions.map(condition => 
      condition.description || condition.type || ""
    ).join(" ").toLowerCase();
    
    if (atmosphereKeywords.includes("dark") || atmosphereKeywords.includes("shadow")) return "ominous";
    if (atmosphereKeywords.includes("cold") || atmosphereKeywords.includes("wind")) return "chilling";
    if (atmosphereKeywords.includes("fog") || atmosphereKeywords.includes("mist")) return "mysterious";
    if (atmosphereKeywords.includes("noise") || atmosphereKeywords.includes("sound")) return "tense";
    
    return "atmospheric";
  }

  /**
   * 获取最近的narrative行动用于上下文连续性
   */
  private getRecentNarrativeActions(gameState: GameState): any[] {
    const recentActions = gameState.temporaryInfo.actionResults || [];
    return recentActions
      .slice(-3) // 最近3个行动
      .map(action => ({
        character: action.character,
        result: action.result,
        gameTime: action.gameTime
      }));
  }

  /**
   * 应用narrative行动的状态更新
   */
  private applyNarrativeUpdates(gameState: GameState, stateUpdates: any, gameStateManager: GameStateManager): GameState {
    if (!stateUpdates) return gameState;
    
    const stateManager = new GameStateManager(gameState);
    
    // 应用角色状态的微调（narrative行动通常只有轻微影响）
    if (stateUpdates.characterChanges) {
      stateManager.applyActionUpdate(stateUpdates.characterChanges);
    }
    
    // 更新NPC态度和关系
    if (stateUpdates.relationshipChanges) {
      this.updateNpcRelationships(gameState, stateUpdates.relationshipChanges);
    }
    
    // 更新环境状态
    if (stateUpdates.environmentChanges) {
      this.updateEnvironment(gameState, stateUpdates.environmentChanges);
    }
    
    return stateManager.getGameState() as GameState;
  }

  /**
   * 更新NPC关系
   */
  private updateNpcRelationships(gameState: GameState, relationshipChanges: any[]) {
    relationshipChanges.forEach(change => {
      const npc = gameState.npcCharacters.find(n => n.id === change.npcId) as NPCProfile;
      if (npc && npc.relationships) {
        const relation = npc.relationships.find(r => r.targetName === gameState.playerCharacter.name);
        if (relation && change.attitudeChange) {
          relation.attitude = Math.max(-100, Math.min(100, relation.attitude + change.attitudeChange));
        }
      }
    });
  }

  /**
   * 更新环境状态
   */
  private updateEnvironment(gameState: GameState, environmentChanges: any) {
    // 这里可以添加环境变化的逻辑，比如添加新的事件或改变条件
    if (gameState.currentScenario && environmentChanges.newEvents) {
      gameState.currentScenario.events = gameState.currentScenario.events || [];
      gameState.currentScenario.events.push(...environmentChanges.newEvents);
    }
  }

  /**
   * 记录narrative行动结果
   */
  private recordNarrativeAction(gameState: GameState, userQuery: string, narrative: string, gameStateManager: GameStateManager) {
    const actionResult: ActionResult = {
      timestamp: new Date(),
      gameTime: gameState.timeOfDay || "Unknown time",
      location: gameState.currentScenario?.location || "Unknown location",
      character: gameState.playerCharacter.name,
      result: narrative,
      diceRolls: [] // narrative行动没有骰子
    };
    
    const stateManager = new GameStateManager(gameState);
    stateManager.addActionResult(actionResult);
  }

  /**
   * 处理输入并生成narrative响应
   */
  async processInput(input: string, gameStateManager: GameStateManager): Promise<{narrative: string, stateUpdates: any, updatedGameState: GameState}> {
    try {
      const result = await this.generateNarrativeResponse(input, gameStateManager);
      return result;
    } catch (error) {
      console.error("Error generating narrative response:", error);
      return {
        narrative: "The conversation flows naturally, though something seems to have been lost in translation... [Narrative Keeper Agent Error]",
        stateUpdates: {},
        updatedGameState: gameStateManager.getGameState()
      };
    }
  }
}