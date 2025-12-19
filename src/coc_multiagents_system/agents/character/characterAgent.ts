import { ModelClass } from "../../../models/types.js";
import { generateText } from "../../../models/index.js";
import { GameState, GameStateManager, NPCResponseAnalysis, ActionType } from "../../../state.js";
import type { CharacterProfile, NPCProfile } from "../models/gameTypes.js";
import { getCharacterTemplate } from "./characterTemplate.js";
import { composeTemplate } from "../../../template.js";

/**
 * Character Agent class - handles NPC response analysis
 */
export class CharacterAgent {
  
  /**
   * Analyze NPC responses to character actions
   */
  async analyzeNPCResponses(
    runtime: any,
    gameState: GameState,
    characterInput: string
  ): Promise<NPCResponseAnalysis[]> {
    const template = getCharacterTemplate();
    
    // 1. Get latest action result
    const latestActionResult = this.getLatestActionResult(gameState);
    
    // 2. Get current scenario information
    const scenarioInfo = this.extractScenarioInfo(gameState);
    
    // 3. Get player character information
    const playerCharacter = this.extractCharacterInfo(gameState.playerCharacter);
    
    // 4. Get NPCs in current scene location
    const sceneNpcs = this.extractSceneNPCs(gameState);
    
    // If no NPCs in scene, return empty array
    if (sceneNpcs.length === 0) {
      console.log("📝 [Character Agent] No NPCs in current scene, skipping response analysis");
      return [];
    }
    
    // 5. Get target information from action analysis to determine if action is targeted
    const actionAnalysis = gameState.temporaryInfo.currentActionAnalysis;
    const actionTarget = actionAnalysis?.target || null;
    
    // Build template context
    const templateContext = {
      characterInput,
      latestActionResultJson: latestActionResult ? JSON.stringify(latestActionResult, null, 2) : "No action result available yet.",
      scenarioInfoJson: JSON.stringify(scenarioInfo, null, 2),
      playerCharacterJson: JSON.stringify(playerCharacter, null, 2),
      sceneNpcsJson: JSON.stringify(sceneNpcs, null, 2),
      actionTargetJson: actionTarget ? JSON.stringify(actionTarget, null, 2) : null
    };
    
    const context = composeTemplate(template, {}, templateContext, "handlebars");
    
    console.log("\n🎭 [Character Agent] Analyzing NPC responses...");
    console.log(`   Scene: ${scenarioInfo.location || "Unknown"}`);
    console.log(`   NPCs to analyze: ${sceneNpcs.length}`);
    
    // Call LLM
    const response = await generateText({
      runtime,
      context,
      modelClass: ModelClass.SMALL,
    });
    
    // Parse JSON response
    let parsed;
    try {
      // Extract JSON from markdown code blocks if present
      let jsonText = response.trim();
      
      // Try to extract JSON from markdown code blocks
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
        console.log(`📝 [Character Agent] 检测到 markdown 代码块，已提取 JSON 内容`);
      }
      
      // Try to extract JSON object if wrapped in other text
      if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
        const jsonObjectMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonText = jsonObjectMatch[0];
          console.log(`📝 [Character Agent] 从文本中提取 JSON 对象`);
        }
      }
      
      parsed = JSON.parse(jsonText);
    } catch (error) {
      console.error(`❌ [Character Agent] JSON 解析错误:`, error);
      console.error(`   原始响应 (前500字符): ${response.substring(0, 500)}${response.length > 500 ? '...' : ''}`);
      return [];
    }
    
    // Extract and validate NPC response analyses
    const analyses: NPCResponseAnalysis[] = [];
    
    // Valid action types
    const validActionTypes: ActionType[] = [
      "exploration", "social", "stealth", "combat", 
      "chase", "mental", "environmental", "narrative"
    ];
    
    if (parsed.npcResponseAnalyses && Array.isArray(parsed.npcResponseAnalyses)) {
      for (const analysis of parsed.npcResponseAnalyses) {
        // Validate required fields
        if (analysis.npcName && typeof analysis.willRespond === 'boolean') {
          // Validate responseType
          let responseType: ActionType | "none" | null = null;
          if (analysis.willRespond) {
            if (analysis.responseType === "none") {
              responseType = "none";
            } else if (analysis.responseType && validActionTypes.includes(analysis.responseType as ActionType)) {
              responseType = analysis.responseType as ActionType;
            } else {
              console.warn(`⚠️ [Character Agent] Invalid responseType for ${analysis.npcName}: ${analysis.responseType}, defaulting to null`);
              responseType = null;
            }
          }
          
          const validated: NPCResponseAnalysis = {
            npcName: analysis.npcName,
            willRespond: analysis.willRespond,
            responseType: responseType,
            responseDescription: analysis.responseDescription || "",
            executionOrder: typeof analysis.executionOrder === 'number' ? analysis.executionOrder : 999,
            targetCharacter: analysis.targetCharacter || null
          };
          
          analyses.push(validated);
          
          console.log(`   ✓ ${validated.npcName}: ${validated.willRespond ? validated.responseType : 'no response'}`);
        }
      }
    }
    
    console.log(`\n✅ [Character Agent] Analyzed ${analyses.length} NPC responses`);
    
    return analyses;
  }
  
  /**
   * Get latest action result
   */
  private getLatestActionResult(gameState: GameState): any | null {
    const actionResults = gameState.temporaryInfo.actionResults;
    
    if (!actionResults || actionResults.length === 0) {
      return null;
    }
    
    const latest = actionResults[actionResults.length - 1];
    
    return {
      gameTime: latest.gameTime,
      timeElapsedMinutes: latest.timeElapsedMinutes,
      location: latest.location,
      character: latest.character,
      result: latest.result,
      timeConsumption: latest.timeConsumption,
      scenarioChanges: latest.scenarioChanges || []
    };
  }
  
  /**
   * Extract scenario information
   */
  private extractScenarioInfo(gameState: GameState): any {
    const currentScenario = gameState.currentScenario;
    
    if (!currentScenario) {
      return {
        hasScenario: false,
        message: "No current scenario loaded"
      };
    }
    
    return {
      id: currentScenario.id,
      name: currentScenario.name,
      location: currentScenario.location,
      description: currentScenario.description,
      characters: currentScenario.characters || [],
      clues: currentScenario.clues || [],
      conditions: currentScenario.conditions || [],
      events: currentScenario.events || [],
      exits: currentScenario.exits || [],
      permanentChanges: currentScenario.permanentChanges || []
    };
  }
  
  /**
   * Extract character information (basic attributes)
   */
  private extractCharacterInfo(character: CharacterProfile): any {
    return {
      id: character.id,
      name: character.name,
      attributes: character.attributes,
      status: character.status,
      skills: character.skills,
      inventory: character.inventory || [],
      notes: character.notes || ""
    };
  }
  
  /**
   * 标准化名称（用于模糊匹配）
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
      .trim();
  }

  /**
   * 计算两个字符串的Levenshtein距离（编辑距离）
   */
  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      Array(n + 1).fill(0)
    );

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }

  /**
   * 判断两个名称是否相似（相似度 >= 80%）
   */
  private isNameSimilar(name1: string, name2: string): boolean {
    const na = this.normalizeName(name1);
    const nb = this.normalizeName(name2);
    if (!na || !nb) return false;
    if (na === nb) return true;

    // 如果首词相同，认为相似
    const tokensA = na.split(/\s+/);
    const tokensB = nb.split(/\s+/);
    if (tokensA[0] && tokensA[0] === tokensB[0]) return true;

    // 计算Levenshtein距离并转换为相似度
    const dist = this.levenshtein(na, nb);
    const maxLen = Math.max(na.length, nb.length);
    if (maxLen === 0) return false;
    const similarity = 1 - dist / maxLen;
    return similarity >= 0.8; // 80%相似度阈值
  }

  /**
   * Extract NPCs in current scene location
   */
  private extractSceneNPCs(gameState: GameState): any[] {
    const currentScenario = gameState.currentScenario;
    
    if (!currentScenario || !currentScenario.location) {
      return [];
    }
    
    const scenarioLocation = currentScenario.location;
    const sceneNpcs: any[] = [];
    
    // Get NPCs from scenario characters list
    const scenarioCharacterNames = new Set(
      (currentScenario.characters || []).map(c => c.name.toLowerCase())
    );
    
    // First, add NPCs explicitly listed in scenario (使用80%相似度的模糊匹配)
    for (const scenarioChar of currentScenario.characters || []) {
      const matchingNpc = gameState.npcCharacters.find(npc =>
        this.isNameSimilar(npc.name, scenarioChar.name)
      );
      
      if (matchingNpc) {
        sceneNpcs.push(this.extractNPCInfo(matchingNpc));
      }
    }
    
    // Then, add NPCs with matching currentLocation
    for (const npc of gameState.npcCharacters) {
      const npcProfile = npc as NPCProfile;
      
      if (npcProfile.currentLocation &&
          npcProfile.currentLocation.toLowerCase() === scenarioLocation.toLowerCase()) {
        
        // Check if already added (avoid duplicates)
        const alreadyAdded = sceneNpcs.some(sn => 
          sn.name.toLowerCase() === npc.name.toLowerCase()
        );
        
        if (!alreadyAdded) {
          sceneNpcs.push(this.extractNPCInfo(npc));
        }
      }
    }
    
    return sceneNpcs;
  }
  
  /**
   * Extract NPC information (basic attributes)
   */
  private extractNPCInfo(npc: CharacterProfile): any {
    const npcProfile = npc as NPCProfile;
    
    return {
      id: npc.id,
      name: npc.name,
      occupation: npcProfile.occupation || "Unknown",
      age: npcProfile.age || "Unknown",
      appearance: npcProfile.appearance || "No description",
      personality: npcProfile.personality || "Unknown personality",
      background: npcProfile.background || "Unknown background",
      goals: npcProfile.goals || [],
      secrets: npcProfile.secrets || [],
      attributes: npc.attributes,
      status: npc.status,
      skills: npc.skills,
      inventory: npc.inventory || [],
      clues: npcProfile.clues || [],
      relationships: npcProfile.relationships || [],
      currentLocation: npcProfile.currentLocation || null,
      notes: npc.notes || ""
    };
  }
}