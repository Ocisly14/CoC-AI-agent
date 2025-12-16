import type { CharacterProfile } from "./coc_multiagents_system/agents/models/gameTypes.js";
import type { ScenarioSnapshot } from "./coc_multiagents_system/agents/models/scenarioTypes.js";
import { actionRules } from "./coc_multiagents_system/rules/index.js";

export type AgentId = "keeper" | "memory" | "action";

export type Phase = "intro" | "investigation" | "confrontation" | "downtime";

export type ActionType = 
  | "exploration"      // Discovering clues, understanding environment, gathering information
  | "social"          // Influencing NPCs, gathering intelligence, reaching consensus
  | "stealth"         // Acting without being detected
  | "combat"          // Causing damage, subduing or stopping opponents
  | "chase"           // Extending or closing distance
  | "mental"          // Withstanding or resisting psychological shock
  | "environmental"   // Confronting environment and physiological limits
  | "narrative";      // Making key choices

export interface ActionAnalysis {
  character: string;
  action: string;
  actionType: ActionType;
  target: {
    name: string | null;
    intent: string;
  };
  requiresDice: boolean;  // Whether dice roll is required
}

export interface SceneChangeRequest {
  shouldChange: boolean;        // 是否需要切换场景
  targetSceneName: string | null;  // 目标场景名称（LLM生成）
  reason: string;               // 切换原因说明
  timestamp: Date;              // 请求时间
}

export interface SceneTransitionRejection {
  wasRequested: boolean;        // 是否有场景转换请求被拒绝
  reasoning: string;            // Director 拒绝的理由
  timestamp: Date;              // 拒绝时间
}

export interface VisitedScenarioBasic {
  id: string;
  scenarioId: string;
  name: string;
  location: string;
  timePoint: {
    absoluteTime: string;
    gameDay: number;
    timeOfDay: "dawn" | "morning" | "noon" | "afternoon" | "evening" | "night" | "midnight" | "unknown";
    notes?: string;
  };
}

export interface GameState {
  sessionId: string;
  phase: Phase;
  currentScenario: ScenarioSnapshot | null;
  visitedScenarios: VisitedScenarioBasic[];
  timeOfDay: string;
  tension: number;
  openThreads: string[];
  discoveredClues: string[];
  playerCharacter: CharacterProfile;
  npcCharacters: CharacterProfile[];
  scenarioTimeState: {
    sceneStartTime: string;     // 场景开始时的游戏时间
    playerTimeConsumption: Record<string, {  // 各玩家的时间消耗记录
      totalShortActions: number;             // 该玩家在当前场景的短期行动次数
      lastActionTime: string;                // 该玩家最后一次行动的时间消耗类型
    }>;
  };
  temporaryInfo: {
    rules: string[];
    ragResults: string[];
    contextualData: Record<string, any>;
    actionResults: ActionResult[];
    currentActionAnalysis: ActionAnalysis | null;
    directorDecision: DirectorDecision | null;
    sceneChangeRequest: SceneChangeRequest | null;
    transition: boolean;  // Indicates if a scene change just occurred
    sceneTransitionRejection: SceneTransitionRejection | null;  // Director rejected scene transition
  };
}

const defaultPlayerCharacter: CharacterProfile = {
  id: "investigator-1",
  name: "Investigator",
  attributes: {
    STR: 50,
    CON: 50,
    DEX: 50,
    APP: 50,
    POW: 50,
    SIZ: 50,
    INT: 50,
    EDU: 50,
  },
  status: {
    hp: 10,
    maxHp: 10,
    sanity: 60,
    maxSanity: 99,
    luck: 50,
    mp: 10,
    conditions: [],
  },
  inventory: [],
  skills: {
    "Spot Hidden": 25,
    Listen: 20,
    "Library Use": 20,
    "Fighting (Brawl)": 25,
    Dodge: 25,
    "Firearms (Handgun)": 20,
  },
  notes: "Auto-generated placeholder character",
  actionLog: [],
};


