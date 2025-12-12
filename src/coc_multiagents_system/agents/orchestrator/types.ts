/**
 * Orchestrator Agent Type Definitions
 */

/**
 * Player Character
 */
export interface PlayerCharacter {
  id: string;
  name: string;
  occupation: string;
  age: number;

  // Characteristics
  STR: number;
  CON: number;
  SIZ: number;
  DEX: number;
  APP: number;
  INT: number;
  POW: number;
  EDU: number;

  // Derived attributes
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  sanity: number;
  maxSanity: number;
  luck: number;

  // Skills
  skills: Record<string, number>;

  // Inventory
  inventory: string[];
  weapons: Weapon[];

  // Status
  injuries: string[];
  conditions: string[];

  // Background
  backstory: string;
  connections: string[];
}

/**
 * Non-Player Character
 */
export interface NonPlayerCharacter {
  id: string;
  name: string;
  description: string;
  personality: string;
  occupation: string;
  secrets: string[];
  knowledge: Record<string, string>;
  relationshipToPcs: Record<string, number>;
  currentEmotion: string;
  location: string;
}

/**
 * Weapon
 */
export interface Weapon {
  name: string;
  damage: string;
  range: string;
  attacksPerRound: number;
  ammo?: number;
  malfunction?: number;
}

/**
 * Threat
 */
export interface Threat {
  id: string;
  name: string;
  type: "creature" | "cultist" | "environmental" | "psychological";
  description: string;
  dangerLevel: number; // 1-10
  location?: string;
  active: boolean;
  stats?: Record<string, any>;
}

/**
 * Clue
 */
export interface Clue {
  id: string;
  description: string;
  discovered: boolean;
  discoveredBy?: string;
  discoveredAt?: Date;
  relatedTo: string[]; // IDs of related mysteries/threads
  importance: number; // 1-10
  location?: string;
}

/**
 * Game Event
 */
export interface GameEvent {
  id: string;
  timestamp: Date;
  type: "narration" | "action" | "roll" | "combat" | "dialogue" | "discovery";
  actor?: string; // character ID
  description: string;
  data?: Record<string, any>;
}

/**
 * Game State
 */
export interface GameState {
  sceneId: string;
  phase: "intro" | "investigation" | "confrontation" | "downtime";
  location: string;
  timeOfDay: string;
  pcs: Record<string, PlayerCharacter>;
  npcs: Record<string, NonPlayerCharacter>;
  threats: Threat[];
  clues: Clue[];
  openThreads: string[];
  log: GameEvent[];
}

/**
 * Player Input
 */
export interface PlayerInput {
  playerId: string;
  text: string;
  timestamp: Date;
}

/**
 * Player Intent
 */
export interface PlayerIntent {
  type: "action" | "dialogue" | "investigation" | "meta";
  skill?: string;
  target?: string;
  difficulty?: "regular" | "hard" | "extreme";
  requiresSkillCheck: boolean;
  targetClue?: string;
  rawInput: string;
}

/**
 * Orchestrator Response
 */
export interface OrchestratorResponse {
  narration?: string;
  rollResult?: any;
  revelation?: string;
  npcDialogue?: string;
  stateChanges?: Partial<GameState>;
  timestamp: Date;
}

/**
 * Agent Message
 */
export interface AgentMessage {
  from: "orchestrator" | "rule" | "character" | "keeper" | "memory";
  to: "orchestrator" | "rule" | "character" | "keeper" | "memory";
  type: string;
  payload: any;
  timestamp: Date;
}
