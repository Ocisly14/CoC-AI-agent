import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { CharacterAgent } from "./coc_multiagents_system/agents/character/index.js";
import {
  buildKeeperPrompt,
  buildKeeperPromptNoAgents,
  extractAgentResults,
} from "./coc_multiagents_system/agents/keeper/index.js";
import { MemoryAgent } from "./coc_multiagents_system/agents/memory/index.js";
import type { CoCDatabase } from "./coc_multiagents_system/shared/database/index.js";
import { type AgentId, type CoCState, initialGameState } from "./state.js";
import { composeTemplate } from "./template.js";
import {
  contentToString,
  formatGameState,
  latestHumanMessage,
} from "./utils.js";

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
    model: ChatOpenAI = fallbackModel
  ) =>
  async (state: CoCState): Promise<Partial<CoCState>> => {
    const gameState = state.gameState ?? initialGameState;
    const systemPrompt = new SystemMessage(
      composeTemplate(
        [
          systemInstruction,
          "Stay concise. If a dice roll is needed, propose the roll and expected target clearly.",
          "Context:",
          "- Latest player input: {{latestUserMessage}}",
          "- Game state snapshot: {{gameStateSummary}}",
          "- Routing notes: {{routingNotes}}",
        ].join("\n"),
        state,
        {
          latestUserMessage:
            latestHumanMessage(state.messages) || "No recent player input.",
          gameStateSummary: formatGameState(gameState),
          routingNotes: state.routingNotes ?? "None",
        }
      )
    );

    const response = await model.invoke([systemPrompt, ...state.messages]);
    const labeledResponse = new AIMessage({
      content: contentToString(response.content),
      name,
    });

    return { messages: [labeledResponse] };
  };

// Simple action/planning node placeholder (optional use)
export const createActionNode = (model: ChatOpenAI = fallbackModel) =>
  buildAgentNode(
    "action",
    [
      "You are the Action agent. Convert player intent into clear next steps or rolls.",
      "Suggest concrete mechanical actions (e.g., skill checks, positioning) without narrative.",
    ].join("\n"),
    model
  );

export const createKeeperNode =
  (model: ChatOpenAI = fallbackModel) =>
  async (state: CoCState): Promise<Partial<CoCState>> => {
    const gameState = state.gameState ?? initialGameState;
    const userMessage = latestHumanMessage(state.messages);
    const agentResults = state.agentResults || [];

    // Use structured template
    let promptContent: string;

    if (agentResults.length === 0) {
      // No agents were consulted - use simple template
      promptContent = buildKeeperPromptNoAgents(userMessage, gameState);
    } else {
      // Extract and organize agent results
      const extractedResults = extractAgentResults(agentResults);

      // Build comprehensive prompt using template
      promptContent = buildKeeperPrompt({
        userInput: userMessage,
        gameState: {
          phase: gameState.phase,
          location: gameState.location,
          timeOfDay: gameState.timeOfDay,
          tension: gameState.tension,
          openThreads: gameState.openThreads,
          discoveredClues: gameState.discoveredClues,
        },
        agentResults: extractedResults,
      });
    }

    const systemPrompt = new SystemMessage(promptContent);

    const response = await model.invoke([systemPrompt, ...state.messages]);

    // Keeper's output is the final message to the user
    return {
      messages: [
        new AIMessage({
          content: contentToString(response.content),
          name: "keeper",
        }),
      ],
      // Clear agent results for next round
      agentResults: [],
    };
  };

export const createCharacterNode = (
  db: CoCDatabase,
  model: ChatOpenAI = fallbackModel
) => {
  const characterAgent = new CharacterAgent(db);

  return async (state: CoCState): Promise<Partial<CoCState>> => {
    const gameState = state.gameState ?? initialGameState;
    const userMessage = latestHumanMessage(state.messages);
    const activeCharacter = characterAgent.getOrCreate(
      gameState.playerCharacter.id,
      gameState.playerCharacter
    );

    // Persist any in-memory updates from the graph state
    const storedCharacter = characterAgent.upsertCharacter(activeCharacter);
    const characterSummary = characterAgent.summarizeProfile(storedCharacter);

    const systemPrompt = new SystemMessage(
      composeTemplate(
        [
          "You are the Character agent. Track investigator capabilities and resources.",
          "You can persist attribute and status changes; reflect concrete HP/Sanity/Luck impacts.",
          "Provide factual information about skills, gear, and positioning without narrative.",
          "Flag risks to HP/Sanity/Luck and suggest available resources.",
          "Context:",
          "- Latest player input: {{latestUserMessage}}",
          "- Game state snapshot: {{gameStateSummary}}",
          "- Active character sheet:\\n{{characterSummary}}",
          "- Routing notes: {{routingNotes}}",
        ].join("\n"),
        state,
        {
          latestUserMessage: userMessage || "No recent player input.",
          gameStateSummary: formatGameState(gameState),
          routingNotes: state.routingNotes ?? "None",
          characterSummary,
        }
      )
    );

    const response = await model.invoke([systemPrompt, ...state.messages]);

    return {
      agentResults: [
        {
          agentId: "character",
          content: contentToString(response.content),
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

export const createMemoryNode = (
  db: CoCDatabase,
  model: ChatOpenAI = fallbackModel
) => {
  const memoryAgent = new MemoryAgent(db);

  return async (state: CoCState): Promise<Partial<CoCState>> => {
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

    const systemPrompt = new SystemMessage(
      composeTemplate(
        [
          "You are the unified Memory agent with access to:",
          "1. Complete game history database (events, discoveries, relationships)",
          "2. Call of Cthulhu 7e rules database (skills, weapons, sanity triggers, game mechanics)",
          "",
          "Your responsibilities:",
          "- Provide historical context from past events and discoveries",
          "- Look up relevant CoC 7e rules, skills, and weapons when needed",
          "- Identify which skill checks are required for player actions",
          "- Suggest appropriate difficulty levels and mechanics",
          "- Maintain continuity and surface relevant past information",
          "",
          "Provide factual information without narrative flourish.",
          "Your output will be given to the Keeper who will weave it into the story.",
          "",
          "Database stats: {{dbStats}}",
          "{{contextSummary}}",
          "Context:",
          "- Latest player input: {{latestUserMessage}}",
          "- Game state snapshot: {{gameStateSummary}}",
          "- Routing notes: {{routingNotes}}",
        ].join("\n"),
        state,
        {
          latestUserMessage: userMessage || "No recent player input.",
          gameStateSummary: formatGameState(gameState),
          routingNotes: state.routingNotes ?? "None",
          dbStats: JSON.stringify(memoryAgent.getStats()),
          contextSummary,
        }
      )
    );

    const response = await model.invoke([systemPrompt, ...state.messages]);

    // Return as agentResult instead of message
    return {
      agentResults: [
        {
          agentId: "memory",
          content: contentToString(response.content),
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