export const initialGameState: GameState = {
  sessionId: "session-local",
  phase: "intro",
  currentScenario: null,
  visitedScenarios: [],
  timeOfDay: "Evening",
  tension: 1,
  openThreads: [],
  discoveredClues: [],
  playerCharacter: defaultPlayerCharacter,
  npcCharacters: [],
  scenarioTimeState: {
    sceneStartTime: "Evening",
    playerTimeConsumption: {},
  },
  temporaryInfo: {
    rules: [],
    ragResults: [],
    contextualData: {},
    actionResults: [],
    currentActionAnalysis: null,
    directorDecision: null,
    sceneChangeRequest: null,
    transition: false,
    sceneTransitionRejection: null,
  },
};

export type TimeConsumption = "instant" | "short" | "scene";

export interface DirectorDecision {
  shouldProgress: boolean;
  targetSnapshotId?: string;  // 要推进到的具体场景快照ID
  estimatedShortActions?: number | null; // 估计在目标场景可执行的短行动数量
  increaseShortActionCapBy?: number | null; // 当不推进时，增加当前场景短行动上限
  reasoning: string;          // 推进的原因说明
  timestamp: Date;            // 决策时间
}

export interface ActionResult {
  timestamp: Date;
  gameTime: string;
  location: string;
  character: string;
  result: string;
  diceRolls: string[];
  timeConsumption: TimeConsumption;  // 该行动消耗的时间类型
  scenarioChanges?: string[]; // List of permanent changes made to the scenario
}

export interface AgentResult {
  agentId: AgentId;
  content: string;
  timestamp: Date;
  metadata?: any;
}

export interface AgentState {
  userQuery: string;
  orchestrator: {
    nextAgent?: AgentId;
    routingNotes?: string;
    isCompleted: boolean;
  };
  memory: {
    status: "idle" | "processing" | "completed" | "failed";
    retrievedData?: string[];
    errorMessage?: string;
  };
  action: {
    status: "idle" | "processing" | "completed" | "failed";
    pendingActions?: string[];
    executedActions?: string[];
    errorMessage?: string;
  };
}

/**
 * GameState Manager - Provides methods to update GameState
 */
export class GameStateManager {
  private gameState: GameState;

  constructor(gameState: GameState) {
    this.gameState = gameState;
  }

  /**
   * Update or add NPCs to the game state (adds all NPCs without filtering)
   */
  updateNpcs(npcData: CharacterProfile[]): void {
    if (!npcData || npcData.length === 0) return;

    for (const newNpc of npcData) {
      const existingIndex = this.gameState.npcCharacters.findIndex(
        npc => npc.id === newNpc.id
      );
      
      if (existingIndex >= 0) {
        // Update existing NPC
        this.gameState.npcCharacters[existingIndex] = newNpc;
      } else {
        // Add new NPC
        this.gameState.npcCharacters.push(newNpc);
      }
    }
  }

  /**
   * Update current scenario and manage visited scenarios history
   */
  updateCurrentScenario(scenarioData: { snapshot: ScenarioSnapshot; scenarioName: string } | null): void {
    if (!scenarioData) return;

    const newScenario = scenarioData.snapshot;
    
    // If we already have a current scenario, move it to visited scenarios
    if (this.gameState.currentScenario) {
      this.addVisitedScenario(this.gameState.currentScenario);
    }

    // Set new current scenario
    this.gameState.currentScenario = newScenario;
    
    // Reset time consumption state for any scenario update (location change OR time progression)
    this.resetScenarioTimeState();
    
    // Reset progression monitor on scenario change
    if (this.progressionMonitor) {
      this.progressionMonitor.resetOnScenarioChange();
    }
  }

  /**
   * Add a scenario snapshot to the visited list while keeping the list bounded
   */
  addVisitedScenario(scenario: ScenarioSnapshot): void {
    // Check if this scenario is already in visited list
    const existingIndex = this.gameState.visitedScenarios.findIndex(
      visited => visited.id === scenario.id
    );
    
    if (existingIndex === -1) {
      // Extract only basic information for visited scenarios
      const basicScenario: VisitedScenarioBasic = {
        id: scenario.id,
        scenarioId: scenario.scenarioId,
        name: scenario.name,
        location: scenario.location,
        timePoint: scenario.timePoint
      };
      
      // Add scenario to visited list
      this.gameState.visitedScenarios.unshift(basicScenario);
      
      // Keep only the most recent 3 visited scenarios
      if (this.gameState.visitedScenarios.length > 3) {
        this.gameState.visitedScenarios = this.gameState.visitedScenarios.slice(0, 3);
      }
    }
  }

