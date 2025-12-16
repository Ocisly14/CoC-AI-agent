import { END, START, StateGraph } from "@langchain/langgraph";
import type { CoCDatabase } from "./coc_multiagents_system/agents/memory/database/index.js";
import type { RAGEngine } from "./rag/engine.js";
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import { OrchestratorAgent } from "./coc_multiagents_system/agents/orchestrator/orchestratorAgent.js";
import { MemoryAgent } from "./coc_multiagents_system/agents/memory/util.js";
import { ActionAgent } from "./coc_multiagents_system/agents/action/actionAgent.js";
import { KeeperAgent } from "./coc_multiagents_system/agents/keeper/keeperAgent.js";
import { DirectorAgent } from "./coc_multiagents_system/agents/director/directorAgent.js";
import type { ScenarioLoader } from "./coc_multiagents_system/agents/memory/scenarioloader/index.js";
import {
  GameStateManager,
  initialGameState,
  type GameState,
  type ActionAnalysis,
} from "./state.js";
import { contentToString, latestHumanMessage } from "./utils.js";
import { enrichMemoryContext } from "./coc_multiagents_system/agents/memory/memoryAgent.js";
import { TurnManager } from "./coc_multiagents_system/agents/memory/index.js";

export interface GraphState {
  messages: BaseMessage[];
  gameState: GameState;
  turnId?: string;  // Optional: track the current turn being processed
}

export const buildGraph = (db: CoCDatabase, scenarioLoader: ScenarioLoader, rag?: RAGEngine) => {
  const orchestrator = new OrchestratorAgent();
  const actionAgent = new ActionAgent();
  const keeperAgent = new KeeperAgent();
  const directorAgent = new DirectorAgent(scenarioLoader, db);
  const turnManager = new TurnManager(db);

  const graph = new StateGraph<GraphState>({
    channels: {
      messages: { value: (x) => x as BaseMessage[] },
      gameState: { value: (x) => x as GameState },
      turnId: { value: (x) => x as string | undefined },
    },
  });

  // Orchestrator: analyze user input and write actionAnalysis into state
  graph.addNode("orchestrator", async (state: GraphState) => {
    const gsm = new GameStateManager(state.gameState ?? initialGameState);
    const userInput = latestHumanMessage(state.messages);
    const result = await orchestrator.processInput(userInput, gsm);
    
    // Update turn with action analysis if turnId exists
    if (state.turnId) {
      try {
        turnManager.updateProcessing(state.turnId, {
          actionAnalysis: gsm.getGameState().temporaryInfo.currentActionAnalysis
        });
      } catch (error) {
        console.error("Failed to update turn with action analysis:", error);
      }
    }
    
    return { ...state, gameState: gsm.getGameState() as GameState };
  });

  // Memory: enrich with rules + RAG slices, log agent content
  graph.addNode("memory", async (state: GraphState) => {
    const gameState = state.gameState ?? initialGameState;
    const actionAnalysis =
      gameState.temporaryInfo.currentActionAnalysis as ActionAnalysis | null;
    const enriched = await enrichMemoryContext(gameState, actionAnalysis, rag);

    return { ...state, gameState: enriched };
  });

  // Action: execute action agent using current game state
  graph.addNode("action", async (state: GraphState) => {
    const gameState = state.gameState ?? initialGameState;
    const runtime = {}; // ActionAgent expects runtime but only passes through generateText; keep empty placeholder
    const userInput = latestHumanMessage(state.messages);
    const updated = await actionAgent.processAction(runtime, gameState, userInput);
    
    // Update turn with action results if turnId exists
    if (state.turnId) {
      try {
        turnManager.updateProcessing(state.turnId, {
          actionResults: (updated as GameState).temporaryInfo.actionResults
        });
      } catch (error) {
        console.error("Failed to update turn with action results:", error);
      }
    }
    
    return { ...state, gameState: updated as GameState };
  });

  // Director: handle scene change requests from action agent
  graph.addNode("director", async (state: GraphState) => {
    const gsm = new GameStateManager(state.gameState ?? initialGameState);
    const sceneChangeRequest = gsm.getGameState().temporaryInfo.sceneChangeRequest;
    
    // If there's a scene change request, execute it
    if (sceneChangeRequest?.shouldChange && sceneChangeRequest.targetSceneName) {
      await directorAgent.handleActionDrivenSceneChange(
        gsm, 
        sceneChangeRequest.targetSceneName,
        sceneChangeRequest.reason
      );
    }
    
    // Clear the request
    gsm.clearSceneChangeRequest();
    
    // Update turn with director decision if turnId exists
    if (state.turnId) {
      try {
        turnManager.updateProcessing(state.turnId, {
          directorDecision: gsm.getGameState().temporaryInfo.directorDecision
        });
      } catch (error) {
        console.error("Failed to update turn with director decision:", error);
      }
    }
    
    return { ...state, gameState: gsm.getGameState() as GameState };
  });

  // Keeper: produce narrative and update clues
  graph.addNode("keeper", async (state: GraphState) => {
    const gsm = new GameStateManager(state.gameState ?? initialGameState);
    const userInput = latestHumanMessage(state.messages);
    const result = await keeperAgent.generateNarrative(userInput, gsm);
    
    // Complete turn with keeper narrative if turnId exists
    if (state.turnId) {
      try {
        turnManager.completeTurn(state.turnId, {
          keeperNarrative: result.narrative,
          clueRevelations: result.clueRevelations
        });
      } catch (error) {
        console.error("Failed to complete turn:", error);
        turnManager.markError(state.turnId, error as Error);
      }
    }
    
    return {
      ...state,
      gameState: result.updatedGameState,
    };
  });

  // Wiring
  graph.addEdge(START as any, "orchestrator" as any);
  graph.addEdge("orchestrator" as any, "memory" as any);
  graph.addEdge("memory" as any, "action" as any);
  graph.addEdge("action" as any, "director" as any);
  graph.addEdge("director" as any, "keeper" as any);
  graph.addEdge("keeper" as any, END as any);

  return graph.compile();
};
