import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { CharacterAgent } from "./coc_multiagents_system/agents/character/index.js";
import {
  buildKeeperPrompt,
  buildKeeperPromptNoAgents,
  extractAgentResults,
} from "./coc_multiagents_system/agents/keeper/index.js";
import { MemoryAgent } from "./coc_multiagents_system/agents/memory/index.js";
import type { CoCDatabase } from "./coc_multiagents_system/agents/memory/database/index.js";
import { type AgentId, type CoCState, initialGameState } from "./state.js";
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

// Simple action/planning node placeholder (optional use)
export const createActionNode = (database: CoCDatabase) =>
  buildAgentNode(
    "action",
    `You are the Action agent. Convert player intent into clear next steps or rolls.
Suggest concrete mechanical actions (e.g., skill checks, positioning) without narrative.`,
    database
  );

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
      const agentResultsFormatted = agentResults.map(result => ({
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

export const createMemoryNode = (db: CoCDatabase) => {
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

    // Build context summary
    let contextSummary = "Recent context:\n";
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
