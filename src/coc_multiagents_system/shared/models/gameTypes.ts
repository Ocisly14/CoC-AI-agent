/**
 * Game Type Definitions
 * Shared types for CoC 7e game mechanics, rules, and data structures
 */

/**
 * Skill Check Result
 */
export interface SkillCheckResult {
  success: boolean;
  roll: number;
  target: number;
  level: "critical" | "extreme" | "hard" | "regular" | "failure" | "fumble";
  description: string;
  skillName: string;
}

/**
 * Skill Definition
 */
export interface Skill {
  name: string;
  baseValue: number;
  description: string;
  category: "combat" | "investigation" | "social" | "physical" | "knowledge";
  uncommon: boolean;
  examples?: string[];
}

/**
 * Difficulty Modifiers
 */
export type Difficulty = "regular" | "hard" | "extreme";

/**
 * Combat Action Types
 */
export enum CombatActionType {
  ATTACK = "attack",
  DODGE = "dodge",
  FIGHT_BACK = "fight_back",
  FLEE = "flee",
  AIM = "aim",
  RELOAD = "reload",
}

/**
 * Combat Action
 */
export interface CombatAction {
  attackerId: string;
  defenderId?: string;
  actionType: CombatActionType;
  weaponUsed?: string;
  modifiers?: number;
}

/**
 * Combat Result
 */
export interface CombatResult {
  success: boolean;
  damage?: number;
  damageRoll?: string;
  location?: string; // hit location
  effect?: string;
  narrative: string;
  rollResult: SkillCheckResult;
}

/**
 * Sanity Check
 */
export interface SanityCheck {
  characterId: string;
  trigger: string;
  sanityLoss: string; // e.g., "0/1d3" or "1d10/1d100"
  currentSanity: number;
}

/**
 * Sanity Loss Result
 */
export interface SanityLossResult {
  loss: number;
  roll: number;
  newSanity: number;
  temporaryInsanity: boolean;
  indefiniteInsanity: boolean;
  permanentInsanity: boolean;
  effect?: string;
  description: string;
}

/**
 * Rule Entry
 */
export interface RuleEntry {
  id: string;
  category: RuleCategory;
  title: string;
  description: string;
  mechanics?: string;
  examples?: string[];
  relatedRules?: string[]; // IDs of related rules
  tags?: string[];
}

/**
 * Rule Categories
 */
export enum RuleCategory {
  SKILLS = "skills",
  COMBAT = "combat",
  SANITY = "sanity",
  MAGIC = "magic",
  CHARACTER = "character",
  EQUIPMENT = "equipment",
  CHASE = "chase",
  GENERAL = "general",
}

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

/**
 * Damage Roll Result
 */
export interface DamageResult {
  total: number;
  rolls: number[];
  formula: string;
  bonus?: number;
}

/**
 * Status Effect
 */
export interface StatusEffect {
  name: string;
  description: string;
  duration: number; // rounds or -1 for indefinite
  mechanical_effect: string;
  stackable: boolean;
}

/**
 * Rule Query
 */
export interface RuleQuery {
  category?: RuleCategory;
  keywords?: string[];
  skillName?: string;
  tags?: string[];
}

/**
 * Rule Lookup Result
 */
export interface RuleLookupResult {
  rules: RuleEntry[];
  count: number;
  relevanceScores?: number[];
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
  [key: string]: number | string[] | string | undefined;
}

export interface CharacterProfile {
  id: string;
  name: string;
  attributes: CharacterAttributes;
  status: CharacterStatus;
  inventory: string[];
  skills: Record<string, number>;
  notes?: string;
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
}
