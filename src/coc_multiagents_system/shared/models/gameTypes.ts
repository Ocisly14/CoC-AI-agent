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
    level: 'critical' | 'extreme' | 'hard' | 'regular' | 'failure' | 'fumble';
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
    category: 'combat' | 'investigation' | 'social' | 'physical' | 'knowledge';
    uncommon: boolean;
    examples?: string[];
}

/**
 * Difficulty Modifiers
 */
export type Difficulty = 'regular' | 'hard' | 'extreme';

/**
 * Combat Action Types
 */
export enum CombatActionType {
    ATTACK = 'attack',
    DODGE = 'dodge',
    FIGHT_BACK = 'fight_back',
    FLEE = 'flee',
    AIM = 'aim',
    RELOAD = 'reload'
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
    SKILLS = 'skills',
    COMBAT = 'combat',
    SANITY = 'sanity',
    MAGIC = 'magic',
    CHARACTER = 'character',
    EQUIPMENT = 'equipment',
    CHASE = 'chase',
    GENERAL = 'general'
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
