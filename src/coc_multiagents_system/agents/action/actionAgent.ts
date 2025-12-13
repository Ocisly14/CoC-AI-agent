import { ModelClass } from "../../../models/types.js";
import { actionTools } from "./tools.js";
import { GameStateManager, GameState } from "../../../state.js";


/**
 * Action Agent class - handles action resolution and skill checks
 */
export class ActionAgent {

    const systemPrompt = `You are an action resolution specialist for Call of Cthulhu.

Your job is to analyze player actions and resolve them step by step.

FOR FINAL RESULTS (when you have everything needed):
{
  "type": "result",
  "summary": "The character attempts to climb the wall but fails, taking 2 damage",
  "stateUpdate": {
    "playerCharacter": {
      "name": "Detective Smith",
      "status": { "hp": -2 }
    }
  },
  "log": ["Climb skill 45% vs roll 73 = failure", "Fall damage 1d3 = 2", "HP: -2"]
}`;

    // Tool call loop
    const toolLogs: string[] = [];
    let conversation = [`Player action: ${userMessage}`];
    let maxIterations = 10;
    
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const contextWithHistory = systemPrompt + "\n\nConversation so far:\n" + conversation.join("\n");
      
      const response = await generateText({
        runtime,
        context: contextWithHistory,
        modelClass: ModelClass.SMALL,
        tools: actionTools,
      });

      // Check if response contains tool calls
      if (response.tool_calls && response.tool_calls.length > 0) {
        // Handle tool calls
        for (const toolCall of response.tool_calls) {
          if (toolCall.function.name === "roll_dice") {
            const args = JSON.parse(toolCall.function.arguments);
            const rollResult = this.executeDiceRoll(args.expression);
            conversation.push(`AI: Called roll_dice with ${args.expression}`);
            conversation.push(`Tool result: ${rollResult.breakdown}`);
            toolLogs.push(`${args.expression} -> ${rollResult.breakdown}`);
          }
        }
      } else {
        // Try to parse as JSON for final result
        let parsed;
        try {
          parsed = JSON.parse(response);
        } catch (error) {
          return this.buildErrorResult("Invalid JSON response from model");
        }

        if (parsed.type === "result") {
          // Final result
          return this.buildFinalResult(gameState, parsed, toolLogs);
        } else {
          return this.buildErrorResult("Invalid response type");
        }
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

  private buildFinalResult(gameState: GameState, parsed: any, toolLogs: string[]): GameState {
    const stateManager = new GameStateManager(gameState);
    
    // Apply the state update from LLM result
    if (parsed.stateUpdate) {
      stateManager.applyActionUpdate(parsed.stateUpdate);
    }
    
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