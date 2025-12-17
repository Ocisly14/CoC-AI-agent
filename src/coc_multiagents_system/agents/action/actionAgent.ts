import { ModelClass } from "../../../models/types.js";
import { generateText } from "../../../models/index.js";
import { GameStateManager, GameState, ActionResult, ActionAnalysis, SceneChangeRequest, NPCResponseAnalysis, ActionType } from "../../../state.js";
import type { CharacterProfile, ActionLogEntry, NPCProfile } from "../models/gameTypes.js";
import { actionTypeTemplates } from "./example.js";


/**
 * Action Agent class - handles action resolution and skill checks
 */
export class ActionAgent {

  /**
   * Process character action and resolve with dice rolls and state updates
   */
  async processAction(runtime: any, gameState: GameState, userMessage: string): Promise<GameState> {
    const baseSystemPrompt = `You are an action resolution specialist for Call of Cthulhu.

Your job is to analyze character actions and resolve them step by step. You MUST respond with JSON in one of these formats:

FOR TOOL CALLS (when you need to roll dice):
{
  "type": "tool_call",
  "tool": "roll_dice",
  "parameters": {
    "expression": "1d100"
  }
}

FOR FINAL RESULTS (when you have everything needed):
Include "scenarioUpdate" if the action permanently changes the environment. "scenarioUpdate" can include:
- description: updated scene flavor text
- conditions: array of environmental condition objects
- events: array of event strings
- exits: array of exit objects
- clues: array of clue objects
- permanentChanges: array of strings describing lasting structural/environment changes (these will be stored permanently)

TIME ESTIMATION:
Estimate how many minutes this action realistically takes in game time. Consider the nature and complexity of the action:
- Quick actions: 1-10 minutes (glancing, brief conversation, opening doors)
- Standard actions: 10-30 minutes (searching, examining, skill checks)
- Extended actions: 30-120 minutes (combat, lengthy conversations, research)
- Long activities: 2-8 hours (travel, surveillance, extended tasks)
- Very long activities: 8+ hours (sleeping, all-day journeys)

Be realistic and use your judgment. Include "timeElapsedMinutes" in your response.

SCENE CHANGE DETECTION:
1. Determine if player intends to move to a new location (entering/exiting rooms, moving between areas, climbing/crossing obstacles)
2. If movement requires a skill check (locked door, difficult terrain, stealth entry), call roll_dice first and base scene change on the result
3. If movement is unobstructed (open door, clear path), directly return sceneChange with shouldChange: true
4. If no movement intent, return sceneChange with shouldChange: false
`;

    const actionTypeTemplate = this.getActionTypeTemplate(gameState);

    const diceGuidelines = `

DICE ROLLING GUIDELINES:
1. Use character skills from the provided character data to determine appropriate skill checks
2. Apply environmental conditions and temporary rules as modifiers when calculating success thresholds
3. For skill checks: Always use 1d100, compare against modified skill value
4. For damage: Use weapon damage dice (1d3 for fist, 1d6 for knife, 2d6 for gun, etc.)
5. For attribute checks: Use 1d100, compare against attribute value
6. For luck rolls: Use 1d100, compare against Luck value
7. Consider situational modifiers from scenario conditions and temporary rules

EXAMPLES:
- Fighting (Brawl) skill 50% in darkness (-20%): Roll 1d100, succeed if ≤30
- Damage from successful punch: Roll 1d3+STR bonus
- Sanity loss from horror: Roll 1d4, 1d8, etc. based on threat level
- Dodge in difficult terrain: Roll 1d100, compare against modified Dodge skill

Always analyze the current situation, character capabilities, environmental conditions, and applicable rules before determining what dice to roll.

IMPORTANT: You MUST respond with valid JSON format only. Do not include any text outside the JSON structure.`;

    const systemPrompt = baseSystemPrompt + actionTypeTemplate + diceGuidelines;

    // Tool call loop
    const toolLogs: string[] = [];
    let conversation = [`Character action: ${userMessage}`];
    let maxIterations = 10;
    
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const characterContext = this.buildCharacterContext(gameState);
      const contextWithHistory = systemPrompt + characterContext + "\n\nConversation so far:\n" + conversation.join("\n");
      
      const response = await generateText({
        runtime,
        context: contextWithHistory,
        modelClass: ModelClass.SMALL,
      });

      // Parse JSON response - handle markdown code blocks
      let parsed;
      try {
        // Extract JSON from markdown code blocks if present
        let jsonText = response.trim();
        
        // Try to extract JSON from markdown code blocks (```json ... ``` or ``` ... ```)
        const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (codeBlockMatch) {
          jsonText = codeBlockMatch[1].trim();
          console.log(`📝 [Action Agent] 检测到 markdown 代码块，已提取 JSON 内容`);
        }
        
        // Try to extract JSON object if wrapped in other text
        if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
          const jsonObjectMatch = jsonText.match(/\{[\s\S]*\}/);
          if (jsonObjectMatch) {
            jsonText = jsonObjectMatch[0];
            console.log(`📝 [Action Agent] 从文本中提取 JSON 对象`);
          }
        }
        
        parsed = JSON.parse(jsonText);
      } catch (error) {
        console.error(`❌ [Action Agent] JSON 解析错误:`, error);
        console.error(`   错误类型: ${error instanceof Error ? error.constructor.name : typeof error}`);
        console.error(`   错误消息: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`   原始响应 (前500字符): ${response.substring(0, 500)}${response.length > 500 ? '...' : ''}`);
        console.error(`   原始响应长度: ${response.length} 字符`);
        return this.buildErrorResult(gameState, `Invalid JSON response from model: ${error instanceof Error ? error.message : String(error)}`, toolLogs);
      }

      if (parsed.type === "tool_call") {
        // Execute tool call
        if (parsed.tool === "roll_dice" && parsed.parameters?.expression) {
          const rollResult = this.executeDiceRoll(parsed.parameters.expression);
          if (rollResult.error) {
            console.error(`❌ [Action Agent] 骰子投掷错误: ${rollResult.error}`);
            return this.buildErrorResult(gameState, `Dice roll error: ${rollResult.error}`, toolLogs);
          }
          conversation.push(`AI: ${JSON.stringify(parsed)}`);
          conversation.push(`Tool result: ${JSON.stringify(rollResult)}`);
          toolLogs.push(`${parsed.parameters.expression} -> ${rollResult.breakdown}`);
        } else {
          console.error(`❌ [Action Agent] 无效的工具调用格式:`, parsed);
          return this.buildErrorResult(gameState, `Invalid tool call format: ${JSON.stringify(parsed)}`, toolLogs);
        }
      } else if (parsed.type === "result") {
        // Final result
        return this.buildFinalResult(gameState, parsed, toolLogs);
      } else {
        console.error(`❌ [Action Agent] 无效的响应类型:`, parsed);
        return this.buildErrorResult(gameState, `Invalid response type: ${parsed.type || 'unknown'}`, toolLogs);
      }
    }
    
    console.error(`❌ [Action Agent] 达到最大迭代次数 (${maxIterations})`);
    return this.buildErrorResult(gameState, "Maximum iterations reached", toolLogs);
  }

  private executeDiceRoll(expression: string) {
    try {
      const { count, sides, modifier } = this.parseDiceExpression(expression);
      
      const rolls = Array.from(
        { length: count },
        () => Math.floor(Math.random() * sides) + 1
      );
      
      const rollTotal = rolls.reduce((a, b) => a + b, 0);
      const finalTotal = rollTotal + modifier;
      
      return {
        expression,
        rolls,
        rollTotal,
        modifier,
        total: finalTotal,
        breakdown: `${rolls.join('+')}${modifier !== 0 ? `${modifier >= 0 ? '+' : ''}${modifier}` : ''} = ${finalTotal}`
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private parseDiceExpression(expression: string): { count: number; sides: number; modifier: number } {
    const cleaned = expression.toLowerCase().replace(/\s/g, '');
    const match = cleaned.match(/^(\d*)d(\d+)(([+-])(\d+))?$/);
    
    if (!match) {
      throw new Error(`Invalid dice expression: ${expression}`);
    }
    
    const count = parseInt(match[1] || '1');
    const sides = parseInt(match[2]);
    const modifierSign = match[4] || '+';
    const modifierValue = parseInt(match[5] || '0');
    const modifier = modifierSign === '+' ? modifierValue : -modifierValue;
    
    return { count, sides, modifier };
  }

  private getActionTypeTemplate(gameState: GameState): string {
    const actionAnalysis = gameState.temporaryInfo.currentActionAnalysis;
    
    if (!actionAnalysis || !actionAnalysis.actionType) {
      return `
{
  "type": "result",
  "summary": "Action completed",
  "stateUpdate": {
    "playerCharacter": {
      "name": "Character Name",
      "status": { "hp": 0 }
    }
  },
  "log": ["Action log entry"]
}`;
    }

    const template =
      actionTypeTemplates[actionAnalysis.actionType as keyof typeof actionTypeTemplates];
    return template || actionTypeTemplates.exploration; // fallback to exploration
  }

  private buildCharacterContext(gameState: GameState): string {
    const actionAnalysis = gameState.temporaryInfo.currentActionAnalysis;
    
    let context = "\n\nCurrent Scenario:\n";
    if (gameState.currentScenario) {
      const scenarioInfo = {
        name: gameState.currentScenario.name,
        location: gameState.currentScenario.location,
        description: gameState.currentScenario.description,
        conditions: gameState.currentScenario.conditions,
        permanentChanges: gameState.currentScenario.permanentChanges,
        exits: gameState.currentScenario.exits || []
      };
      context += JSON.stringify(scenarioInfo, null, 2);
    } else {
      context += "No current scenario";
    }
    
    // Add temporary rules if any
    if (gameState.temporaryInfo.rules.length > 0) {
      context += "\n\nTemporary Rules:\n";
      gameState.temporaryInfo.rules.forEach((rule, index) => {
        context += `${index + 1}. ${rule}\n`;
      });
    }
    
    context += "\n\nCharacter:\n" + JSON.stringify(gameState.playerCharacter, null, 2);
    
    // Add target NPC if applicable
    if (actionAnalysis?.target.name) {
      const targetNpc = gameState.npcCharacters.find(npc => 
        npc.name.toLowerCase().includes(actionAnalysis.target.name!.toLowerCase()) ||
        npc.id.toLowerCase().includes(actionAnalysis.target.name!.toLowerCase())
      );
      
      if (targetNpc) {
        context += "\n\nTarget NPC:\n" + JSON.stringify(targetNpc, null, 2);
      }
    }
    
    return context;
  }

  private buildFinalResult(gameState: GameState, parsed: any, toolLogs: string[]): GameState {
    const stateManager = new GameStateManager(gameState);
    
    // Apply the state update from LLM result
    if (parsed.stateUpdate) {
      stateManager.applyActionUpdate(parsed.stateUpdate);
    }

    // Handle scene change request
    if (parsed.sceneChange) {
      const sceneChangeRequest: SceneChangeRequest = {
        shouldChange: parsed.sceneChange.shouldChange || false,
        targetSceneName: parsed.sceneChange.targetSceneName || null,
        reason: parsed.sceneChange.reason || "Action-driven scene change",
        timestamp: new Date()
      };
      stateManager.setSceneChangeRequest(sceneChangeRequest);
      
      console.log(`Action Agent: Scene change request - `, sceneChangeRequest);
    }

    // Apply scenario updates if provided
    const scenarioChanges: string[] = [];
    if (parsed.scenarioUpdate) {
      stateManager.updateScenarioState(parsed.scenarioUpdate);
      
      // Generate scenario change descriptions for action results
      if (parsed.scenarioUpdate.description) {
        scenarioChanges.push("Environment description updated");
      }
      
      if (parsed.scenarioUpdate.conditions && parsed.scenarioUpdate.conditions.length > 0) {
        scenarioChanges.push(`Environmental conditions changed: ${parsed.scenarioUpdate.conditions.map((c: any) => c.description).join(', ')}`);
      }
      
      if (parsed.scenarioUpdate.events && parsed.scenarioUpdate.events.length > 0) {
        scenarioChanges.push(`New events recorded: ${parsed.scenarioUpdate.events.join(', ')}`);
      }
      
      if (parsed.scenarioUpdate.permanentChanges && parsed.scenarioUpdate.permanentChanges.length > 0) {
        parsed.scenarioUpdate.permanentChanges.forEach((change: string) => {
          scenarioChanges.push(`Permanent change: ${change}`);
          stateManager.addPermanentScenarioChange(change);
        });
      }

      if (parsed.scenarioUpdate.exits && parsed.scenarioUpdate.exits.length > 0) {
        parsed.scenarioUpdate.exits.forEach((exit: any) => {
          const changeDesc = `Exit ${exit.direction} to ${exit.destination}: ${exit.condition || 'modified'}`;
          scenarioChanges.push(changeDesc);
          // Record structural changes as permanent
          stateManager.addPermanentScenarioChange(`${parsed.stateUpdate?.playerCharacter?.name || 'Character'} modified ${exit.direction} exit - ${changeDesc}`);
        });
      }
      
      if (parsed.scenarioUpdate.clues && parsed.scenarioUpdate.clues.length > 0) {
        parsed.scenarioUpdate.clues.forEach((clue: any) => {
          if (clue.discovered) {
            scenarioChanges.push(`Clue discovered: ${clue.id}`);
          } else {
            scenarioChanges.push(`Clue modified: ${clue.id}`);
          }
        });
      }
    }
    
    // Create structured action result
    const actionResult: ActionResult = {
      timestamp: new Date(),
      gameTime: gameState.timeOfDay || "Unknown time",
      timeElapsedMinutes: parsed.timeElapsedMinutes || 0,
      location: gameState.currentScenario?.location || "Unknown location", 
      character: parsed.stateUpdate?.playerCharacter?.name || gameState.playerCharacter.name,
      result: parsed.summary || "performed an action",
      diceRolls: toolLogs.map(log => log), // toolLogs already contain "expression -> result" format
      timeConsumption: parsed.timeConsumption || "instant", // Default to instant if not specified
      scenarioChanges: scenarioChanges.length > 0 ? scenarioChanges : undefined
    };
    
    // Add to action results
    stateManager.addActionResult(actionResult);

    // Log detailed action result
    console.log("\n📊 [Action Result] 详细执行结果:");
    console.log(`   Character: ${actionResult.character}`);
    console.log(`   Location: ${actionResult.location}`);
    console.log(`   Game Time: ${actionResult.gameTime}`);
    console.log(`   Time Elapsed: ${actionResult.timeElapsedMinutes || 0} minutes`);
    console.log(`   Time Consumption: ${actionResult.timeConsumption}`);
    console.log(`   Result: ${actionResult.result}`);
    if (actionResult.diceRolls && actionResult.diceRolls.length > 0) {
      console.log(`   Dice Rolls (${actionResult.diceRolls.length}):`);
      actionResult.diceRolls.forEach((roll, index) => {
        console.log(`     [${index + 1}] ${roll}`);
      });
    } else {
      console.log(`   Dice Rolls: None`);
    }
    if (actionResult.scenarioChanges && actionResult.scenarioChanges.length > 0) {
      console.log(`   Scenario Changes (${actionResult.scenarioChanges.length}):`);
      actionResult.scenarioChanges.forEach((change, index) => {
        console.log(`     [${index + 1}] ${change}`);
      });
    }

    // Update game time based on elapsed time
    if (actionResult.timeElapsedMinutes && actionResult.timeElapsedMinutes > 0) {
      const oldDay = gameState.gameDay;
      const oldTime = gameState.timeOfDay;
      stateManager.updateGameTime(actionResult.timeElapsedMinutes);
      const updatedState = stateManager.getGameState();
      const newDay = updatedState.gameDay;
      const newTime = updatedState.timeOfDay;
      const fullTime = stateManager.getFullGameTime();
      
      console.log(`⏰ Time advanced by ${actionResult.timeElapsedMinutes} minutes`);
      if (newDay > oldDay) {
        console.log(`   Day ${oldDay}, ${oldTime} → ${fullTime} 🌅`);
      } else {
        console.log(`   ${oldTime} → ${fullTime}`);
      }
    }

    // Append summary to action logs for actor and target (if any)
    const logEntry: ActionLogEntry = {
      time: actionResult.gameTime,
      summary: actionResult.result,
    };
    const actionAnalysis = gameState.temporaryInfo.currentActionAnalysis;
    const targetName = actionAnalysis?.target?.name;
    const updatedState = stateManager.getGameState() as GameState;

    const appendLog = (character: CharacterProfile | undefined) => {
      if (!character) return;
      if (!character.actionLog) {
        character.actionLog = [];
      }
      character.actionLog.push(logEntry);
    };

    // Acting character (player or NPC)
    const actorNameLower = actionResult.character.toLowerCase();
    if (updatedState.playerCharacter.name.toLowerCase() === actorNameLower) {
      appendLog(updatedState.playerCharacter);
    } else {
      const actorNpc = updatedState.npcCharacters.find(
        (npc) => npc.name.toLowerCase() === actorNameLower
      );
      appendLog(actorNpc);
    }

    // Target character (if present)
    if (targetName) {
      const targetLower = targetName.toLowerCase();
      if (updatedState.playerCharacter.name.toLowerCase().includes(targetLower)) {
        appendLog(updatedState.playerCharacter);
      } else {
        const targetNpc = updatedState.npcCharacters.find((npc) =>
          npc.name.toLowerCase().includes(targetLower)
        );
        appendLog(targetNpc);
      }
    }
    
    // Return the updated game state
    return stateManager.getGameState() as GameState;
  }


  /**
   * Build error result as a valid GameState with error information recorded in action results
   */
  private buildErrorResult(gameState: GameState, errorMessage: string, toolLogs: string[]): GameState {
    console.error(`\n❌ [Action Agent] 错误处理: ${errorMessage}`);
    console.error(`   当前游戏状态: Day ${gameState.gameDay}, ${gameState.timeOfDay}`);
    console.error(`   位置: ${gameState.currentScenario?.location || "Unknown"}`);
    console.error(`   角色: ${gameState.playerCharacter.name}`);
    if (toolLogs.length > 0) {
      console.error(`   已执行的工具调用 (${toolLogs.length}):`);
      toolLogs.forEach((log, index) => {
        console.error(`     [${index + 1}] ${log}`);
      });
    }
    
    const stateManager = new GameStateManager(gameState);
    const actionAnalysis = gameState.temporaryInfo.currentActionAnalysis;
    
    // Create an error action result to record the failure
    const errorActionResult: ActionResult = {
      timestamp: new Date(),
      gameTime: gameState.timeOfDay || "Unknown time",
      timeElapsedMinutes: 0, // No time elapsed on error
      location: gameState.currentScenario?.location || "Unknown location",
      character: actionAnalysis?.character || gameState.playerCharacter.name,
      result: `[错误] 动作处理失败: ${errorMessage}`,
      diceRolls: toolLogs.length > 0 ? toolLogs : [],
      timeConsumption: "instant",
      scenarioChanges: [`错误: ${errorMessage}`]
    };
    
    // Add error result to action results
    stateManager.addActionResult(errorActionResult);
    
    console.error(`\n📊 [Action Result] 错误结果已记录:`);
    console.error(`   Character: ${errorActionResult.character}`);
    console.error(`   Location: ${errorActionResult.location}`);
    console.error(`   Error: ${errorActionResult.result}`);
    
    // Return valid GameState with error recorded
    return stateManager.getGameState() as GameState;
  }

  /**
   * Process NPC actions based on response analyses
   * Processes all NPCs that have willRespond=true in npcResponseAnalyses
   */
  async processNPCActions(runtime: any, gameState: GameState): Promise<GameState> {
    const npcResponseAnalyses = gameState.temporaryInfo.npcResponseAnalyses || [];
    
    // Filter NPCs that will respond
    const respondingNPCs = npcResponseAnalyses.filter(analysis => analysis.willRespond && analysis.responseType && analysis.responseType !== "none");
    
    if (respondingNPCs.length === 0) {
      console.log("📝 [Action Agent] No NPCs will respond, skipping NPC action processing");
      return gameState;
    }
    
    console.log(`\n🎭 [Action Agent] Processing ${respondingNPCs.length} NPC actions...`);
    
    let currentState = gameState;
    
    // Process each NPC action sequentially
    for (const npcResponse of respondingNPCs) {
      const npc = currentState.npcCharacters.find(n => 
        n.name.toLowerCase() === npcResponse.npcName.toLowerCase()
      );
      
      if (!npc) {
        console.warn(`⚠️ [Action Agent] NPC not found: ${npcResponse.npcName}`);
        continue;
      }
      
      console.log(`\n🎭 [Action Agent] Processing NPC action: ${npcResponse.npcName} (${npcResponse.responseType})`);
      
      // Process this NPC's action
      currentState = await this.processSingleNPCAction(
        runtime,
        currentState,
        npc,
        npcResponse
      );
    }
    
    console.log(`\n✅ [Action Agent] Completed processing ${respondingNPCs.length} NPC actions`);
    
    return currentState;
  }

  /**
   * Process a single NPC action
   */
  private async processSingleNPCAction(
    runtime: any,
    gameState: GameState,
    npc: CharacterProfile,
    npcResponse: NPCResponseAnalysis
  ): Promise<GameState> {
    const baseSystemPrompt = `You are an action resolution specialist for Call of Cthulhu.

You are processing an NPC's action. The NPC will perform an action based on their response to a previous character action.

Your job is to resolve the NPC's action step by step. You MUST respond with JSON in one of these formats:

FOR TOOL CALLS (when you need to roll dice):
{
  "type": "tool_call",
  "tool": "roll_dice",
  "parameters": {
    "expression": "1d100"
  }
}

FOR FINAL RESULTS (when you have everything needed):
Include "scenarioUpdate" if the action permanently changes the environment. "scenarioUpdate" can include:
- description: updated scene flavor text
- conditions: array of environmental condition objects
- events: array of event strings
- exits: array of exit objects
- clues: array of clue objects
- permanentChanges: array of strings describing lasting structural/environment changes (these will be stored permanently)

TIME ESTIMATION:
Estimate how many minutes this action realistically takes in game time. Consider the nature and complexity of the action:
- Quick actions: 1-10 minutes (glancing, brief conversation, opening doors)
- Standard actions: 10-30 minutes (searching, examining, skill checks)
- Extended actions: 30-120 minutes (combat, lengthy conversations, research)
- Long activities: 2-8 hours (travel, surveillance, extended tasks)
- Very long activities: 8+ hours (sleeping, all-day journeys)

Be realistic and use your judgment. Include "timeElapsedMinutes" in your response.

SCENE CHANGE DETECTION:
1. Determine if NPC intends to move to a new location
2. If movement requires a skill check, call roll_dice first and base scene change on the result
3. If movement is unobstructed, directly return sceneChange with shouldChange: true
4. If no movement intent, return sceneChange with shouldChange: false
`;

    // Get action type template based on responseType
    const actionType = npcResponse.responseType as ActionType;
    const actionTypeTemplate = actionTypeTemplates[actionType] || actionTypeTemplates.narrative;
    
    const diceGuidelines = `

DICE ROLLING GUIDELINES:
1. Use NPC skills from the provided NPC data to determine appropriate skill checks
2. Apply environmental conditions and temporary rules as modifiers when calculating success thresholds
3. For skill checks: Always use 1d100, compare against modified skill value
4. For damage: Use weapon damage dice (1d3 for fist, 1d6 for knife, 2d6 for gun, etc.)
5. For attribute checks: Use 1d100, compare against attribute value
6. For luck rolls: Use 1d100, compare against Luck value
7. Consider situational modifiers from scenario conditions and temporary rules

EXAMPLES:
- Fighting (Brawl) skill 50% in darkness (-20%): Roll 1d100, succeed if ≤30
- Damage from successful punch: Roll 1d3+STR bonus
- Sanity loss from horror: Roll 1d4, 1d8, etc. based on threat level
- Dodge in difficult terrain: Roll 1d100, compare against modified Dodge skill

Always analyze the current situation, NPC capabilities, environmental conditions, and applicable rules before determining what dice to roll.

IMPORTANT: You MUST respond with valid JSON format only. Do not include any text outside the JSON structure.`;

    const systemPrompt = baseSystemPrompt + actionTypeTemplate + diceGuidelines;

    // Build NPC action description
    const npcActionDescription = npcResponse.responseDescription || `${npc.name} performs a ${actionType} action`;

    // Tool call loop
    const toolLogs: string[] = [];
    let conversation = [`NPC action: ${npcActionDescription}`];
    let maxIterations = 10;
    
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const npcContext = this.buildNPCContext(gameState, npc, npcResponse);
      const contextWithHistory = systemPrompt + npcContext + "\n\nConversation so far:\n" + conversation.join("\n");
      
      const response = await generateText({
        runtime,
        context: contextWithHistory,
        modelClass: ModelClass.SMALL,
      });

      // Parse JSON response - handle markdown code blocks
      let parsed;
      try {
        let jsonText = response.trim();
        
        const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (codeBlockMatch) {
          jsonText = codeBlockMatch[1].trim();
          console.log(`📝 [Action Agent] 检测到 markdown 代码块，已提取 JSON 内容`);
        }
        
        if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
          const jsonObjectMatch = jsonText.match(/\{[\s\S]*\}/);
          if (jsonObjectMatch) {
            jsonText = jsonObjectMatch[0];
            console.log(`📝 [Action Agent] 从文本中提取 JSON 对象`);
          }
        }
        
        parsed = JSON.parse(jsonText);
      } catch (error) {
        console.error(`❌ [Action Agent] JSON 解析错误:`, error);
        console.error(`   原始响应 (前500字符): ${response.substring(0, 500)}${response.length > 500 ? '...' : ''}`);
        return this.buildNPCErrorResult(gameState, npc, `Invalid JSON response from model: ${error instanceof Error ? error.message : String(error)}`, toolLogs);
      }

      if (parsed.type === "tool_call") {
        // Execute tool call
        if (parsed.tool === "roll_dice" && parsed.parameters?.expression) {
          const rollResult = this.executeDiceRoll(parsed.parameters.expression);
          if (rollResult.error) {
            console.error(`❌ [Action Agent] 骰子投掷错误: ${rollResult.error}`);
            return this.buildNPCErrorResult(gameState, npc, `Dice roll error: ${rollResult.error}`, toolLogs);
          }
          conversation.push(`AI: ${JSON.stringify(parsed)}`);
          conversation.push(`Tool result: ${JSON.stringify(rollResult)}`);
          toolLogs.push(`${parsed.parameters.expression} -> ${rollResult.breakdown}`);
        } else {
          console.error(`❌ [Action Agent] 无效的工具调用格式:`, parsed);
          return this.buildNPCErrorResult(gameState, npc, `Invalid tool call format: ${JSON.stringify(parsed)}`, toolLogs);
        }
      } else if (parsed.type === "result") {
        // Final result
        return this.buildNPCFinalResult(gameState, parsed, toolLogs, npc, npcResponse);
      } else {
        console.error(`❌ [Action Agent] 无效的响应类型:`, parsed);
        return this.buildNPCErrorResult(gameState, npc, `Invalid response type: ${parsed.type || 'unknown'}`, toolLogs);
      }
    }
    
    console.error(`❌ [Action Agent] 达到最大迭代次数 (${maxIterations})`);
    return this.buildNPCErrorResult(gameState, npc, "Maximum iterations reached", toolLogs);
  }

  /**
   * Build context for NPC action processing
   */
  private buildNPCContext(gameState: GameState, npc: CharacterProfile, npcResponse: NPCResponseAnalysis): string {
    let context = "\n\nCurrent Scenario:\n";
    if (gameState.currentScenario) {
      const scenarioInfo = {
        name: gameState.currentScenario.name,
        location: gameState.currentScenario.location,
        description: gameState.currentScenario.description,
        conditions: gameState.currentScenario.conditions,
        permanentChanges: gameState.currentScenario.permanentChanges,
        exits: gameState.currentScenario.exits || []
      };
      context += JSON.stringify(scenarioInfo, null, 2);
    } else {
      context += "No current scenario";
    }
    
    // Add temporary rules if any
    if (gameState.temporaryInfo.rules.length > 0) {
      context += "\n\nTemporary Rules:\n";
      gameState.temporaryInfo.rules.forEach((rule, index) => {
        context += `${index + 1}. ${rule}\n`;
      });
    }
    
    context += "\n\nNPC (acting character):\n" + JSON.stringify(npc, null, 2);
    
    // Add target character if applicable
    if (npcResponse.targetCharacter) {
      const targetLower = npcResponse.targetCharacter.toLowerCase();
      const targetNpc = gameState.npcCharacters.find(n => 
        n.name.toLowerCase().includes(targetLower)
      );
      const targetPlayer = gameState.playerCharacter.name.toLowerCase().includes(targetLower) 
        ? gameState.playerCharacter 
        : null;
      
      if (targetNpc) {
        context += "\n\nTarget NPC:\n" + JSON.stringify(targetNpc, null, 2);
      } else if (targetPlayer) {
        context += "\n\nTarget Character (Player):\n" + JSON.stringify(targetPlayer, null, 2);
      }
    }
    
    // Add NPC response context
    context += "\n\nNPC Response Context:\n";
    context += JSON.stringify({
      responseDescription: npcResponse.responseDescription,
      reasoning: npcResponse.reasoning,
      urgency: npcResponse.urgency
    }, null, 2);
    
    return context;
  }

  /**
   * Build final result for NPC action
   */
  private buildNPCFinalResult(
    gameState: GameState,
    parsed: any,
    toolLogs: string[],
    npc: CharacterProfile,
    npcResponse: NPCResponseAnalysis
  ): GameState {
    const stateManager = new GameStateManager(gameState);
    
    // Apply the state update from LLM result
    if (parsed.stateUpdate) {
      stateManager.applyActionUpdate(parsed.stateUpdate);
    }

    // Handle scene change request (NPCs typically don't trigger scene changes, but handle it if needed)
    if (parsed.sceneChange && parsed.sceneChange.shouldChange) {
      const sceneChangeRequest: SceneChangeRequest = {
        shouldChange: parsed.sceneChange.shouldChange || false,
        targetSceneName: parsed.sceneChange.targetSceneName || null,
        reason: parsed.sceneChange.reason || "NPC action-driven scene change",
        timestamp: new Date()
      };
      stateManager.setSceneChangeRequest(sceneChangeRequest);
      console.log(`Action Agent: NPC scene change request - `, sceneChangeRequest);
    }

    // Apply scenario updates if provided
    const scenarioChanges: string[] = [];
    if (parsed.scenarioUpdate) {
      stateManager.updateScenarioState(parsed.scenarioUpdate);
      
      if (parsed.scenarioUpdate.description) {
        scenarioChanges.push("Environment description updated");
      }
      
      if (parsed.scenarioUpdate.conditions && parsed.scenarioUpdate.conditions.length > 0) {
        scenarioChanges.push(`Environmental conditions changed: ${parsed.scenarioUpdate.conditions.map((c: any) => c.description).join(', ')}`);
      }
      
      if (parsed.scenarioUpdate.events && parsed.scenarioUpdate.events.length > 0) {
        scenarioChanges.push(`New events recorded: ${parsed.scenarioUpdate.events.join(', ')}`);
      }
      
      if (parsed.scenarioUpdate.permanentChanges && parsed.scenarioUpdate.permanentChanges.length > 0) {
        parsed.scenarioUpdate.permanentChanges.forEach((change: string) => {
          scenarioChanges.push(`Permanent change: ${change}`);
          stateManager.addPermanentScenarioChange(change);
        });
      }

      if (parsed.scenarioUpdate.exits && parsed.scenarioUpdate.exits.length > 0) {
        parsed.scenarioUpdate.exits.forEach((exit: any) => {
          const changeDesc = `Exit ${exit.direction} to ${exit.destination}: ${exit.condition || 'modified'}`;
          scenarioChanges.push(changeDesc);
          stateManager.addPermanentScenarioChange(`${npc.name} modified ${exit.direction} exit - ${changeDesc}`);
        });
      }
      
      if (parsed.scenarioUpdate.clues && parsed.scenarioUpdate.clues.length > 0) {
        parsed.scenarioUpdate.clues.forEach((clue: any) => {
          if (clue.discovered) {
            scenarioChanges.push(`Clue discovered: ${clue.id}`);
          } else {
            scenarioChanges.push(`Clue modified: ${clue.id}`);
          }
        });
      }
    }
    
    // Create structured action result for NPC
    const actionResult: ActionResult = {
      timestamp: new Date(),
      gameTime: gameState.timeOfDay || "Unknown time",
      timeElapsedMinutes: parsed.timeElapsedMinutes || 0,
      location: gameState.currentScenario?.location || "Unknown location",
      character: npc.name,
      result: parsed.summary || npcResponse.responseDescription || "NPC performed an action",
      diceRolls: toolLogs.map(log => log),
      timeConsumption: parsed.timeConsumption || "instant",
      scenarioChanges: scenarioChanges.length > 0 ? scenarioChanges : undefined
    };
    
    // Add to action results
    stateManager.addActionResult(actionResult);

    // Log detailed action result
    console.log(`\n📊 [NPC Action Result] ${npc.name}:`);
    console.log(`   Result: ${actionResult.result}`);
    console.log(`   Type: ${npcResponse.responseType}`);
    if (actionResult.diceRolls && actionResult.diceRolls.length > 0) {
      console.log(`   Dice Rolls: ${actionResult.diceRolls.join(', ')}`);
    }

    // Update game time based on elapsed time
    if (actionResult.timeElapsedMinutes && actionResult.timeElapsedMinutes > 0) {
      stateManager.updateGameTime(actionResult.timeElapsedMinutes);
    }

    // Append summary to action logs
    const logEntry: ActionLogEntry = {
      time: actionResult.gameTime,
      summary: actionResult.result,
    };
    
    const updatedState = stateManager.getGameState() as GameState;
    
    if (!npc.actionLog) {
      npc.actionLog = [];
    }
    npc.actionLog.push(logEntry);
    
    // If target character exists, add log to target as well
    if (npcResponse.targetCharacter) {
      const targetLower = npcResponse.targetCharacter.toLowerCase();
      if (updatedState.playerCharacter.name.toLowerCase().includes(targetLower)) {
        if (!updatedState.playerCharacter.actionLog) {
          updatedState.playerCharacter.actionLog = [];
        }
        updatedState.playerCharacter.actionLog.push(logEntry);
      } else {
        const targetNpc = updatedState.npcCharacters.find(n =>
          n.name.toLowerCase().includes(targetLower)
        );
        if (targetNpc) {
          if (!targetNpc.actionLog) {
            targetNpc.actionLog = [];
          }
          targetNpc.actionLog.push(logEntry);
        }
      }
    }
    
    return stateManager.getGameState() as GameState;
  }

  /**
   * Build error result for NPC action
   */
  private buildNPCErrorResult(
    gameState: GameState,
    npc: CharacterProfile,
    errorMessage: string,
    toolLogs: string[]
  ): GameState {
    console.error(`\n❌ [Action Agent] NPC 动作处理错误 (${npc.name}): ${errorMessage}`);
    
    const stateManager = new GameStateManager(gameState);
    
    const errorActionResult: ActionResult = {
      timestamp: new Date(),
      gameTime: gameState.timeOfDay || "Unknown time",
      timeElapsedMinutes: 0,
      location: gameState.currentScenario?.location || "Unknown location",
      character: npc.name,
      result: `[错误] NPC 动作处理失败: ${errorMessage}`,
      diceRolls: toolLogs.length > 0 ? toolLogs : [],
      timeConsumption: "instant",
      scenarioChanges: [`错误: ${errorMessage}`]
    };
    
    stateManager.addActionResult(errorActionResult);
    
    return stateManager.getGameState() as GameState;
  }
}
