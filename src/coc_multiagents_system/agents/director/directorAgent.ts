import { getDirectorTemplate, getActionDrivenSceneChangeTemplate, getNarrativeDirectionTemplate } from "./directorTemplate.js";
import { composeTemplate } from "../../../template.js";
import type { GameState, GameStateManager, VisitedScenarioBasic, DirectorDecision } from "../../../state.js";
import type { ScenarioProfile, ScenarioSnapshot } from "../models/scenarioTypes.js";
import { ScenarioLoader } from "../memory/scenarioloader/scenarioLoader.js";
import { updateCurrentScenarioWithCheckpoint } from "../memory/index.js";
import type { CoCDatabase } from "../memory/database/index.js";
import { ModuleLoader } from "../memory/moduleloader/index.js";
import type { ActionResult } from "../../../state.js";
import {
  ModelProviderName,
  ModelClass,
  generateText,
} from "../../../models/index.js";
import * as fs from "fs";
import * as path from "path";

interface DirectorRuntime {
  modelProvider: ModelProviderName;
  getSetting: (key: string) => string | undefined;
}

const createRuntime = (): DirectorRuntime => ({
  modelProvider: (process.env.MODEL_PROVIDER as ModelProviderName) || ModelProviderName.OPENAI,
  getSetting: (key: string) => process.env[key],
});

/**
 * Director Agent - Story progression and scene transition director
 * Responsible for monitoring game progress and advancing story development
 */
export class DirectorAgent {
  private scenarioLoader: ScenarioLoader;
  private db: CoCDatabase;
  private userQueryHistory: string[] = [];

  constructor(scenarioLoader: ScenarioLoader, db: CoCDatabase) {
    this.scenarioLoader = scenarioLoader;
    this.db = db;
  }

  /**
   * Analyze current game state and provide story progression recommendations
   */
  async analyzeProgressionNeeds(gameStateManager: GameStateManager, userQuery?: string): Promise<DirectorDecision> {
    const runtime = createRuntime();
    const gameState = gameStateManager.getGameState();
    
    // Record user query history
    if (userQuery) {
      this.addToQueryHistory(userQuery);
    }
    
    // Get complete current scenario information
    const currentScenarioInfo = this.extractCurrentScenarioInfo(gameState);
    
    // Get discovered clues information
    const discoveredCluesInfo = this.extractDiscoveredClues(gameState);
    
    // Get user's recent 10 queries
    const recentQueries = this.getRecentQueries();
    
    // Load map information
    const mapData = this.loadMapData();
    
    // Get set of visited scenario names (for map judgment)
    const visitedScenarioNames = new Set<string>();
    if (gameState.currentScenario) {
      visitedScenarioNames.add(gameState.currentScenario.name);
    }
    gameState.visitedScenarios.forEach(scenario => {
      visitedScenarioNames.add(scenario.name);
    });
    
    // Get template
    const template = getDirectorTemplate();
    
    // Prepare template context
    const templateContext = {
      // Current game state
      currentScenario: currentScenarioInfo,
      
      // Discovered clues
      discoveredClues: discoveredCluesInfo,
      
      // User query history
      recentQueries,
      
      // Map information
      mapData,
      
      // Visited scenario names
      visitedScenarioNames: Array.from(visitedScenarioNames),
      
      // Game state statistics
      gameStats: {
        sessionId: gameState.sessionId,
        phase: gameState.phase,
        gameDay: gameState.gameDay,
        timeOfDay: gameState.timeOfDay,
        tension: gameState.tension,
        totalCluesDiscovered: gameState.discoveredClues.length,
        visitedScenarioCount: gameState.visitedScenarios.length,
        playerStatus: {
          hp: gameState.playerCharacter.status.hp,
          maxHp: gameState.playerCharacter.status.maxHp,
          sanity: gameState.playerCharacter.status.sanity,
          maxSanity: gameState.playerCharacter.status.maxSanity
        }
      },
      
      // Latest user query
      latestUserQuery: userQuery || "No recent query"
    };

    // Use template and LLM to analyze story progression needs
    const prompt = composeTemplate(template, {}, templateContext, "handlebars");

    const response = await generateText({
      runtime,
      context: prompt,
      modelClass: ModelClass.SMALL,
    });

    // Parse LLM's JSON response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(response);
    } catch (error) {
      console.error("Failed to parse director response as JSON:", error);
      return {
        shouldProgress: false,
        targetSnapshotId: undefined,
        reasoning: "Unable to analyze progression needs - JSON parse error",
        timestamp: new Date()
      };
    }

