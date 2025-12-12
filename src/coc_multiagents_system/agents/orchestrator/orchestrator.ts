/**
 * Orchestrator Node for LangGraph
 * Analyzes player input and routes to appropriate agents
 */

import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import {
  type AgentId,
  type CoCState,
  initialGameState,
} from "../../../state.js";
import { composeTemplate } from "../../../template.js";
import {
  contentToString,
  formatGameState,
  isAgentId,
  latestHumanMessage,
} from "../../../utils.js";

type RoutingDecision = {
  agents: AgentId[];
  intent?: string;
  rationale?: string;
  isAction?: boolean;
};

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const routerModel = new ChatOpenAI({
  model: DEFAULT_MODEL,
  temperature: 0.2,
});

/**
 * Parse LLM response into routing decision
 */
const parseRoutingDecision = (raw: string): RoutingDecision => {
  try {
    const parsed = JSON.parse(raw) as RoutingDecision;
    const uniqueAgents = Array.from(new Set(parsed.agents || [])).filter(
      isAgentId
    );
    return {
      agents: uniqueAgents.length ? uniqueAgents : [],
      intent: parsed.intent,
      rationale: parsed.rationale,
      isAction: parsed.isAction,
    };
  } catch (error) {
    const match = raw.match(/\[(.*?)\]/s);
    if (match) {
      try {
        const parsedArray = JSON.parse(`[${match[1]}]`) as string[];
        const uniqueAgents = Array.from(new Set(parsedArray)).filter(isAgentId);
        return {
          agents: uniqueAgents.length ? uniqueAgents : [],
          intent: undefined,
          rationale: "Parsed from array fallback",
          isAction: undefined,
        };
      } catch {
        // fall through
      }
    }

    return {
      agents: [],
      intent: undefined,
      rationale: "Failed to parse routing decision",
      isAction: undefined,
    };
  }
};

/**
 * Execute agents from queue
 */
export const createExecuteAgentsNode =
  () =>
  (state: CoCState): Partial<CoCState> => {
    const queue = state.agentQueue || [];
    if (queue.length === 0) {
      return {
        nextAgent: "keeper",
        allAgentsCompleted: true,
      };
    }

    const [next, ...rest] = queue;
    return {
      nextAgent: next,
      agentQueue: rest,
    };
  };

/**
 * Check if all agents completed
 */
export const createCheckCompletionNode =
  () =>
  (state: CoCState): Partial<CoCState> => {
    const queue = state.agentQueue || [];
    return {
      allAgentsCompleted: queue.length === 0,
    };
  };

/**
 * Route to the next agent
 */
export const routeToAgent = (state: CoCState): string => {
  return state.nextAgent || "check";
};

/**
 * Decide whether to continue or go to keeper
 */
export const shouldContinue = (state: CoCState): string => {
  return state.allAgentsCompleted ? "keeper" : "continue";
};

/**
 * Create the Orchestrator node
 * Analyzes player input and determines which agents to consult
 */
export const createOrchestratorNode =
  (model: ChatOpenAI = routerModel) =>
  async (state: CoCState): Promise<Partial<CoCState>> => {
    const userInput = latestHumanMessage(state.messages);
    const gameState = state.gameState ?? initialGameState;

    const orchestratorSystemPrompt = composeTemplate(
      [
        "You are the Orchestrator for a Call of Cthulhu multi-agent system.",
        "Analyze the player input and decide which DATA AGENTS should be consulted.",
        "Available agents:",
        '- "memory": game history, rules reference, skills, weapons, sanity triggers',
        '- "character": player character capabilities, inventory, character state',
        '- "action": resolves player actions using memory/rule context; updates mechanics',
        "",
        "IMPORTANT:",
        "- Memory agent has access to ALL game rules, skills, and weapons data",
        "- Use memory agent for: rules lookups, skill checks, history, context, discoveries",
        "- Use character agent for: character-specific capabilities and resources",
        "- Use action agent when the player is attempting an in-world action. Always route memory BEFORE action so it has rule context.",
        "- DO NOT include 'keeper' - the Keeper will automatically synthesize results",
        "",
        'Return a strict JSON object: {"agents": ["memory", "character", "action"], "intent": "...", "rationale": "...", "isAction": true|false}',
        "Do not include commentary before or after the JSON.",
        "Game snapshot:",
        "- {{gameStateSummary}}",
        "- Routing notes: {{routingNotes}}",
      ].join("\n"),
      state,
      {
        routingNotes: state.routingNotes ?? "None",
        gameStateSummary: formatGameState(gameState),
      }
    );

    const orchestratorHumanPrompt = composeTemplate(
      [
        'Player input: "{{latestPlayerInput}}"',
        "Pick only the agents that add value; prefer concise teams.",
      ].join("\n"),
      state,
      {
        latestPlayerInput: userInput || "No recent player input.",
      }
    );

    const response = await model.invoke([
      new SystemMessage(orchestratorSystemPrompt),
      new HumanMessage(orchestratorHumanPrompt),
    ]);

    const decision = parseRoutingDecision(contentToString(response.content));
    const normalizedQueue: AgentId[] = (() => {
      if (decision.isAction) {
        const ordered: AgentId[] = [
          "memory",
          "action",
          ...(decision.agents || []),
        ];
        return ordered.filter(
          (agent, idx) => isAgentId(agent) && ordered.indexOf(agent) === idx
        );
      }
      const ordered = decision.agents || [];
      return ordered.filter(
        (agent, idx) => isAgentId(agent) && ordered.indexOf(agent) === idx
      );
    })();

    const orchestratorSummary = new AIMessage({
      content: [
        `Routing -> ${normalizedQueue.join(", ")}`,
        decision.intent ? `Intent: ${decision.intent}` : undefined,
        decision.rationale ? `Why: ${decision.rationale}` : undefined,
        decision.isAction ? "Action detected: true" : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
      name: "orchestrator",
      additional_kwargs: {
        agentQueue: normalizedQueue,
        intent: decision.intent,
        rationale: decision.rationale,
        isAction: decision.isAction,
      },
    });

    return {
      agentQueue: normalizedQueue,
      routingNotes: decision.rationale,
      gameState,
      messages: [orchestratorSummary],
    };
  };
