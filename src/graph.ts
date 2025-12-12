import { END, START, StateGraph } from "@langchain/langgraph";
import { createActionNode } from "./coc_multiagents_system/agents/action/index.js";
import {
  createCheckCompletionNode,
  createExecuteAgentsNode,
  createOrchestratorNode,
  routeToAgent,
  shouldContinue,
} from "./coc_multiagents_system/agents/orchestrator/orchestrator.js";
import type { CoCDatabase } from "./coc_multiagents_system/agents/memory/database/index.js";
import {
  createCharacterNode,
  createKeeperNode,
  createMemoryNode,
} from "./runtime.js";
import { CoCGraphState } from "./state.js";

export const buildGraph = (db: CoCDatabase) => {
  const graph = new StateGraph(CoCGraphState)
    .addNode("orchestrator", createOrchestratorNode())
    .addNode("executeAgents", createExecuteAgentsNode())
    .addNode("character", createCharacterNode(db))
    .addNode("memory", createMemoryNode(db)) // Memory now includes rules database
    .addNode("action", createActionNode())
    .addNode("checkCompletion", createCheckCompletionNode())
    .addNode("keeper", createKeeperNode());

  // Workflow: Orchestrator → ExecuteAgents → [Memory/Character] → CheckCompletion → Keeper → END
  graph.addEdge(START, "orchestrator");
  graph.addEdge("orchestrator", "executeAgents");

  // executeAgents routes to the appropriate agent or to checkCompletion
  graph.addConditionalEdges("executeAgents", routeToAgent, {
    character: "character",
    memory: "memory",
    action: "action",
    check: "checkCompletion",
  });

  // Each agent completes and goes to checkCompletion
  graph.addEdge("character", "checkCompletion");
  graph.addEdge("memory", "checkCompletion");
  graph.addEdge("action", "checkCompletion");

  // checkCompletion decides: continue to next agent or go to keeper
  graph.addConditionalEdges("checkCompletion", shouldContinue, {
    continue: "executeAgents",
    keeper: "keeper",
  });

  // Keeper generates final narrative and ends
  graph.addEdge("keeper", END);

  return graph.compile();
};
