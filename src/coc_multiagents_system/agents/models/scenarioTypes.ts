/**
 * Scenario Type Definitions
 * Data structures for scenario management and timeline tracking
 */

/**
 * Time point for scenario events
 */
export interface ScenarioTimePoint {
  /** ISO date string or descriptive time (e.g., "1925-03-15", "Dawn", "Night 3") */
  timestamp: string;
  /** Additional notes about this time point */
  notes?: string;
}

/**
 * Character presence in a scenario
 */
export interface ScenarioCharacter {
  /** Character ID or name */
  id: string;
  name: string;
  /** Role in this scenario (protagonist, witness, victim, etc.) */
  role: string;
  /** Character's status at this time (alive, missing, unconscious, etc.) */
  status: string;
  /** Current location */
  location?: string;
  /** Notes about character in this scenario */
  notes?: string;
}

/**
 * Clue available in a scenario
 */
export interface ScenarioClue {
  id: string;
  /** The clue text or description */
  clueText: string;
  /** Category of clue */
  category: "physical" | "witness" | "document" | "environment" | "knowledge" | "observation";
  /** How obvious/difficult to find */
  difficulty: "automatic" | "regular" | "hard" | "extreme";
  /** Location where this clue can be found */
  location: string;
  /** Required skill or method to discover */
  discoveryMethod?: string;
  /** What this clue reveals or points to */
  reveals?: string[];
  /** Whether this clue has been discovered */
  discovered: boolean;
  /** Who discovered it and when */
  discoveryDetails?: {
    discoveredBy: string;
    discoveredAt: string;
    method: string;
  };
}

/**
 * Environmental condition or atmospheric detail
 */
export interface ScenarioCondition {
  /** Type of condition (weather, lighting, sound, smell, etc.) */
  type: "weather" | "lighting" | "sound" | "smell" | "temperature" | "other";
  /** Description of the condition */
  description: string;
  /** Mechanical effect if any */
  mechanicalEffect?: string;
}

/**
 * Single scenario state at a specific time point
 */
export interface ScenarioSnapshot {
  id: string;
  /** Reference to the parent scenario */
  scenarioId: string;
  /** Time information */
  timePoint: ScenarioTimePoint;
  /** Scenario name at this time */
  name: string;
  /** Primary location */
  location: string;
  /** Detailed description */
  description: string;
  /** Characters present */
  characters: ScenarioCharacter[];
  /** Available clues */
  clues: ScenarioClue[];
  /** Environmental conditions */
  conditions: ScenarioCondition[];
  /** Notable events at this time */
  events: string[];
  /** Exits and connections to other locations */
  exits?: {
    direction: string;
    destination: string;
    description?: string;
    condition?: string; // e.g., "locked", "hidden"
  }[];
  /** Reference to permanent changes from the parent scenario */
  permanentChanges?: string[];
  /** Keeper notes for this snapshot */
  keeperNotes?: string;
  /** Estimated short actions the scene can accommodate (runtime-only, set by Director) */
  estimatedShortActions?: number;
}

/**
 * Complete scenario with timeline
 */
export interface ScenarioProfile {
  id: string;
  /** Overall scenario name */
  name: string;
  /** Overall description */
  description: string;
  /** All timeline snapshots */
  timeline: ScenarioSnapshot[];
  /** Scenario tags for organization */
  tags: string[];
  /** Related scenarios */
  connections?: {
    scenarioId: string;
    relationshipType: "leads_to" | "concurrent" | "prerequisite" | "alternate";
    description?: string;
  }[];
  /** Permanent changes made to the scenario */
  permanentChanges?: string[];
  /** Scenario metadata */
  metadata: {
    createdAt: string;
    updatedAt: string;
    source?: string; // document filename
    author?: string;
    gameSystem: string; // "CoC 7e"
  };
}

/**
 * Raw parsed scenario data from documents
 */
export interface ParsedScenarioData {
  name: string;
  description: string;
  timeline: {
    timePoint: {
      timestamp: string;
      notes?: string;
    };
    name?: string;
    location: string;
    description: string;
    characters?: {
      name: string;
      role?: string;
      status?: string;
      location?: string;
      notes?: string;
    }[];
    clues?: {
      clueText: string;
      category?: string;
      difficulty?: string;
      location?: string;
      discoveryMethod?: string;
      reveals?: string[];
    }[];
    conditions?: {
      type?: string;
      description: string;
      mechanicalEffect?: string;
    }[];
    events?: string[];
    exits?: {
      direction: string;
      destination: string;
      description?: string;
      condition?: string;
    }[];
    keeperNotes?: string;
  }[];
  tags?: string[];
  connections?: {
    scenarioName: string;
    relationshipType: string;
    description?: string;
  }[];
}

/**
 * Scenario search query
 */
export interface ScenarioQuery {
  name?: string;
  timeRange?: {
    start: string;
    end: string;
  };
  location?: string;
  charactersInvolved?: string[];
  tags?: string[];
  hasClues?: boolean;
}

/**
 * Scenario search result
 */
export interface ScenarioSearchResult {
  scenarios: ScenarioProfile[];
  snapshots: ScenarioSnapshot[];
  totalCount: number;
  relevanceScores?: number[];
}