  /**
   * Add temporary rules to game state
   */
  addTemporaryRules(ruleData: { rules: any[]; count: number }): void {
    if (!ruleData || !ruleData.rules || ruleData.rules.length === 0) return;

    for (const rule of ruleData.rules) {
      const ruleText = `${rule.title}: ${rule.description}`;
      if (!this.gameState.temporaryInfo.rules.includes(ruleText)) {
        this.gameState.temporaryInfo.rules.push(ruleText);
      }
    }
  }

  /**
   * Apply state updates from action agent results
   */
  applyActionUpdate(stateUpdate: any): void {
    if (!stateUpdate) return;

    // Update player character
    if (stateUpdate.playerCharacter) {
      this.updateCharacter(this.gameState.playerCharacter, stateUpdate.playerCharacter);
    }

    // Update NPC characters
    if (stateUpdate.npcCharacters && Array.isArray(stateUpdate.npcCharacters)) {
      for (const npcUpdate of stateUpdate.npcCharacters) {
        const existingNpc = this.gameState.npcCharacters.find(npc => npc.id === npcUpdate.id);
        if (existingNpc) {
          this.updateCharacter(existingNpc, npcUpdate);
        }
      }
    }
  }

  /**
   * Update individual character data
   */
  private updateCharacter(character: any, updates: any): void {
    // Update character name if provided
    if (updates.name) {
      character.name = updates.name;
    }
    
    // Update status values (hp, sanity, mp, etc.)
    if (updates.status) {
      for (const [key, value] of Object.entries(updates.status)) {
        if (typeof value === 'number' && key in character.status) {
          // Apply differential update (e.g., hp: -2 means subtract 2)
          character.status[key] += value;
          
          // Ensure values don't go below 0
          if (character.status[key] < 0) {
            character.status[key] = 0;
          }
        }
      }
    }
    
    // Update attributes if provided
    if (updates.attributes) {
      for (const [key, value] of Object.entries(updates.attributes)) {
        if (typeof value === 'number' && key in character.attributes) {
          character.attributes[key] += value;
        }
      }
    }
    
    // Update skills if provided
    if (updates.skills) {
      for (const [skillName, value] of Object.entries(updates.skills)) {
        if (typeof value === 'number') {
          if (skillName in character.skills) {
            character.skills[skillName] += value;
          } else {
            character.skills[skillName] = value;
          }
        }
      }
    }
  }

  /**
   * Add action result to temporary storage and update player time consumption
   */
  addActionResult(actionResult: ActionResult): void {
    if (!actionResult) return;
    
    // Update player time consumption
    this.updatePlayerTimeConsumption(actionResult.character, actionResult.timeConsumption);
    
    this.gameState.temporaryInfo.actionResults.push(actionResult);
    
    // Keep only the most recent 10 action results to avoid memory bloat
    if (this.gameState.temporaryInfo.actionResults.length > 10) {
      this.gameState.temporaryInfo.actionResults = this.gameState.temporaryInfo.actionResults.slice(-10);
    }

    // Trigger progression monitoring check after adding action
    this.checkProgressionTriggers(actionResult);
  }

  /**
   * Check if progression monitoring should trigger Director Agent
   */
  private checkProgressionTriggers(actionResult: ActionResult): void {
    // This will be implemented by the system using this GameStateManager
    // The actual monitoring logic is in ProgressionMonitor class
    if (this.progressionMonitor) {
      this.progressionMonitor.updateAfterAction(actionResult);
      
      if (this.progressionMonitor.shouldTriggerDirector()) {
        this.triggerDirectorAgent();
      }
    }
  }

  private progressionMonitor: any = null; // Will be set externally

  /**
   * Set the progression monitor instance
   */
  setProgressionMonitor(monitor: any): void {
    this.progressionMonitor = monitor;
  }

