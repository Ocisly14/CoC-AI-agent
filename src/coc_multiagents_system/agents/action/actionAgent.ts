import { ModelClass } from "../../../models/types.js";
import { generateText } from "../../../models/index.js";
import { actionTools } from "./tools.js";
import { GameStateManager, GameState, ActionResult, ActionAnalysis } from "../../../state.js";
import type { CharacterProfile } from "../models/gameTypes.js";
import { actionTypeTemplates } from "./example.js";


/**
 * Action Agent class - handles action resolution and skill checks
 */
export class ActionAgent {

  /**
   * Process player action and resolve with dice rolls and state updates
   */
  async processAction(runtime: any, gameState: GameState, userMessage: string): Promise<GameState> {
    const baseSystemPrompt = `You are an action resolution specialist for Call of Cthulhu.

Your job is to analyze player actions and resolve them step by step. You MUST respond with JSON in one of these formats:

FOR TOOL CALLS (when you need to roll dice):
{
  "type": "tool_call",
  "tool": "roll_dice",
  "parameters": {
    "expression": "1d100"
  }
}

FOR FINAL RESULTS (when you have everything needed):
Include "scenarioUpdate" if the action permanently changes the environment:`;

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
    let conversation = [`Player action: ${userMessage}`];
    let maxIterations = 10;
    
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const characterContext = this.buildCharacterContext(gameState);
      const contextWithHistory = systemPrompt + characterContext + "\n\nConversation so far:\n" + conversation.join("\n");
      
      const response = await generateText({
        runtime,
        context: contextWithHistory,
        modelClass: ModelClass.SMALL,
      });

      // Parse JSON response
      let parsed;
      try {
        parsed = JSON.parse(response);
      } catch (error) {
        return this.buildErrorResult("Invalid JSON response from model");
      }

      if (parsed.type === "tool_call") {
        // Execute tool call
        if (parsed.tool === "roll_dice" && parsed.parameters?.expression) {
          const rollResult = this.executeDiceRoll(parsed.parameters.expression);
          conversation.push(`AI: ${JSON.stringify(parsed)}`);
          conversation.push(`Tool result: ${JSON.stringify(rollResult)}`);
          toolLogs.push(`${parsed.parameters.expression} -> ${rollResult.breakdown}`);
        } else {
          return this.buildErrorResult("Invalid tool call format");
        }
      } else if (parsed.type === "result") {
        // Final result
        return this.buildFinalResult(gameState, parsed, toolLogs);
      } else {
        return this.buildErrorResult("Invalid response type");
      }
    }
    
    return this.buildErrorResult("Maximum iterations reached");
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
    
    if (!actionAnalysis || !actionAnalysis.actionType || actionAnalysis.actionType === "narrative") {
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

    const template = actionTypeTemplates[actionAnalysis.actionType as keyof typeof actionTypeTemplates];
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
        conditions: gameState.currentScenario.conditions
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
    
    context += "\n\nPlayer Character:\n" + JSON.stringify(gameState.playerCharacter, null, 2);
    
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

      // Record significant environmental changes as permanent
      if (parsed.scenarioUpdate.description) {
        stateManager.addPermanentScenarioChange(`${parsed.stateUpdate?.playerCharacter?.name || 'Character'} permanently altered the environment: ${parsed.summary || 'Unknown change'}`);
      }
    }
    
    // Create structured action result
    const actionResult: ActionResult = {
      timestamp: new Date(),
      gameTime: gameState.timeOfDay || "Unknown time",
      location: gameState.currentScenario?.location || "Unknown location", 
      character: parsed.stateUpdate?.playerCharacter?.name || gameState.playerCharacter.name,
      result: parsed.summary || "performed an action",
      diceRolls: toolLogs.map(log => log), // toolLogs already contain "expression -> result" format
      timeConsumption: parsed.timeConsumption || "instant", // Default to instant if not specified
      scenarioChanges: scenarioChanges.length > 0 ? scenarioChanges : undefined
    };
    
    // Add to action results
    stateManager.addActionResult(actionResult);
    
    // Return the updated game state
    return stateManager.getGameState() as GameState;
  }


  private buildErrorResult(errorMessage: string): any {
    return {
      error: errorMessage,
      agentId: "action",
      content: `Action processing error: ${errorMessage}`,
      timestamp: new Date(),
    };
  }
}