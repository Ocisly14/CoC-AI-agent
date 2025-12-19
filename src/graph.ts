import { END, START, StateGraph } from "@langchain/langgraph";
import type { CoCDatabase } from "./coc_multiagents_system/agents/memory/database/index.js";
import type { RagManager } from "./coc_multiagents_system/agents/memory/RagManager.js";
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { OrchestratorAgent } from "./coc_multiagents_system/agents/orchestrator/orchestratorAgent.js";
import { MemoryAgent } from "./coc_multiagents_system/agents/memory/util.js";
import { ActionAgent } from "./coc_multiagents_system/agents/action/actionAgent.js";
import { CharacterAgent } from "./coc_multiagents_system/agents/character/characterAgent.js";
import { KeeperAgent } from "./coc_multiagents_system/agents/keeper/keeperAgent.js";
import { DirectorAgent } from "./coc_multiagents_system/agents/director/directorAgent.js";
import type { ScenarioLoader } from "./coc_multiagents_system/agents/memory/scenarioloader/index.js";
import {
  GameStateManager,
  initialGameState,
  type GameState,
  type ActionAnalysis,
  type ActionResult,
} from "./state.js";
import { contentToString, latestHumanMessage } from "./utils.js";
import { enrichMemoryContext } from "./coc_multiagents_system/agents/memory/memoryAgent.js";
import { TurnManager } from "./coc_multiagents_system/agents/memory/index.js";

export interface GraphState {
  messages: BaseMessage[];
  gameState: GameState;
  turnId?: string;  // Optional: track the current turn being processed
}

