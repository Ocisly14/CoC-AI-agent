import type { CharacterProfile } from "./coc_multiagents_system/agents/models/gameTypes.js";
import type { ScenarioSnapshot } from "./coc_multiagents_system/agents/models/scenarioTypes.js";

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
  player: string;
  action: string;
  actionType: ActionType;
  target: {
    name: string | null;
    intent: string;
  };
  requiresDice: boolean;  // Whether dice roll is required
}

export interface VisitedScenarioBasic {
  id: string;
  scenarioId: string;
  name: string;
  location: string;
  timePoint: {
    timestamp: string;
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
  },
};

export type TimeConsumption = "instant" | "short" | "scene";

export interface DirectorDecision {
  shouldProgress: boolean;
  targetSnapshotId?: string;  // 要推进到的具体场景快照ID
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
        playerTime.lastActionTime = timeConsumption;
        break;
    }
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
   * Update current scenario based on player actions
   */
  updateScenarioState(scenarioUpdates: any): void {
    if (!scenarioUpdates || !this.gameState.currentScenario) return;

    // Update scenario description if provided
    if (scenarioUpdates.description) {
      this.gameState.currentScenario.description = scenarioUpdates.description;
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
   * Add permanent change to the scenario
   */
  addPermanentScenarioChange(changeDescription: string): void {
    if (!this.gameState.currentScenario || !changeDescription) return;
    
    // Initialize permanentChanges array if it doesn't exist
    if (!this.gameState.currentScenario.permanentChanges) {
      this.gameState.currentScenario.permanentChanges = [];
    }
    
    // Add the permanent change to current snapshot (which references the scenario-level changes)
    this.gameState.currentScenario.permanentChanges.push(changeDescription);
  }

  /**
   * Get current game state (read-only access)
   */
  getGameState(): Readonly<GameState> {
    return this.gameState;
  }
}