  /**
   * Trigger Director Agent (to be implemented by system)
   */
  private triggerDirectorAgent(): void {
    // This method will be overridden or handled by the main system
    console.log("GameStateManager: Director Agent trigger conditions met - should activate Director Agent");
  }

  /**
   * Update player time consumption tracking
   */
  private updatePlayerTimeConsumption(playerName: string, timeConsumption: TimeConsumption): void {
    // Initialize player record if doesn't exist
    if (!this.gameState.scenarioTimeState.playerTimeConsumption[playerName]) {
      this.gameState.scenarioTimeState.playerTimeConsumption[playerName] = {
        totalShortActions: 0,
        lastActionTime: timeConsumption
      };
    }

    const playerTime = this.gameState.scenarioTimeState.playerTimeConsumption[playerName];
    const shortActionCap = this.getScenarioShortActionCap();
    
    // Update based on time consumption type
    switch (timeConsumption) {
      case "instant":
        // Instant actions don't affect time tracking
        playerTime.lastActionTime = timeConsumption;
        break;
        
      case "short":
        // Track short actions count
        playerTime.totalShortActions += 1;
        playerTime.lastActionTime = timeConsumption;
        break;
        
      case "scene":
        // Scene actions are significant time consumers
        // Scene action counts as reaching the short-action cap for this scenario
        playerTime.totalShortActions = Math.max(playerTime.totalShortActions, shortActionCap);
        playerTime.lastActionTime = timeConsumption;
        break;
    }
  }

  /**
   * Short action cap for the current scenario; default to 3 if undefined
   */
  private getScenarioShortActionCap(): number {
    return this.gameState.currentScenario?.estimatedShortActions || 3;
  }

  /**
   * Get player's short action count in current scenario
   */
  getPlayerShortActions(playerName: string): number {
    const playerTime = this.gameState.scenarioTimeState.playerTimeConsumption[playerName];
    return playerTime ? playerTime.totalShortActions : 0;
  }

  /**
   * Get player's last action time consumption
   */
  getPlayerLastActionTime(playerName: string): TimeConsumption | null {
    const playerTime = this.gameState.scenarioTimeState.playerTimeConsumption[playerName];
    return playerTime ? playerTime.lastActionTime as TimeConsumption : null;
  }

  /**
   * Reset time consumption for new scenario (called when scenario changes)
   */
  resetScenarioTimeState(): void {
    this.gameState.scenarioTimeState.playerTimeConsumption = {};
    this.gameState.scenarioTimeState.sceneStartTime = this.gameState.timeOfDay;
  }

  /**
   * Clear all action results
   */
  clearActionResults(): void {
    this.gameState.temporaryInfo.actionResults = [];
  }

  /**
   * Set current action analysis from orchestrator
   */
  setActionAnalysis(actionAnalysis: ActionAnalysis | null): void {
    this.gameState.temporaryInfo.currentActionAnalysis = actionAnalysis;
  }

  /**
   * Clear current action analysis
   */
  clearActionAnalysis(): void {
    this.gameState.temporaryInfo.currentActionAnalysis = null;
  }

  /**
   * Set director decision from director agent
   */
  setDirectorDecision(decision: DirectorDecision): void {
    this.gameState.temporaryInfo.directorDecision = decision;
  }

  /**
   * Clear director decision
   */
  clearDirectorDecision(): void {
    this.gameState.temporaryInfo.directorDecision = null;
  }

  /**
   * Set scene change request from action agent
   */
  setSceneChangeRequest(request: SceneChangeRequest | null): void {
    this.gameState.temporaryInfo.sceneChangeRequest = request;
  }

  /**
   * Clear scene change request
   */
  clearSceneChangeRequest(): void {
    this.gameState.temporaryInfo.sceneChangeRequest = null;
  }

  /**
   * Set transition flag to indicate a scene change has occurred
   */
  setTransitionFlag(isTransition: boolean): void {
    this.gameState.temporaryInfo.transition = isTransition;
  }

  /**
   * Clear transition flag
   */
  clearTransitionFlag(): void {
    this.gameState.temporaryInfo.transition = false;
  }

