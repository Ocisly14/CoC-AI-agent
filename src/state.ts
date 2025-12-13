import type { CharacterProfile } from "./coc_multiagents_system/agents/models/gameTypes.js";
import type { ScenarioSnapshot } from "./coc_multiagents_system/agents/models/scenarioTypes.js";

export type AgentId = "keeper" | "memory" | "action";

export type Phase = "intro" | "investigation" | "confrontation" | "downtime";

export interface ActionAnalysis {
  player: string;
  action: string;
  target: {
    type: "npc" | "object" | "location" | "general";
    name: string | null;
    intent: string;
  };
}

export interface GameState {
  sessionId: string;
  phase: Phase;
  currentScenario: ScenarioSnapshot | null;
  visitedScenarios: ScenarioSnapshot[];
  timeOfDay: string;
  tension: number;
  openThreads: string[];
  discoveredClues: string[];
  playerCharacter: CharacterProfile;
  npcCharacters: CharacterProfile[];
  temporaryInfo: {
    rules: string[];
    ragResults: string[];
    contextualData: Record<string, any>;
    actionResults: ActionResult[];
    currentActionAnalysis: ActionAnalysis | null;
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
  temporaryInfo: {
    rules: [],
    ragResults: [],
    contextualData: {},
    actionResults: [],
    currentActionAnalysis: null,
  },
};

export interface ActionResult {
  timestamp: Date;
  gameTime: string;
  location: string;
  character: string;
  result: string;
  diceRolls: string[];
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
      // Check if this scenario is already in visited list
      const existingIndex = this.gameState.visitedScenarios.findIndex(
        scenario => scenario.id === this.gameState.currentScenario!.id
      );
      
      if (existingIndex === -1) {
        // Add current scenario to visited list
        this.gameState.visitedScenarios.unshift(this.gameState.currentScenario);
        
        // Keep only the most recent 3 visited scenarios
        if (this.gameState.visitedScenarios.length > 3) {
          this.gameState.visitedScenarios = this.gameState.visitedScenarios.slice(0, 3);
        }
      }
    }

    // Set new current scenario
    this.gameState.currentScenario = newScenario;
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
   * Add action result to temporary storage
   */
  addActionResult(actionResult: ActionResult): void {
    if (!actionResult) return;
    this.gameState.temporaryInfo.actionResults.push(actionResult);
    
    // Keep only the most recent 10 action results to avoid memory bloat
    if (this.gameState.temporaryInfo.actionResults.length > 10) {
      this.gameState.temporaryInfo.actionResults = this.gameState.temporaryInfo.actionResults.slice(-10);
    }
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
   * Get current game state (read-only access)
   */
  getGameState(): Readonly<GameState> {
    return this.gameState;
  }
}
