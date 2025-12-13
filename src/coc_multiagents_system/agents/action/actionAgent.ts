import {
  type CoCState,
  type GameState,
  initialGameState,
} from "../../../state.js";
import {
  latestHumanMessage,
} from "../../../utils.js";
import type { CharacterProfile } from "../models/gameTypes.js";
import { actionTools, executeActionTool } from "./tools.js";
import {
  ModelClass,
  ModelProviderName,
  generateText,
  CoCModelSelectors,
  createChatModel,
} from "../../../models/index.js";
import {
  CoCTemplateFactory,
  TemplateUtils,
} from "../../../templates/index.js";
import type { CoCDatabase } from "../memory/database/index.js";

// Runtime interface
interface CoCRuntime {
  modelProvider: ModelProviderName;
  database: CoCDatabase;
  getSetting: (key: string) => string | undefined;
}

const createRuntime = (database: CoCDatabase): CoCRuntime => ({
  modelProvider: (process.env.MODEL_PROVIDER as ModelProviderName) || ModelProviderName.OPENAI,
  database,
  getSetting: (key: string) => process.env[key],
});

type ActionAgentOutput = {
  summary: string;
  stateUpdate?: Partial<GameState>;
  log?: string[];
};

const formatCharacterDelta = (
  before?: GameState["playerCharacter"],
  after?: GameState["playerCharacter"]
): string | null => {
  if (!before || !after) return null;
  const prev = before.status;
  const next = after.status;

  const lines: string[] = [];
  const formatLine = (label: string, fromVal?: number, toVal?: number) => {
    if (fromVal === undefined || toVal === undefined) return;
    if (fromVal === toVal) return;
    const delta = toVal - fromVal;
    const sign = delta > 0 ? "+" : "";
    lines.push(`${label}: ${fromVal} -> ${toVal} (${sign}${delta})`);
  };

  formatLine("HP", prev.hp, next.hp);
  formatLine("Sanity", prev.sanity, next.sanity);
  formatLine("Luck", prev.luck, next.luck);
  if (prev.mp !== undefined || next.mp !== undefined) {
    formatLine("MP", prev.mp, next.mp);
  }

  if (prev.conditions?.join(",") !== after.status.conditions?.join(",")) {
    const prevConds = prev.conditions?.length
      ? prev.conditions.join(", ")
      : "none";
    const nextConds = next.conditions?.length
      ? next.conditions.join(", ")
      : "none";
    lines.push(`Conditions: ${prevConds} -> ${nextConds}`);
  }

  return lines.length ? lines.map((l) => `- ${l}`).join("\n") : null;
};

const parseActionOutput = (raw: string): ActionAgentOutput => {
  try {
    const parsed = JSON.parse(raw) as ActionAgentOutput & {
      checks?: SkillCheckRequest[];
    };
    return {
      summary: parsed.summary ?? raw,
      stateUpdate: parsed.stateUpdate,
      log: parsed.log,
      // @ts-expect-error preserve checks for downstream use
      checks: parsed.checks,
    };
  } catch {
    return { summary: raw };
  }
};

const buildMemoryContext = (agentResults: any[]): string => {
  const memoryFindings = (agentResults || []).filter(
    (r) => r.agentId === "memory"
  );
  if (memoryFindings.length === 0) return "No memory/rule context provided.";

  return memoryFindings
    .map((entry, idx) => {
      const details =
        typeof entry.content === "string"
          ? entry.content
          : JSON.stringify(entry.content);
      return `Memory note ${idx + 1}: ${details}`;
    })
    .join("\n");
};

const mergeCharacter = (
  current: CharacterProfile,
  updates?: Partial<CharacterProfile>
): CharacterProfile => {
  if (!updates) return current;
  const mergedStatus = updates.status
    ? { ...current.status, ...updates.status }
    : current.status;
  const mergedSkills = updates.skills
    ? { ...current.skills, ...updates.skills }
    : current.skills;
  return {
    ...current,
    ...updates,
    status: mergedStatus,
    skills: mergedSkills,
  };
};