  /**
   * Set scene transition rejection info (when Director denies player's transition request)
   */
  setSceneTransitionRejection(reasoning: string): void {
    this.gameState.temporaryInfo.sceneTransitionRejection = {
      wasRequested: true,
      reasoning,
      timestamp: new Date()
    };
  }

  /**
   * Clear scene transition rejection
   */
  clearSceneTransitionRejection(): void {
    this.gameState.temporaryInfo.sceneTransitionRejection = null;
  }

  /**
   * Update current scenario based on player actions
   */
  updateScenarioState(scenarioUpdates: any): void {
    if (!scenarioUpdates || !this.gameState.currentScenario) return;

    // Update scenario description if provided
    if (scenarioUpdates.description) {
      // Record description change as a permanent scenario change so it persists across snapshots
      const descriptionChange = `Scene description updated: ${scenarioUpdates.description}`;
      this.addPermanentScenarioChange(descriptionChange);
    }

    // Update environmental conditions
    if (scenarioUpdates.conditions && Array.isArray(scenarioUpdates.conditions)) {
      for (const newCondition of scenarioUpdates.conditions) {
        const existingIndex = this.gameState.currentScenario.conditions.findIndex(
          condition => condition.type === newCondition.type
        );
        
        if (existingIndex >= 0) {
          // Update existing condition
          this.gameState.currentScenario.conditions[existingIndex] = newCondition;
        } else {
          // Add new condition
          this.gameState.currentScenario.conditions.push(newCondition);
        }
      }
    }

    // Add new events
    if (scenarioUpdates.events && Array.isArray(scenarioUpdates.events)) {
      this.gameState.currentScenario.events.push(...scenarioUpdates.events);
    }

    // Update exits/entrances
    if (scenarioUpdates.exits && Array.isArray(scenarioUpdates.exits)) {
      for (const exitUpdate of scenarioUpdates.exits) {
        if (!this.gameState.currentScenario.exits) {
          this.gameState.currentScenario.exits = [];
        }
        
        const existingIndex = this.gameState.currentScenario.exits.findIndex(
          exit => exit.direction === exitUpdate.direction
        );
        
        if (existingIndex >= 0) {
          // Update existing exit
          this.gameState.currentScenario.exits[existingIndex] = exitUpdate;
        } else {
          // Add new exit
          this.gameState.currentScenario.exits.push(exitUpdate);
        }
      }
    }

    // Update clue states
    if (scenarioUpdates.clues && Array.isArray(scenarioUpdates.clues)) {
      for (const clueUpdate of scenarioUpdates.clues) {
        const existingIndex = this.gameState.currentScenario.clues.findIndex(
          clue => clue.id === clueUpdate.id
        );
        
        if (existingIndex >= 0) {
          // Update existing clue
          this.gameState.currentScenario.clues[existingIndex] = {
            ...this.gameState.currentScenario.clues[existingIndex],
            ...clueUpdate
          };
        } else if (clueUpdate.id) {
          // Add new clue
          this.gameState.currentScenario.clues.push(clueUpdate);
        }
      }
    }
  }

  /**
   * Add permanent change to the scenario (scenario-level, shared across all timeline snapshots)
   * 
   * Note: Permanent changes are stored at the scenario level (not snapshot level).
   * - In memory: temporarily stored in currentScenario.permanentChanges
   * - On checkpoint: saved to the scenarios table and shared by all timeline snapshots
   * - On load: all snapshots of the same scenario will receive the same permanent changes
   */
  addPermanentScenarioChange(changeDescription: string): void {
    if (!this.gameState.currentScenario || !changeDescription) return;
    
    // Initialize permanentChanges array if it doesn't exist
    if (!this.gameState.currentScenario.permanentChanges) {
      this.gameState.currentScenario.permanentChanges = [];
    }
    
    // Add the permanent change to current snapshot's array (which represents scenario-level changes)
    // These changes will be persisted to the scenario level when checkpoint is created
    this.gameState.currentScenario.permanentChanges.push(changeDescription);
  }

  /**
   * Get current game state (read-only access)
   */
  getGameState(): Readonly<GameState> {
    return this.gameState;
  }
}
