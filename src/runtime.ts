import { AIMessage, SystemMessage, HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { CharacterAgent } from "./coc_multiagents_system/agents/character/index.js";
import {
  buildKeeperPrompt,
  buildKeeperPromptNoAgents,
  extractAgentResults,
} from "./coc_multiagents_system/agents/keeper/index.js";
import { MemoryAgent } from "./coc_multiagents_system/agents/memory/index.js";
import type { CoCDatabase } from "./coc_multiagents_system/agents/memory/database/index.js";
import {
  type AgentId,
  type CoCState,
  type Phase,
  initialGameState,
} from "./state.js";
import { composeTemplate } from "./template.js";
import {
  contentToString,
  formatGameState,
  latestHumanMessage,
} from "./utils.js";
import {
  ModelClass,
  ModelProviderName,
  generateText,
  CoCModelSelectors,
  createChatModel,
} from "./models/index.js";
import {
  CoCTemplateFactory,
  TemplateUtils,
} from "./templates/index.js";
import type { RAGEngine } from "./rag/engine.js";

// Create a runtime interface that includes model configuration
interface CoCRuntime {
  modelProvider: ModelProviderName;
  database: CoCDatabase;
  getSetting: (key: string) => string | undefined;
}

// Default runtime configuration
const createRuntime = (database: CoCDatabase): CoCRuntime => ({
  modelProvider: (process.env.MODEL_PROVIDER as ModelProviderName) || ModelProviderName.OPENAI,
  database,
  getSetting: (key: string) => process.env[key],
});

// Fallback model for compatibility
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const fallbackModel = new ChatOpenAI({
  model: DEFAULT_MODEL,
  temperature: 0.6,
});

// Rule agent merged into Memory agent - see createMemoryNode

const buildAgentNode =
  (
    name: AgentId,
    systemInstruction: string,
    database: CoCDatabase
  ) =>
  async (state: CoCState): Promise<Partial<CoCState>> => {
    const runtime = createRuntime(database);
    const gameState = state.gameState ?? initialGameState;
    
    const context = composeTemplate(
      `${systemInstruction}

Stay concise. If a dice roll is needed, propose the roll and expected target clearly.

Context:
- Latest player input: {{latestUserMessage}}
- Game state snapshot: {{gameStateSummary}}
- Routing notes: {{routingNotes}}`,
      state,
      {
        latestUserMessage:
          latestHumanMessage(state.messages) || "No recent player input.",
        gameStateSummary: TemplateUtils.formatGameStateForTemplate(gameState),
        routingNotes: state.routingNotes ?? "None",
      }
    );

    const response = await generateText({
      runtime,
      context,
      modelClass: CoCModelSelectors.quickResponse(), // SMALL model for simple agent responses
      customSystemPrompt: `You are the ${name} agent in a Call of Cthulhu multi-agent system. Provide focused, factual analysis.`,
    });

    const labeledResponse = new AIMessage({
      content: response,
      name,
    });

    return { messages: [labeledResponse] };
  };

// Import ActionAgent
import { createActionNode as createActionNodeFromAgent } from "./coc_multiagents_system/agents/action/actionAgent.js";

// Action node using proper ActionAgent
export const createActionNode = createActionNodeFromAgent;

export const createKeeperNode =
  (database: CoCDatabase) =>
  async (state: CoCState): Promise<Partial<CoCState>> => {
    const runtime = createRuntime(database);
    const gameState = state.gameState ?? initialGameState;
    const userMessage = latestHumanMessage(state.messages);
    const agentResults = state.agentResults || [];

    // Use unified template system for keeper responses
    let promptContent: string;

    if (agentResults.length === 0) {
      // No agents were consulted - use simple template
      promptContent = CoCTemplateFactory.getKeeperSimple(state, userMessage || "", {
        gameStateSummary: TemplateUtils.formatGameStateForTemplate(gameState),
      });
    } else {
      // Build comprehensive prompt with agent results
      const agentResultsFormatted = agentResults.map((result: any) => ({
        agentId: result.agentId as string,
        content: result.content as string,
      }));

      promptContent = CoCTemplateFactory.getKeeperWithAgents(
        state,
        agentResultsFormatted,
        {
          userInput: userMessage || "",
          gameStateSummary: TemplateUtils.formatGameStateForTemplate(gameState),
        }
      );
    }

    // Use LARGE model for complex keeper analysis and narrative generation
    const response = await generateText({
      runtime,
      context: promptContent,
      modelClass: CoCModelSelectors.narrativeGeneration(), // LARGE model
      customSystemPrompt: "You are the Keeper in a Call of Cthulhu game. Provide immersive, atmospheric responses that drive the narrative forward while maintaining game balance and mystery.",
    });

    // Keeper's output is the final message to the user
    return {
      messages: [
        new AIMessage({
          content: response,
          name: "keeper",
        }),
      ],
      // Clear agent results for next round
      agentResults: [],
    };
  };

export const createCharacterNode = (db: CoCDatabase) => {
  const characterAgent = new CharacterAgent(db);

  return async (state: CoCState): Promise<Partial<CoCState>> => {
    const runtime = createRuntime(db);
    const gameState = state.gameState ?? initialGameState;
    const userMessage = latestHumanMessage(state.messages);
    const activeCharacter = characterAgent.getOrCreate(
      gameState.playerCharacter.id,
      gameState.playerCharacter
    );

    // Persist any in-memory updates from the graph state
    const storedCharacter = characterAgent.upsertCharacter(activeCharacter);
    const characterSummary = characterAgent.summarizeProfile(storedCharacter);

    // Use unified template system for character agent
    const context = CoCTemplateFactory.getCharacterAgent(state, characterSummary, {
      latestUserMessage: userMessage || "No recent player input.",
      gameStateSummary: TemplateUtils.formatGameStateForTemplate(gameState),
      routingNotes: state.routingNotes ?? "None",
    });

    // Use MEDIUM model for character interactions
    const response = await generateText({
      runtime,
      context,
      modelClass: CoCModelSelectors.characterInteraction(), // MEDIUM model
      customSystemPrompt: "You are a character management specialist for Call of Cthulhu. Provide precise, mechanical information about character capabilities and resources.",
    });

    return {
      agentResults: [
        {
          agentId: "character",
          content: response,
          timestamp: new Date(),
          metadata: {
            gameState,
            character: storedCharacter,
          },
        },
      ],
      gameState: {
        ...gameState,
        playerCharacter: storedCharacter,
      },
    };
  };
};

// Web API interface for processing user queries through the multi-agent graph
export const processUserQuery = async (
  query: string,
  database: CoCDatabase,
  currentGameState?: CoCState['gameState'],
  ragEngine?: RAGEngine
): Promise<{
  response: string;
  updatedGameState: CoCState['gameState'];
  agentTrace: Array<{ agentId: string; content: string; timestamp: Date }>;
}> => {
  // Import buildGraph here to avoid circular dependency
  const { buildGraph } = await import("./graph.js");
  
  const graph = buildGraph(database, ragEngine);
  const gameState = currentGameState || initialGameState;
  
  // Process the query through the multi-agent graph
  const result = await graph.invoke({
    messages: [new HumanMessage(query)],
    agentQueue: [],
    gameState,
  });
  
  // Extract the keeper's response (final response to user)
  const keeperMessage = result.messages?.find(
    (msg: any) => msg.name === 'keeper'
  );
  
  const response = keeperMessage?.content || "No response generated";
  
  // Extract agent trace for debugging/transparency
  const agentTrace = (result.agentResults || []).map((r: any) => ({
    agentId: r.agentId,
    content: r.content,
    timestamp: r.timestamp || new Date(),
  }));
  
  return {
    response,
    updatedGameState: result.gameState || gameState,
    agentTrace,
  };
};

export const createMemoryNode = (db: CoCDatabase, rag?: RAGEngine) => {
  const memoryAgent = new MemoryAgent(db);

  return async (state: CoCState): Promise<Partial<CoCState>> => {
    const runtime = createRuntime(db);
    const gameState = state.gameState ?? initialGameState;
    const sessionId = gameState.sessionId;
    const userMessage = latestHumanMessage(state.messages);

    // Ensure session exists
    memoryAgent.createSession(sessionId);

    // Log the current interaction as an event
    if (userMessage) {
      memoryAgent.logEvent({
        eventType: "action",
        sessionId,
        timestamp: new Date(),
        details: { userInput: userMessage },
        tags: ["user-action"],
      });
    }

    // Get recent context
    const recentEvents = memoryAgent.getRecentEvents(sessionId, 10);
    const discoveries = memoryAgent.getDiscoveries(sessionId);
    const latestModule = memoryAgent.getLatestModuleBackground();

    // Build context summary
    let contextSummary = "Recent context:\n";
    const summarize = (value?: string) => {
      if (!value) return "N/A";
      return value.length > 320 ? `${value.slice(0, 320)}...` : value;
    };

    if (recentEvents.length > 0) {
      contextSummary += recentEvents
        .slice(0, 5)
        .map((e) => `- [${e.eventType}] ${JSON.stringify(e.details)}`)
        .join("\n");
    } else {
      contextSummary += "- No previous events in this session";
    }

    if (discoveries.length > 0) {
      contextSummary += "\n\nDiscovered clues:\n";
      contextSummary += discoveries
        .map(
          (d) => `- ${d.clueId} (discovered by ${d.discoverer} via ${d.method})`
        )
        .join("\n");
    }

    // Use unified template system for memory agent
    const context = CoCTemplateFactory.getMemoryAgent(
      state,
      contextSummary,
      JSON.stringify(memoryAgent.getStats()),
      {
        latestUserMessage: userMessage || "No recent player input.",
        gameStateSummary: TemplateUtils.formatGameStateForTemplate(gameState),
        routingNotes: state.routingNotes ?? "None",
      }
    );

    // Use MEDIUM model for memory queries
    const response = await generateText({
      runtime,
      context,
      modelClass: CoCModelSelectors.memoryQuery(), // MEDIUM model
      customSystemPrompt: "You are a comprehensive memory and rules database for Call of Cthulhu. Provide accurate historical context and rule information.",
    });

    // Return as agentResult instead of message
    return {
      agentResults: [
        {
          agentId: "memory",
          content: response,
          timestamp: new Date(),
          metadata: {
            recentEventsCount: recentEvents.length,
            discoveriesCount: discoveries.length,
            stats: memoryAgent.getStats(),
          },
        },
      ],
    };
  };
};