export const buildGraph = (db: CoCDatabase, scenarioLoader: ScenarioLoader, rag?: RagManager) => {
  const orchestrator = new OrchestratorAgent();
  const actionAgent = new ActionAgent(scenarioLoader);
  const characterAgent = new CharacterAgent();
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
    const result = await orchestrator.processInput(userInput, gsm, db);
    console.log("✅ [Orchestrator Agent] 分析完成");
    
    // Log detailed action analysis
    const actionAnalysis = gsm.getGameState().temporaryInfo.currentActionAnalysis;
    if (actionAnalysis) {
      console.log("\n📋 [Action Analysis] 详细分析结果:");
      console.log(`   Character: ${actionAnalysis.character}`);
      console.log(`   Action: ${actionAnalysis.action}`);
      console.log(`   Action Type: ${actionAnalysis.actionType}`);
      console.log(`   Target: ${actionAnalysis.target.name || "N/A"}`);
      console.log(`   Target Intent: ${actionAnalysis.target.intent || "N/A"}`);
      console.log(`   Requires Dice: ${actionAnalysis.requiresDice ? "Yes" : "No"}`);
    } else {
      console.log("⚠️  [Action Analysis] 未生成分析结果");
    }
    
    // Update turn with action analysis if turnId exists
    if (state.turnId) {
      try {
        turnManager.updateProcessing(state.turnId, {
          actionAnalysis: actionAnalysis
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
    const characterInput = latestHumanMessage(state.messages);
    const enriched = await enrichMemoryContext(gameState, actionAnalysis, rag, db, characterInput);
    console.log("✅ [Memory Agent] 上下文丰富完成");

    return { ...state, gameState: enriched };
  });

  // Action: execute action agent using current game state
  graph.addNode("action", async (state: GraphState) => {
    console.log("⚡ [Action Agent] 开始执行动作...");
    const gameState = state.gameState ?? initialGameState;
    const runtime = {}; // ActionAgent expects runtime but only passes through generateText; keep empty placeholder
    const userInput = latestHumanMessage(state.messages);
    
    // Log input context
    const actionAnalysis = gameState.temporaryInfo?.currentActionAnalysis;
    if (actionAnalysis) {
      console.log(`⚡ [Action Agent] 动作分析: ${actionAnalysis.action} (类型: ${actionAnalysis.actionType})`);
      console.log(`⚡ [Action Agent] 角色: ${actionAnalysis.character}, 目标: ${actionAnalysis.target.name || "N/A"}`);
    }
    
    let updated: GameState;
    try {
      updated = await actionAgent.processAction(runtime, gameState, userInput);
    } catch (error) {
      console.error(`\n❌ [Action Agent] 执行过程中抛出异常:`, error);
      console.error(`   错误类型: ${error instanceof Error ? error.constructor.name : typeof error}`);
      console.error(`   错误消息: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        console.error(`   堆栈跟踪:\n${error.stack}`);
      }
      
      // Create error state with error recorded
      const stateManager = new GameStateManager(gameState);
      const errorActionResult: ActionResult = {
        timestamp: new Date(),
        gameTime: gameState.timeOfDay || "Unknown time",
        timeElapsedMinutes: 0,
        location: gameState.currentScenario?.location || "Unknown location",
        character: actionAnalysis?.character || gameState.playerCharacter.name,
        result: `[异常] Action Agent 执行失败: ${error instanceof Error ? error.message : String(error)}`,
        diceRolls: [],
        timeConsumption: "instant",
        scenarioChanges: [`异常: ${error instanceof Error ? error.message : String(error)}`]
      };
      stateManager.addActionResult(errorActionResult);
      updated = stateManager.getGameState() as GameState;
    }
    
    // Validate that updated is a valid GameState
    if (!updated || typeof updated !== 'object' || !updated.temporaryInfo) {
      console.error(`\n❌ [Action Agent] 返回的状态无效:`, updated);
      console.error(`   返回类型: ${typeof updated}`);
      console.error(`   是否为对象: ${typeof updated === 'object'}`);
      console.error(`   是否有 temporaryInfo: ${updated && typeof updated === 'object' && 'temporaryInfo' in updated}`);
      
      // Fallback: return original state with error recorded
      const stateManager = new GameStateManager(gameState);
      const errorActionResult: ActionResult = {
        timestamp: new Date(),
        gameTime: gameState.timeOfDay || "Unknown time",
        timeElapsedMinutes: 0,
        location: gameState.currentScenario?.location || "Unknown location",
        character: actionAnalysis?.character || gameState.playerCharacter.name,
        result: `[错误] Action Agent 返回了无效的状态对象`,
        diceRolls: [],
        timeConsumption: "instant",
        scenarioChanges: [`错误: Action Agent 返回了无效的状态对象`]
      };
      stateManager.addActionResult(errorActionResult);
      updated = stateManager.getGameState() as GameState;
    }
    
    console.log("✅ [Action Agent] 动作执行完成");
    
    // Log all action results in detail
    const updatedState = updated as GameState;
    const actionResults = updatedState.temporaryInfo?.actionResults;
    
    if (actionResults && actionResults.length > 0) {
      console.log(`\n📚 [Action Results] 共有 ${actionResults.length} 个动作结果:`);
      actionResults.forEach((result, index) => {
        const isError = result.result.includes('[错误]') || result.result.includes('[异常]');
        const prefix = isError ? '❌' : '✓';
        console.log(`\n   ${prefix} [${index + 1}/${actionResults.length}] Action Result #${index + 1}:`);
        console.log(`      Character: ${result.character}`);
        console.log(`      Location: ${result.location}`);
        console.log(`      Game Time: ${result.gameTime}`);
        console.log(`      Timestamp: ${result.timestamp ? new Date(result.timestamp).toISOString() : 'N/A'}`);
        console.log(`      Time Elapsed: ${result.timeElapsedMinutes || 0} minutes`);
        console.log(`      Time Consumption: ${result.timeConsumption}`);
        console.log(`      Result: ${result.result}`);
        if (result.diceRolls && result.diceRolls.length > 0) {
          console.log(`      Dice Rolls (${result.diceRolls.length}):`);
          result.diceRolls.forEach((roll, rollIndex) => {
            console.log(`        [${rollIndex + 1}] ${roll}`);
          });
        } else {
          console.log(`      Dice Rolls: None`);
        }
        if (result.scenarioChanges && result.scenarioChanges.length > 0) {
          console.log(`      Scenario Changes (${result.scenarioChanges.length}):`);
          result.scenarioChanges.forEach((change, changeIndex) => {
            console.log(`        [${changeIndex + 1}] ${change}`);
          });
        }
      });
      console.log(`\n   📊 最新动作结果摘要:`);
      const latestResult = actionResults[actionResults.length - 1];
      const isError = latestResult.result.includes('[错误]') || latestResult.result.includes('[异常]');
      const prefix = isError ? '❌' : '✓';
      console.log(`      ${prefix} ${latestResult.character} @ ${latestResult.location} (${latestResult.gameTime})`);
      console.log(`      → ${latestResult.result.substring(0, 150)}${latestResult.result.length > 150 ? '...' : ''}`);
    } else {
      console.log(`\n⚠️  [Action Results] 警告: 暂无动作结果`);
      console.log(`    updatedState.temporaryInfo 存在: ${!!updatedState.temporaryInfo}`);
      console.log(`    actionResults 存在: ${!!actionResults}`);
      console.log(`    actionResults 长度: ${actionResults?.length || 0}`);
    }
    
    // Update turn with action results if turnId exists
    if (state.turnId) {
      try {
        if (actionResults) {
          turnManager.updateProcessing(state.turnId, {
            actionResults: actionResults
          });
          console.log(`📝 [Action Agent] Turn ${state.turnId} 的动作结果已更新到数据库`);
        } else {
          console.warn(`⚠️  [Action Agent] Turn ${state.turnId} 没有动作结果可更新`);
        }
      } catch (error) {
        console.error(`❌ [Action Agent] 更新 turn 失败:`, error);
      }
    }
    
    return { ...state, gameState: updated as GameState };
  });

  // Character: analyze NPC responses to player actions
  graph.addNode("character", async (state: GraphState) => {
    console.log("\n🎭 [Character Agent] 开始分析 NPC 响应...");
    const gameState = state.gameState ?? initialGameState;
    const runtime = {};
    const userInput = latestHumanMessage(state.messages);
    
    const gsm = new GameStateManager(gameState);
    
    try {
      const npcResponseAnalyses = await characterAgent.analyzeNPCResponses(
        runtime,
        gameState,
        userInput
      );
      
      // Store NPC response analyses in state
      gsm.setNPCResponseAnalyses(npcResponseAnalyses);
      
      console.log(`✅ [Character Agent] 分析了 ${npcResponseAnalyses.length} 个 NPC 响应`);
      
      // Check if any NPCs need to respond
      const hasRespondingNPCs = npcResponseAnalyses.some(
        analysis => analysis.willRespond && analysis.responseType && analysis.responseType !== "none"
      );
      
      if (npcResponseAnalyses.length > 0) {
        npcResponseAnalyses.forEach(analysis => {
          if (analysis.willRespond) {
            console.log(`   ✓ ${analysis.npcName}: ${analysis.responseType} (urgency: ${analysis.urgency})`);
          } else {
            console.log(`   - ${analysis.npcName}: 无响应`);
          }
        });
      }
      
      // Store flag in state to indicate if NPCs need to act
      const updatedState = gsm.getGameState() as GameState;
      updatedState.temporaryInfo.contextualData = updatedState.temporaryInfo.contextualData || {};
      updatedState.temporaryInfo.contextualData.hasRespondingNPCs = hasRespondingNPCs;
      
      if (hasRespondingNPCs) {
        console.log(`\n📋 [Character Agent] 检测到 ${npcResponseAnalyses.filter(a => a.willRespond && a.responseType && a.responseType !== "none").length} 个 NPC 需要执行动作`);
      } else {
        console.log(`\n📋 [Character Agent] 没有 NPC 需要执行动作，直接进入 Keeper`);
      }
      
      return { ...state, gameState: updatedState };
    } catch (error) {
      console.error(`❌ [Character Agent] 分析 NPC 响应时出错:`, error);
      // Continue with empty analyses on error
      gsm.setNPCResponseAnalyses([]);
      const updatedState = gsm.getGameState() as GameState;
      updatedState.temporaryInfo.contextualData = updatedState.temporaryInfo.contextualData || {};
      updatedState.temporaryInfo.contextualData.hasRespondingNPCs = false;
      return { ...state, gameState: updatedState };
    }
  });

  // NPC Action: process NPC actions based on response analyses
  graph.addNode("npcAction", async (state: GraphState) => {
    console.log("\n⚡ [NPC Action Agent] 开始处理 NPC 动作...");
    const gameState = state.gameState ?? initialGameState;
    const runtime = {};
    
    let updated: GameState;
    try {
      updated = await actionAgent.processNPCActions(runtime, gameState);
      console.log("✅ [NPC Action Agent] NPC 动作处理完成");
    } catch (error) {
      console.error(`❌ [NPC Action Agent] 处理 NPC 动作时出错:`, error);
      // Continue with original state on error
      updated = gameState;
    }
    
    return { ...state, gameState: updated as GameState };
  });

  // Director: handle scene change requests from action agent
  graph.addNode("director", async (state: GraphState) => {
    console.log("\n🎬 [Director Agent] 开始处理场景转换请求...");
    const gsm = new GameStateManager(state.gameState ?? initialGameState);
    const gameStateBefore = gsm.getGameState();
    const sceneChangeRequest = gameStateBefore.temporaryInfo.sceneChangeRequest;
    
    // Log current state before processing
    console.log(`\n📊 [Director Agent] 处理前状态:`);
    console.log(`   当前场景: ${gameStateBefore.currentScenario?.name || '无'}`);
    console.log(`   已访问场景数: ${gameStateBefore.visitedScenarios.length}`);
    
    // If there's a scene change request, execute it
    if (sceneChangeRequest?.shouldChange && sceneChangeRequest.targetSceneName) {
      console.log(`\n🎯 [Director Agent] 检测到场景转换请求:`);
      console.log(`   目标场景: ${sceneChangeRequest.targetSceneName}`);
      console.log(`   原因: ${sceneChangeRequest.reason}`);
      console.log(`   时间戳: ${sceneChangeRequest.timestamp.toISOString()}`);
      
      await directorAgent.handleActionDrivenSceneChange(
        gsm, 
        sceneChangeRequest.targetSceneName,
        sceneChangeRequest.reason
      );
      
      const gameStateAfter = gsm.getGameState();
      console.log(`\n📊 [Director Agent] 处理后状态:`);
      console.log(`   当前场景: ${gameStateAfter.currentScenario?.name || '无'}`);
      console.log(`   已访问场景数: ${gameStateAfter.visitedScenarios.length}`);
      console.log(`\n✅ [Director Agent] 场景转换流程完成\n`);
    } else {
      console.log("\n✅ [Director Agent] 无场景转换请求，跳过");
      if (sceneChangeRequest) {
        console.log(`   场景转换请求存在但未满足条件:`);
        console.log(`     shouldChange: ${sceneChangeRequest.shouldChange}`);
        console.log(`     targetSceneName: ${sceneChangeRequest.targetSceneName || 'null'}`);
      }
    }
    
    // Clear the request
    gsm.clearSceneChangeRequest();
    
    // Generate narrative direction instruction for Keeper Agent
    const currentGameState = gsm.getGameState();
    const characterInput = latestHumanMessage(state.messages);
    const actionResults = currentGameState.temporaryInfo.actionResults || [];
    
    try {
      console.log("\n🎬 [Director Agent] 开始生成叙事方向指导...");
      const narrativeDirection = await directorAgent.generateNarrativeDirection(
        gsm,
        characterInput,
        actionResults
      );
      gsm.setNarrativeDirection(narrativeDirection);
      console.log(`✅ [Director Agent] 叙事方向指导已生成: ${narrativeDirection.substring(0, 100)}${narrativeDirection.length > 100 ? '...' : ''}`);
    } catch (error) {
      console.error("❌ [Director Agent] 生成叙事方向指导失败:", error);
      // Set null if generation fails
      gsm.setNarrativeDirection(null);
    }
    
    // Update turn with director decision if turnId exists
    if (state.turnId) {
      try {
        turnManager.updateProcessing(state.turnId, {
          directorDecision: gsm.getGameState().temporaryInfo.directorDecision
        });
        console.log(`📝 [Director Agent] Turn ${state.turnId} 的 director 决策已更新到数据库`);
      } catch (error) {
        console.error(`❌ [Director Agent] 更新 turn 失败:`, error);
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

  // Conditional routing function: check if NPCs need to act
  const shouldProcessNPCActions = (state: GraphState): string => {
    const gameState = state.gameState ?? initialGameState;
    const hasRespondingNPCs = gameState.temporaryInfo.contextualData?.hasRespondingNPCs === true;
    
    if (hasRespondingNPCs) {
      console.log("\n🔄 [Graph Router] 路由到 NPC Action Agent");
      return "npcAction";
    } else {
      console.log("\n🔄 [Graph Router] 跳过 NPC Action，直接进入 Director");
      return "director";
    }
  };

  // Wiring
  graph.addEdge(START as any, "orchestrator" as any);
  graph.addEdge("orchestrator" as any, "memory" as any);
  graph.addEdge("memory" as any, "action" as any);
  graph.addEdge("action" as any, "character" as any);
  
  // Conditional edge: character -> npcAction or director
  graph.addConditionalEdges(
    "character" as any,
    shouldProcessNPCActions,
    {
      "npcAction": "npcAction" as any,
      "director": "director" as any
    }
  );
  
  graph.addEdge("npcAction" as any, "director" as any);
  graph.addEdge("director" as any, "keeper" as any);
  graph.addEdge("keeper" as any, END as any);

  return graph.compile();
};
