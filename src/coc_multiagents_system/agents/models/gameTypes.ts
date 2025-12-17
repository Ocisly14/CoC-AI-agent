/**
 * Difficulty Modifiers
 */
export type Difficulty = "regular" | "hard" | "extreme";

/**
 * Weapon Data
 */
export interface WeaponData {
  name: string;
  skill: string;
  damage: string;
  range: string;
  attacksPerRound: number;
  ammo?: number;
  malfunction?: number;
  era?: string;
}

export interface Skill {
  name: string;
  baseValue: number;
  description: string;
  category: string;
  uncommon: boolean;
  examples?: string[];
}

/**
 * Character Attributes and Status
 */
export interface CharacterAttributes {
  STR: number;
  CON: number;
  DEX: number;
  APP: number;
  POW: number;
  SIZ: number;
  INT: number;
  EDU: number;
  [key: string]: number;
}

export interface CharacterStatus {
  hp: number;
  maxHp: number;
  sanity: number;
  maxSanity: number;
  luck: number;
  mp?: number;
  conditions: string[];
  notes?: string;
  /**
   * Damage bonus (e.g., "0", "+1d4", "+1d6", "-1d4")
   */
  damageBonus?: string;
  /**
   * Build value derived from STR+SIZ (e.g., -2, -1, 0, 1, 2, ...)
   */
  build?: number;
  /**
   * Movement rate
   */
  mov?: number;
  [key: string]: number | string[] | string | undefined;
}

export interface ActionLogEntry {
  time: string;
  summary: string;
}

export interface CharacterProfile {
  id: string;
  name: string;
  attributes: CharacterAttributes;
  status: CharacterStatus;
  inventory: string[];
  skills: Record<string, number>;
  notes?: string;
  actionLog?: ActionLogEntry[];
}

/**
 * NPC Clue - Information that the NPC knows or can reveal
 */
export interface NPCClue {
  id: string;
  clueText: string;
  category?: "knowledge" | "observation" | "rumor" | "secret";
  difficulty?: Difficulty; // difficulty to extract this clue
  revealed: boolean;
  relatedTo?: string[]; // related character or location IDs
}

/**
 * NPC Relationship - Connection between NPCs or PC and NPC
 */
export interface NPCRelationship {
  targetId: string; // ID of the related character
  targetName: string;
  relationshipType:
    | "ally"
    | "enemy"
    | "neutral"
    | "family"
    | "friend"
    | "rival"
    | "employer"
    | "employee"
    | "stranger";
  attitude: number; // -100 to 100, negative is hostile, positive is friendly
  description?: string;
  history?: string; // backstory of this relationship
}

/**
 * NPC Profile - Extended character profile with NPC-specific data
 */
export interface NPCProfile extends CharacterProfile {
  occupation?: string;
  age?: number;
  appearance?: string;
  personality?: string;
  background?: string;
  goals?: string[];
  secrets?: string[];
  clues: NPCClue[];
  relationships: NPCRelationship[];
  isNPC: true; // flag to distinguish from player characters
  currentLocation?: string; // NPC的当前地点
}

/**
 * Parsed NPC data from document
 */
export interface ParsedNPCData {
  name: string;
  occupation?: string;
  age?: number;
  appearance?: string;
  personality?: string;
  background?: string;
  goals?: string[];
  secrets?: string[];
  attributes?: Partial<CharacterAttributes>;
  status?: Partial<CharacterStatus>;
  skills?: Record<string, number>;
  inventory?: string[];
  clues?: Omit<NPCClue, "id" | "revealed">[];
  relationships?: Omit<NPCRelationship, "targetId">[];
  notes?: string;
  currentLocation?: string; // NPC的当前地点
}