/**
 * Action Agent class - handles action resolution and skill checks
 */
export class ActionAgent {
  private db: CoCDatabase;

  constructor(db: CoCDatabase) {
    this.db = db;
  }

  async processAction(state: CoCState): Promise<Partial<CoCState>> {
    const runtime = createRuntime(this.db);
    const gameState = state.gameState ?? initialGameState;
    const userMessage = latestHumanMessage(state.messages);
    const memoryContext = buildMemoryContext(state.agentResults || []);

    // Build system prompt for JSON-based tool calling
    const systemPrompt = `You are an action resolution specialist for Call of Cthulhu.

Your job is to analyze player actions and resolve them step by step. You MUST respond with JSON in one of these formats:

FOR TOOL CALLS (when you need dice rolls):
{
  "type": "tool_call",
  "tool": "roll_dice",
  "parameters": {
    "expression": "1d100"
  },
  "reason": "Need to roll for Spot Hidden skill check"
}

FOR FINAL RESULTS (when you have everything needed):
{
  "type": "result",
  "summary": "The character attempts to climb the wall but fails, taking 2 damage",
  "stateUpdate": {
    "playerCharacter": {
      "status": { "hp": 8 }
    }
  },
  "log": ["Climb skill 45% vs roll 73 = failure", "Fall damage 1d3 = 2", "HP: 10 -> 8"]
}

Context:
- Player input: ${userMessage || "No recent input"}
- Game state: ${TemplateUtils.formatGameStateForTemplate(gameState)}
- Memory context: ${memoryContext}

Available dice expressions: "1d100", "3d6", "1d4+1", "2d6-1", etc.`;

    // Tool call loop
    const toolLogs: string[] = [];
    let conversation = [`Player action: ${userMessage}`];
    let maxIterations = 10;
    
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const contextWithHistory = systemPrompt + "\n\nConversation so far:\n" + conversation.join("\n");
      
      const response = await generateText({
        runtime,
        context: contextWithHistory,
        modelClass: CoCModelSelectors.actionResolution(),
        customSystemPrompt: "Return only valid JSON in the specified format.",
      });

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

  private buildFinalResult(gameState: GameState, parsed: any, toolLogs: string[]): Partial<CoCState> {
    const stateUpdate = parsed.stateUpdate ?? {};
    const mergedPlayerCharacter = mergeCharacter(
      gameState.playerCharacter,
      stateUpdate.playerCharacter
    );

    const updatedGameState: GameState = {
      ...gameState,
      ...stateUpdate,
      playerCharacter: mergedPlayerCharacter,
    };

    const characterDelta = formatCharacterDelta(
      gameState.playerCharacter,
      updatedGameState.playerCharacter
    );

    const formattedSummary = characterDelta
      ? `${parsed.summary}\n\n# Character Update\n${characterDelta}`
      : parsed.summary;

    const logSection = (parsed.log || []).concat(toolLogs).length > 0
      ? `\n\n# Action Log\n${(parsed.log || []).concat(toolLogs).join('\n')}`
      : '';

    const finalContent = formattedSummary + logSection;

    return {
      gameState: updatedGameState,
      agentResults: [
        {
          agentId: "action",
          content: finalContent,
          timestamp: new Date(),
          metadata: {
            stateUpdate: parsed.stateUpdate,
            log: (parsed.log || []).concat(toolLogs),
            characterDelta,
            toolCalls: toolLogs.length,
          },
        },
      ],
    };
  }

  private buildErrorResult(errorMessage: string): Partial<CoCState> {
    return {
      agentResults: [
        {
          agentId: "action",
          content: `Action processing error: ${errorMessage}`,
          timestamp: new Date(),
          metadata: { error: errorMessage },
        },
      ],
    };
  }
}

// Factory function to create action node that uses the ActionAgent
export const createActionNode = (database: CoCDatabase) => {
  const actionAgent = new ActionAgent(database);
  
  return async (state: CoCState): Promise<Partial<CoCState>> => {
    return actionAgent.processAction(state);
  };
};
