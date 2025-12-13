import { getOrchestratorTemplate } from "./orchestratorTemplate.js";
import { composeTemplate } from "../../../template.js";
import type { GameState, ActionAnalysis, GameStateManager } from "../../../state.js";
import {
  ModelProviderName,
  ModelClass,
  generateText,
} from "../../../models/index.js";

interface OrchestratorRuntime {
  modelProvider: ModelProviderName;
  getSetting: (key: string) => string | undefined;
}

const createRuntime = (): OrchestratorRuntime => ({
  modelProvider: (process.env.MODEL_PROVIDER as ModelProviderName) || ModelProviderName.OPENAI,
  getSetting: (key: string) => process.env[key],
});

/**
 * Orchestrator Agent - Routes user queries to appropriate agents
 */
export class OrchestratorAgent {
  
  /**
   * Process input (user query, agent result, or instruction) and determine which agent to route to
   */
  async processInput(input: string, gameStateManager: GameStateManager): Promise<string> {
    const runtime = createRuntime();
    const gameState = gameStateManager.getGameState();
    
    // Get the template
    const template = getOrchestratorTemplate();
    
    // Extract context from game state
    const playerName = gameState.playerCharacter?.name || "Unknown";
    const scenarioLocation = gameState.currentScenario?.location || "Unknown location";
    const npcNames = gameState.npcCharacters?.map(npc => npc.name).join(", ") || "None";
    
    // Compose the prompt with input and game context
    const prompt = composeTemplate(template, {}, {
      input,
      playerName,
      scenarioLocation,
      npcNames
    });

    // Generate response using LLM
    const response = await generateText({
      runtime,
      context: prompt,
      modelClass: ModelClass.MEDIUM,
    });

    // Parse the response and store action analysis
    try {
      const parsedResponse = JSON.parse(response);
      if (parsedResponse.actionAnalysis) {
        gameStateManager.setActionAnalysis(parsedResponse.actionAnalysis as ActionAnalysis);
      }
    } catch (error) {
      console.warn("Failed to parse orchestrator response for action analysis:", error);
    }

    return response;
  }

}