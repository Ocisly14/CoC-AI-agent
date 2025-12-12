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
import {
  ModelClass,
  ModelProviderName,
  generateText,
  CoCModelSelectors,
} from "../../../models/index.js";
import { CoCTemplateFactory, TemplateUtils } from "../../../templates/index.js";
import type { CoCDatabase } from "../../memory/database/index.js";

type RoutingDecision = {
  agents: AgentId[];
  intent?: string;
  rationale?: string;
  isAction?: boolean;
};

// Create a runtime interface for the orchestrator
const createOrchestratorRuntime = (database: CoCDatabase) => ({
  modelProvider: (process.env.MODEL_PROVIDER as ModelProviderName) || ModelProviderName.OPENAI,
  database,
  getSetting: (key: string) => process.env[key],
});

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
  (database: CoCDatabase) =>
  async (state: CoCState): Promise<Partial<CoCState>> => {
    const runtime = createOrchestratorRuntime(database);
    const userInput = latestHumanMessage(state.messages);
    const gameState = state.gameState ?? initialGameState;

    // Use unified template system for orchestrator
    const context = CoCTemplateFactory.getOrchestrator(
      state,
      userInput || "",
      {
        gameStateSummary: TemplateUtils.formatGameStateForTemplate(gameState),
      }
    );

    // Use new model system for orchestrator decisions
    const response = await generateText({
      runtime,
      context,
      modelClass: CoCModelSelectors.orchestration(), // SMALL model for quick routing decisions
      customSystemPrompt: "You are an efficient orchestrator for a Call of Cthulhu multi-agent system. Make quick, accurate routing decisions.",
    });

    const decision = parseRoutingDecision(response);
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