    const estimatedShortActions = 
      typeof parsedResponse.estimatedShortActions === "number" && parsedResponse.estimatedShortActions > 0
        ? parsedResponse.estimatedShortActions
        : null;
    const increaseShortActionCapBy =
      typeof parsedResponse.increaseShortActionCapBy === "number" && parsedResponse.increaseShortActionCapBy > 0
        ? parsedResponse.increaseShortActionCapBy
        : null;

    // Build Director Decision
    // If LLM returns scene name instead of ID, need to find corresponding scene ID first
    let targetSnapshotId = parsedResponse.targetSnapshotId;
    if (parsedResponse.targetScenarioName && !targetSnapshotId) {
      // Try to find ID by scene name
      const allScenarios = this.scenarioLoader.getAllScenarios();
      const matchedScenario = allScenarios.find(s => 
        s.snapshot.name.toLowerCase().trim() === parsedResponse.targetScenarioName.toLowerCase().trim()
      );
      if (matchedScenario) {
        targetSnapshotId = matchedScenario.snapshot.id;
        console.log(`Found scenario ID ${targetSnapshotId} for name "${parsedResponse.targetScenarioName}"`);
      } else {
        console.warn(`Could not find scenario with name "${parsedResponse.targetScenarioName}"`);
      }
    }

    const decision: DirectorDecision = {
      shouldProgress: parsedResponse.shouldProgress || false,
      targetSnapshotId: targetSnapshotId,
      estimatedShortActions,
      increaseShortActionCapBy,
      reasoning: parsedResponse.reasoning || parsedResponse.recommendation || "No reasoning provided",
      timestamp: new Date()
    };

    // Save decision to game state
    gameStateManager.setDirectorDecision(decision);

    // If progression is needed and target scene ID exists, directly execute scene update
    if (decision.shouldProgress && decision.targetSnapshotId) {
      await this.executeScenarioProgression(decision.targetSnapshotId, gameStateManager, estimatedShortActions);
    } else if (!decision.shouldProgress && increaseShortActionCapBy) {
      this.extendCurrentScenarioActionCap(gameStateManager, increaseShortActionCapBy);
    }

