import { END, START, StateGraph } from "@langchain/langgraph";
import type { CoCDatabase } from "./coc_multiagents_system/agents/memory/database/index.js";
import type { RAGEngine } from "./rag/engine.js";
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
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
    console.log("🎯 [Orchestrator Agent] 开始分析用户输入...");
    const gsm = new GameStateManager(state.gameState ?? initialGameState);
    const userInput = latestHumanMessage(state.messages);
    console.log(`🎯 [Orchestrator Agent] 用户输入: "${userInput.substring(0, 100)}${userInput.length > 100 ? '...' : ''}"`);
    const result = await orchestrator.processInput(userInput, gsm);
    console.log("✅ [Orchestrator Agent] 分析完成");
    
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
    console.log("🧠 [Memory Agent] 开始丰富上下文信息...");
    const gameState = state.gameState ?? initialGameState;
    const actionAnalysis =
      gameState.temporaryInfo.currentActionAnalysis as ActionAnalysis | null;
    const enriched = await enrichMemoryContext(gameState, actionAnalysis, rag);
    console.log("✅ [Memory Agent] 上下文丰富完成");

    return { ...state, gameState: enriched };
  });

  // Action: execute action agent using current game state
  graph.addNode("action", async (state: GraphState) => {
    console.log("⚡ [Action Agent] 开始执行动作...");
    const gameState = state.gameState ?? initialGameState;
    const runtime = {}; // ActionAgent expects runtime but only passes through generateText; keep empty placeholder
    const userInput = latestHumanMessage(state.messages);
    const updated = await actionAgent.processAction(runtime, gameState, userInput);
    console.log("✅ [Action Agent] 动作执行完成");
    
    // Update turn with action results if turnId exists
    if (state.turnId) {
      try {
        const updatedState = updated as GameState;
        const actionResults = updatedState.temporaryInfo?.actionResults;
        if (actionResults) {
          turnManager.updateProcessing(state.turnId, {
            actionResults: actionResults
          });
        }
      } catch (error) {
        console.error("Failed to update turn with action results:", error);
      }
    }
    
    return { ...state, gameState: updated as GameState };
  });

  // Director: handle scene change requests from action agent
  graph.addNode("director", async (state: GraphState) => {
    console.log("🎬 [Director Agent] 开始处理场景转换请求...");
    const gsm = new GameStateManager(state.gameState ?? initialGameState);
    const sceneChangeRequest = gsm.getGameState().temporaryInfo.sceneChangeRequest;
    
    // If there's a scene change request, execute it
    if (sceneChangeRequest?.shouldChange && sceneChangeRequest.targetSceneName) {
      console.log(`🎬 [Director Agent] 检测到场景转换请求: ${sceneChangeRequest.targetSceneName}`);
      await directorAgent.handleActionDrivenSceneChange(
        gsm, 
        sceneChangeRequest.targetSceneName,
        sceneChangeRequest.reason
      );
      console.log(`✅ [Director Agent] 场景转换完成: ${sceneChangeRequest.targetSceneName}`);
    } else {
      console.log("✅ [Director Agent] 无场景转换请求，跳过");
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
    console.log("🎭 [Keeper Agent] 开始生成叙事和线索揭示...");
    const gsm = new GameStateManager(state.gameState ?? initialGameState);
    const userInput = latestHumanMessage(state.messages);
    const result = await keeperAgent.generateNarrative(userInput, gsm);
    console.log(`✅ [Keeper Agent] 叙事生成完成 (${result.narrative.length} 字符)`);
    
    // Complete turn with keeper narrative if turnId exists
    if (state.turnId) {
      try {
        turnManager.completeTurn(state.turnId, {
          keeperNarrative: result.narrative,
          clueRevelations: result.clueRevelations
        });
        console.log(`📝 [Keeper Agent] Turn ${state.turnId} 已完成并保存到数据库`);
      } catch (error) {
        console.error("Failed to complete turn:", error);
        turnManager.markError(state.turnId, error as Error);
      }
    }
    
    // Add keeper's narrative to messages so it can be returned to client
    const keeperMessage = new AIMessage(result.narrative);
    const updatedMessages = [...state.messages, keeperMessage];
    
    console.log("📤 [Keeper Agent] 叙事已添加到消息流，准备返回给客户端");
    console.log("🔄 [Graph Flow] 所有 Agent 处理完成，Graph 流程结束");
    
    return {
      ...state,
      messages: updatedMessages,
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