    return decision;
  }

  /**
   * Extract complete current scenario information
   */
  private extractCurrentScenarioInfo(gameState: GameState) {
    if (!gameState.currentScenario) {
      return null;
    }

    // Return complete current scenario state
    return gameState.currentScenario;
  }

  /**
   * Extract discovered clues information
   */
  private extractDiscoveredClues(gameState: GameState) {
    const discoveredClues = [];

    // Get from global discovery list
    const globalClues = gameState.discoveredClues.map(clue => ({
      type: clue.type,
      source: clue.sourceName,
      clueText: clue.text,
      discoveredBy: clue.discoveredBy,
      discoveredAt: clue.discoveredAt
    }));
    discoveredClues.push(...globalClues);

    // Get discovered clues from current scenario
    if (gameState.currentScenario && gameState.currentScenario.clues) {
      const scenarioClues = gameState.currentScenario.clues
        .filter(clue => clue.discovered)
        .map(clue => ({
          source: "scenario",
          id: clue.id,
          clueText: clue.clueText,
          location: clue.location,
          discoveryMethod: clue.discoveryMethod,
          reveals: clue.reveals
        }));
      discoveredClues.push(...scenarioClues);
    }

    // Get revealed clues from NPCs
    gameState.npcCharacters.forEach(npc => {
      const npcData = npc as any;
      if (npcData.clues) {
        const revealedNpcClues = npcData.clues
          .filter((clue: any) => clue.revealed)
          .map((clue: any) => ({
            source: "npc",
            npcName: npc.name,
            clueText: clue.clueText
          }));
        discoveredClues.push(...revealedNpcClues);
      }
    });

    return discoveredClues;
  }

  /**
   * Add user query to history
   */
  private addToQueryHistory(query: string) {
    this.userQueryHistory.push(query);
    
    // Only keep recent 20 queries (more than needed for filtering)
    if (this.userQueryHistory.length > 20) {
      this.userQueryHistory = this.userQueryHistory.slice(-20);
    }
  }

  /**
   * Get recent 10 user queries
   */
  private getRecentQueries(): string[] {
    return this.userQueryHistory.slice(-10);
  }

  /**
   * Load map information
   */
  private loadMapData(): any | null {
    try {
      const mapPath = path.join(process.cwd(), "data", "Mods", "Cassandra's Black Carnival", "map.json");
      if (!fs.existsSync(mapPath)) {
        console.warn(`Map file not found at: ${mapPath}`);
        return null;
      }
      const mapContent = fs.readFileSync(mapPath, "utf-8");
      return JSON.parse(mapContent);
    } catch (error) {
      console.error("Error loading map data:", error);
      return null;
    }
  }

  // Time progression removed - scenarios are now static snapshots without timeline

  /**
   * Execute scenario progression - update current scenario based on target scene ID
   */
  private async executeScenarioProgression(
    targetSnapshotId: string, 
    gameStateManager: GameStateManager,
    estimatedShortActions: number | null = null
  ): Promise<void> {
    try {
      // Find target scenario snapshot from scenario loader (each scenario has only one snapshot)
      const allScenarios = this.scenarioLoader.getAllScenarios();
      let targetSnapshot: ScenarioSnapshot | null = null;
      let scenarioName = "";

      // Search for target snapshot in all scenarios
      for (const scenario of allScenarios) {
        if (scenario.snapshot.id === targetSnapshotId) {
          targetSnapshot = scenario.snapshot;
          scenarioName = scenario.name;
          break;
        }
      }

      if (targetSnapshot) {
        // Attach short action estimate to target scenario snapshot for subsequent state tracking
        if (estimatedShortActions && estimatedShortActions > 0) {
          targetSnapshot.estimatedShortActions = estimatedShortActions;
        } else {
          targetSnapshot.estimatedShortActions = undefined;
        }

        // Execute scene update (with checkpoint save)
        await updateCurrentScenarioWithCheckpoint(
          gameStateManager,
          {
            snapshot: targetSnapshot,
            scenarioName: scenarioName
          },
          this.db
        );
        
        console.log(`Director Agent: Progressed to scenario "${scenarioName}" snapshot "${targetSnapshotId}" (checkpoint created)`);
      } else {
        console.warn(`Director Agent: Could not find target snapshot "${targetSnapshotId}"`);
      }
    } catch (error) {
      console.error("Error executing scenario progression:", error);
    }
  }

  /**
   * Process Director Agent input request
   */
  async processInput(input: string, gameStateManager: GameStateManager): Promise<DirectorDecision> {
    try {
      const result = await this.analyzeProgressionNeeds(gameStateManager, input);
      return result;
    } catch (error) {
      console.error("Error in Director Agent:", error);
      const errorDecision: DirectorDecision = {
        shouldProgress: false,
        targetSnapshotId: undefined,
        estimatedShortActions: null,
        reasoning: "Director Agent encountered an error analyzing progression needs",
        timestamp: new Date()
      };
      gameStateManager.setDirectorDecision(errorDecision);
      return errorDecision;
    }
  }

  /**
   * Extend current scene short action cap (used when not progressing scene)
   */
  private extendCurrentScenarioActionCap(gameStateManager: GameStateManager, increaseBy: number): void {
    const gameState = gameStateManager.getGameState();
    if (!gameState.currentScenario) {
      console.warn("Director Agent: No current scenario to extend short action cap");
      return;
    }

    const currentCap = gameState.currentScenario.estimatedShortActions || 3;
    const newCap = currentCap + increaseBy;
    gameState.currentScenario.estimatedShortActions = newCap;
    console.log(`Director Agent: Extended current scenario short action cap from ${currentCap} to ${newCap}`);
  }

  /**
   * Execute scene change (find and switch by scene name)
   * This is a reusable helper method for finding and executing scene changes by scene name
   */
  private async executeSceneChangeByName(
    targetSceneName: string,
    gameStateManager: GameStateManager
  ): Promise<void> {
    const gameState = gameStateManager.getGameState();
    
    // Search for target scenario
    console.log(`\n🔍 [Finding Target Scene]:`);
    console.log(`   Searching for scene: "${targetSceneName}"...`);
    
    // First try exact match
    let targetScenarioProfile: ScenarioProfile | null = null;
    const allScenarios = this.scenarioLoader.getAllScenarios();
    const exactMatch = allScenarios.find(s => 
      s.snapshot.name.toLowerCase().trim() === targetSceneName.toLowerCase().trim()
    );
    
    if (exactMatch) {
      console.log(`   ✓ Found exact match scene`);
      targetScenarioProfile = exactMatch;
    } else {
      // Fallback to fuzzy search if exact match not found
      console.log(`   ⚠️  No exact match found, using fuzzy search...`);
      const searchResult = this.scenarioLoader.searchScenarios({ name: targetSceneName });
      
      if (searchResult.scenarios.length === 0) {
        console.error(`   ❌ No matching scene found: "${targetSceneName}"`);
        console.error(`   💡 Tip: Please check if the scene name is correct, or if the scene has been loaded into the database`);
        return;
      }
      
      targetScenarioProfile = searchResult.scenarios[0];
    }
    
    const targetSnapshot = targetScenarioProfile.snapshot;
    
    console.log(`   ✓ Found matching scene: ${targetScenarioProfile.name}`);
    console.log(`     Scene ID: ${targetSnapshot.id}`);
    console.log(`     Location: ${targetSnapshot.location}`);
    console.log(`     Description: ${targetSnapshot.description ? targetSnapshot.description.substring(0, 100) + '...' : 'None'}`);
    console.log(`     Characters: ${targetSnapshot.characters?.length || 0}`);
    console.log(`     Clues: ${targetSnapshot.clues?.length || 0}`);
    console.log(`     Exits: ${targetSnapshot.exits?.length || 0}`);
    
    // Check if we're returning to a previously visited scenario
    const wasVisited = gameState.visitedScenarios.some(
      v => v.id === targetSnapshot.id || v.name === targetScenarioProfile.name
    );
    
    if (wasVisited) {
      console.log(`   📂 This is a previously visited scene, will restore historical state`);
    } else {
      console.log(`   🆕 This is a first-time visit scene`);
    }
    
    // Execute scene transition
    console.log(`\n🔄 [Executing Scene Transition]:`);
    try {
      await updateCurrentScenarioWithCheckpoint(
        gameStateManager,
        {
          snapshot: targetSnapshot,
          scenarioName: targetScenarioProfile.name
        },
        this.db
      );
      
      const updatedState = gameStateManager.getGameState();
      
      console.log(`   ✓ Scene transition completed successfully`);
      console.log(`\n📍 [Post-Transition State]:`);
      console.log(`   Current Scene: ${updatedState.currentScenario?.name || 'None'}`);
      console.log(`   Scene ID: ${updatedState.currentScenario?.id || 'None'}`);
      console.log(`   Location: ${updatedState.currentScenario?.location || 'None'}`);
      console.log(`   Visited Scenarios Count: ${updatedState.visitedScenarios.length}`);
      
      console.log(`\n📚 [Updated Visited Scenarios List]:`);
      if (updatedState.visitedScenarios.length > 0) {
        updatedState.visitedScenarios.forEach((visited, index) => {
          console.log(`   [${index + 1}] ${visited.name} (${visited.location})`);
        });
      } else {
        console.log(`   (None)`);
      }
      
      console.log(`\n✅ [Director Agent] Scene transition completed`);
      console.log(`🎬 [Director Agent] ========================================\n`);
      
    } catch (error) {
      console.error(`   ❌ Scene transition failed:`, error);
      console.error(`   Error type: ${error instanceof Error ? error.constructor.name : typeof error}`);
      console.error(`   Error message: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        console.error(`   Stack trace:\n${error.stack}`);
      }
      throw error;
    }
  }

  /**
   * Handle scene change request initiated by Action Agent
   * Use map data and LLM to validate and select target scene
   */
  async handleActionDrivenSceneChange(
    gameStateManager: GameStateManager,
    targetSceneName: string,
    reason: string
  ): Promise<void> {
    console.log(`\n🎬 [Director Agent] ========================================`);
    console.log(`🎬 [Director Agent] Starting to process Action-driven scene transition`);
    console.log(`🎬 [Director Agent] ========================================`);
    
    const gameState = gameStateManager.getGameState();
    const currentScenario = gameState.currentScenario;
    
    // Log current state
    console.log(`\n📍 [Current Scene State]:`);
    if (currentScenario) {
      console.log(`   Scene Name: ${currentScenario.name}`);
      console.log(`   Scene ID: ${currentScenario.id}`);
      console.log(`   Location: ${currentScenario.location}`);
      console.log(`   Description: ${currentScenario.description ? currentScenario.description.substring(0, 100) + '...' : 'None'}`);
    } else {
      console.log(`   ⚠️  No current scene`);
    }
    
    // Log target scene request
    console.log(`\n🎯 [Scene Transition Request]:`);
    console.log(`   Target Scene Name: ${targetSceneName}`);
    console.log(`   Transition Reason: ${reason}`);
    
    // Load map data
    const mapData = this.loadMapData();
    if (!mapData) {
      console.warn(`   ⚠️  Unable to load map data, will use requested scene name directly`);
      await this.executeSceneChangeByName(targetSceneName, gameStateManager);
      return;
    }
    
    // Get conversation history to extract previous narrative and current character input
    const conversationHistory = (gameState.temporaryInfo.contextualData?.conversationHistory as Array<{
      turnNumber: number;
      characterInput: string;
      keeperNarrative: string | null;
    }>) || [];
    
    // Get previous round narrative (last completed turn with narrative)
    let previousNarrative: string | null = null;
    if (conversationHistory.length > 0) {
      const lastTurnWithNarrative = [...conversationHistory]
        .reverse()
        .find(turn => turn.keeperNarrative);
      if (lastTurnWithNarrative && lastTurnWithNarrative.keeperNarrative) {
        previousNarrative = lastTurnWithNarrative.keeperNarrative;
      }
    }
    
    // Get current round character input (latest turn without narrative yet, or from the latest turn)
    let characterInput: string | null = null;
    if (conversationHistory.length > 0) {
      // Get the latest turn that has characterInput but no narrative yet
      const latestTurn = conversationHistory[conversationHistory.length - 1];
      if (latestTurn && latestTurn.characterInput && !latestTurn.keeperNarrative) {
        characterInput = latestTurn.characterInput;
      } else {
        // Fallback: get the latest characterInput from any turn
        const latestWithInput = [...conversationHistory]
          .reverse()
          .find(turn => turn.characterInput);
        if (latestWithInput && latestWithInput.characterInput) {
          characterInput = latestWithInput.characterInput;
        }
      }
    }
    
    // Use LLM to validate and select target scene based on map
    console.log(`\n🤖 [Using LLM to Validate Scene Selection Based on Map]:`);
    const runtime = createRuntime();
    const template = getActionDrivenSceneChangeTemplate();
    
    const templateContext = {
      currentScene: currentScenario ? {
        name: currentScenario.name,
        location: currentScenario.location
      } : null,
      mapData,
      previousNarrative,
      characterInput
    };
    
    const prompt = composeTemplate(template, {}, templateContext, "handlebars");
    
    let validatedTargetSceneName: string;
    try {
      const response = await generateText({
        runtime,
        context: prompt,
        modelClass: ModelClass.SMALL,
      });
      
      // Parse LLM response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(response);
      } catch (error) {
        console.error("Failed to parse LLM response as JSON:", error);
        console.log(`   ⚠️  JSON parsing failed, using original requested scene name`);
        validatedTargetSceneName = targetSceneName;
      }
      
      if (parsedResponse && parsedResponse.targetScenarioName) {
        validatedTargetSceneName = parsedResponse.targetScenarioName;
        console.log(`   ✓ LLM validation completed`);
        console.log(`   LLM returned scene name: ${validatedTargetSceneName}`);
        if (parsedResponse.reasoning) {
          console.log(`   LLM reasoning: ${parsedResponse.reasoning}`);
        }
      } else {
        console.warn(`   ⚠️  targetScenarioName not found in LLM response, using original requested scene name`);
        validatedTargetSceneName = targetSceneName;
      }
    } catch (error) {
      console.error(`   ❌ LLM call failed:`, error);
      console.log(`   ⚠️  Will use original requested scene name`);
      validatedTargetSceneName = targetSceneName;
    }
    
    // Execute scene change using the validated scene name
    await this.executeSceneChangeByName(validatedTargetSceneName, gameStateManager);
  }

  /**
   * Get related connected scenes (no longer has time restrictions)
   */
  async getConnectedScenes(currentScenario: ScenarioSnapshot): Promise<ConnectedSceneInfo[]> {
    try {
      // Find the scenario profile that contains this snapshot
      const allScenarios = this.scenarioLoader.getAllScenarios();
      const currentScenarioProfile = allScenarios.find(s => s.snapshot.id === currentScenario.id);
      
      if (!currentScenarioProfile || !currentScenarioProfile.connections) {
        console.log("No scenario profile or connections found");
        return [];
      }

      // Get all connected scenario IDs
      const connectedScenarioIds = currentScenarioProfile.connections.map(conn => conn.scenarioId);
      
      if (connectedScenarioIds.length === 0) {
        console.log("No connected scenarios");
        return [];
      }

      const connectedScenes: ConnectedSceneInfo[] = [];

      // Iterate through each connected scenario
      for (const connectedScenarioId of connectedScenarioIds) {
        const scenarioProfile = this.scenarioLoader.getScenarioById(connectedScenarioId);
        if (!scenarioProfile) continue;

        // Find corresponding connection information
        const connectionInfo = currentScenarioProfile.connections!.find(
          conn => conn.scenarioId === connectedScenarioId
        );

        // Get the single snapshot for this scenario (no timeline)
        const snapshot = scenarioProfile.snapshot;
              
        connectedScenes.push({
          ...snapshot,
          connectionType: connectionInfo?.relationshipType || "unknown",
          connectionDescription: connectionInfo?.description || "",
          timeDifferenceHours: 0, // No time difference concept anymore
        });
      }

      console.log(`Found ${connectedScenes.length} connected scenes`);
      return connectedScenes;
    } catch (error) {
      console.error("Error getting connected scenes:", error);
      return [];
    }
  }

  /**
   * Use scene transition template to make decision
   */
  async decideSceneTransition(gameStateManager: GameStateManager): Promise<SceneTransitionDecision> {
    const runtime = createRuntime();
    const gameState = gameStateManager.getGameState();
    const { getSceneTransitionTemplate } = await import("./directorTemplate.js");
    
    if (!gameState.currentScenario) {
      throw new Error("No current scenario to transition from");
    }

    // Get connected scenes
    const connectedScenes = await this.getConnectedScenes(gameState.currentScenario);

    // Package current scene information
    const discoveredCount = gameState.currentScenario.clues.filter(c => c.discovered).length;
    const totalCount = gameState.currentScenario.clues.length;
    const actionCount = Object.values(gameState.scenarioTimeState.playerTimeConsumption)
      .reduce((sum, p: any) => sum + (p.totalShortActions || 0), 0);

    const currentScene = {
      name: gameState.currentScenario.name,
      location: gameState.currentScenario.location,
      description: gameState.currentScenario.description,
      cluesDiscovered: discoveredCount,
      cluesTotal: totalCount,
      characterCount: gameState.currentScenario.characters.length,
      actionCount,
      keeperNotes: gameState.currentScenario.keeperNotes,
    };

    // Package available scene information
    const availableScenes = connectedScenes.map(scene => ({
      id: scene.id,
      name: scene.name,
      location: scene.location,
      connectionType: scene.connectionType,
      connectionDesc: scene.connectionDescription,
      description: scene.description.length > 200 ? scene.description.slice(0, 200) + "..." : scene.description,
      clueCount: scene.clues.length,
      characterCount: scene.characters.length,
      keeperNotes: scene.keeperNotes,
    }));

    // Package activity summary
    const recentActions = gameState.temporaryInfo.actionResults.slice(-5);
    const discoveredClues = gameState.currentScenario.clues.filter(c => c.discovered);
    
    const activityParts = [];
    if (recentActions.length > 0) {
      activityParts.push(`**Recent**: ${recentActions.map((a, i) => `${i+1}.${a.character}:${a.result}`).join("; ")}`);
    }
    if (discoveredClues.length > 0) {
      activityParts.push(`**Clues**: ${discoveredClues.map(c => c.clueText.slice(0, 40)).join("; ")}`);
    }
    const timeConsumption = Object.entries(gameState.scenarioTimeState.playerTimeConsumption)
      .map(([name, data]: [string, any]) => `${name}:${data.totalShortActions}acts`).join(", ");
    if (timeConsumption) {
      activityParts.push(`**Time**: ${timeConsumption}`);
    }

    const activitySummary = activityParts.length > 0 ? activityParts.join("\n") : "*No activity yet*";

    // Build template data
    const templateData = {
      currentScene,
      availableScenes,
      activitySummary,
    };

    const template = getSceneTransitionTemplate();
    const prompt = composeTemplate(template, templateData);

    console.log("\n=== Director: Scene Transition Analysis ===");
    console.log(`Current Scene: ${gameState.currentScenario.name}`);
    console.log(`Connected Scenes Available: ${connectedScenes.length}`);

    const response = await generateText({
      runtime,
      context: prompt,
      modelClass: ModelClass.SMALL,
    });

    console.log("\n=== Director Response ===");
    console.log(response);

    // Parse JSON response
    const decision = this.parseSceneTransitionDecision(response);
    
    // Validate target scene ID
    if (decision.shouldTransition && decision.targetSceneId) {
      const targetScene = connectedScenes.find(s => s.id === decision.targetSceneId);
      if (!targetScene) {
        console.warn(`Target scene ${decision.targetSceneId} not found in connected scenes`);
        decision.shouldTransition = false;
        decision.targetSceneId = null;
      }
    }

    return decision;
  }

  /**
   * Parse scene transition decision JSON
   */
  private parseSceneTransitionDecision(response: string): SceneTransitionDecision {
    try {
      // Try to extract JSON
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || 
                       response.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      return {
        shouldTransition: parsed.shouldTransition || false,
        targetSceneId: parsed.targetSceneId || null,
        reasoning: parsed.reasoning || "No reasoning provided",
        urgency: parsed.urgency || "low",
        transitionType: parsed.transitionType || "player-initiated",
        suggestedTransitionNarrative: parsed.suggestedTransitionNarrative || "",
      };
    } catch (error) {
      console.error("Failed to parse scene transition decision:", error);
      return {
        shouldTransition: false,
        targetSceneId: null,
        reasoning: "Failed to parse director response",
        urgency: "low",
        transitionType: "player-initiated",
        suggestedTransitionNarrative: "",
      };
    }
  }

  /**
   * Make decision and automatically execute scene transition (if decision is true)
   */
  async decideAndTransition(gameStateManager: GameStateManager): Promise<SceneTransitionResult> {
    // Step 1: Make decision
    const decision = await this.decideSceneTransition(gameStateManager);

    console.log("\n=== Director: Transition Decision ===");
    console.log(`Should Transition: ${decision.shouldTransition}`);
    console.log(`Reasoning: ${decision.reasoning}`);

    // If transition is not needed, save rejection information and return
    if (!decision.shouldTransition || !decision.targetSceneId) {
      // Save scene transition rejection information so Keeper can generate reasonable narrative
      gameStateManager.setSceneTransitionRejection(decision.reasoning);
      
      return {
        decision,
        transitioned: false,
        message: "No transition needed"
      };
    }

    // Step 2: Execute transition
    try {
      const targetScenarioId = decision.targetSceneId;
      
      // Get complete scenario from scenarioLoader
      const targetScenario = this.scenarioLoader.getScenarioById(targetScenarioId);
      if (!targetScenario) {
        console.error(`Target scenario not found for snapshot ID: ${targetScenarioId}`);
        return {
          decision,
          transitioned: false,
          message: `Target scenario not found: ${targetScenarioId}`
        };
      }

      // Get the single snapshot for the scenario (each scenario now has only one snapshot)
      const targetSnapshot = targetScenario.snapshot;
      
      // Verify snapshot ID matches
      if (targetSnapshot.id !== targetScenarioId) {
        console.error(`Snapshot ID mismatch: expected ${targetScenarioId}, got ${targetSnapshot.id}`);
        return {
          decision,
          transitioned: false,
          message: `Snapshot ID mismatch: ${targetScenarioId}`
        };
      }

      // Update scene (with checkpoint save)
      await updateCurrentScenarioWithCheckpoint(
        gameStateManager,
        {
          snapshot: targetSnapshot,
          scenarioName: targetScenario.name
        },
        this.db
      );

      console.log(`\n✓ Scene Transition Executed (checkpoint saved)`);
      console.log(`  From: ${gameStateManager.getGameState().visitedScenarios[0]?.name || "Unknown"}`);
      console.log(`  To: ${targetSnapshot.name}`);
      console.log(`  Narrative: ${decision.suggestedTransitionNarrative}`);

      return {
        decision,
        transitioned: true,
        message: `Transitioned to: ${targetSnapshot.name}`,
        newScenario: targetSnapshot
      };

    } catch (error) {
      console.error("Failed to execute scene transition:", error);
      return {
        decision,
        transitioned: false,
        message: `Transition failed: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }

  /**
   * 生成叙事方向指导
   * 基于模块约束、keeper指导、模块笔记、角色输入和行动结果，生成给 Keeper Agent 的叙事方向指导
   */
  async generateNarrativeDirection(
    gameStateManager: GameStateManager,
    characterInput: string,
    actionResults: ActionResult[]
  ): Promise<string> {
    const runtime = createRuntime();
    const gameState = gameStateManager.getGameState();
    
    // 获取模块信息
    const moduleLoader = new ModuleLoader(this.db);
    const modules = moduleLoader.getAllModules();
    const module = modules.length > 0 ? modules[0] : null;
    
    // 获取模板
    const template = getNarrativeDirectionTemplate();
    
    // 准备模板上下文
    const templateContext = {
      moduleLimitations: gameState.moduleLimitations || null,
      keeperGuidance: gameState.keeperGuidance || null,
      moduleNotes: module?.moduleNotes || null,
      characterInput,
      actionResults: actionResults || []
    };
    
    // 使用模板和LLM生成叙事方向指导
    const prompt = composeTemplate(template, {}, templateContext, "handlebars");
    
    try {
      const response = await generateText({
        runtime,
        context: prompt,
        modelClass: ModelClass.SMALL,
      });
      
      // 解析LLM的JSON响应
      let parsedResponse;
      try {
        // 尝试从响应中提取JSON
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[0]);
        } else {
          parsedResponse = JSON.parse(response);
        }
      } catch (error) {
        console.error("Failed to parse narrative direction response as JSON:", error);
        console.error("Raw response:", response);
        // 如果解析失败，返回原始响应（去掉可能的代码块标记）
        return response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      }
      
      return parsedResponse.narrativeDirection || "Generate narrative based on current context while respecting module constraints.";
    } catch (error) {
      console.error("Failed to generate narrative direction:", error);
      return "Generate narrative based on current context while respecting module constraints.";
    }
  }
}

/**
 * 场景切换结果
 */
export interface SceneTransitionResult {
  decision: SceneTransitionDecision;
  transitioned: boolean;
  message: string;
  newScenario?: ScenarioSnapshot;
}

/**
 * 连接场景信息（扩展了 ScenarioSnapshot）
 */
export interface ConnectedSceneInfo extends ScenarioSnapshot {
  connectionType: string;
  connectionDescription: string;
  timeDifferenceHours: number;
}

/**
 * 场景切换决策
 */
export interface SceneTransitionDecision {
  shouldTransition: boolean;
  targetSceneId: string | null;
  reasoning: string;
  urgency: "low" | "medium" | "high";
  transitionType: "immediate" | "gradual" | "player-initiated";
  suggestedTransitionNarrative: string;
}
