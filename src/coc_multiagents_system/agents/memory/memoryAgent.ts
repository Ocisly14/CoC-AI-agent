/**
 * Unified Memory Agent with SQLite Database
 * Session historian, context manager, and rules database
 * Combines game history tracking with CoC 7e rules reference
 */

import type Database from "better-sqlite3";
type DBInstance = InstanceType<typeof Database>;
import type { CoCDatabase } from "./database/schema.js";
import type {
  DamageResult,
  Difficulty,
  RuleEntry,
  RuleLookupResult,
  RuleQuery,
  SanityCheck,
  SanityLossResult,
  Skill,
  SkillCheckResult,
  WeaponData,
} from "../models/gameTypes.js";

export type EventType =
  | "narration"
  | "action"
  | "roll"
  | "combat"
  | "dialogue"
  | "discovery"
  | "sanity"
  | "relationship";

export interface GameEvent {
  id?: number;
  eventType: EventType;
  sessionId: string;
  timestamp: Date;
  details: any;
  characterId?: string;
  location?: string;
  tags?: string[];
}

export interface EventFilter {
  eventType?: EventType;
  sessionId?: string;
  characterId?: string;
  startTime?: Date;
  endTime?: Date;
  tags?: string[];
  limit?: number;
}

export interface Discovery {
  id?: number;
  clueId: string;
  sessionId: string;
  discoverer: string;
  method: string;
  timestamp: Date;
  description?: string;
}

export interface Relationship {
  id?: number;
  characterId: string;
  npcId: string;
  value: number;
  sessionId: string;
  lastUpdated: Date;
  notes?: string;
}

export class MemoryAgent {
  private db: DBInstance;

  constructor(cocDB: CoCDatabase) {
    this.db = cocDB.getDatabase();
  }

  /**
   * Log a game event to permanent storage
   */
  public logEvent(event: GameEvent): number {
    const stmt = this.db.prepare(`
            INSERT INTO game_events (event_type, session_id, timestamp, details, character_id, location, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

    const result = stmt.run(
      event.eventType,
      event.sessionId,
      event.timestamp.toISOString(),
      JSON.stringify(event.details),
      event.characterId || null,
      event.location || null,
      event.tags ? JSON.stringify(event.tags) : null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Query game history with filters
   */
  public queryHistory(filters: EventFilter): GameEvent[] {
    let sql = "SELECT * FROM game_events WHERE 1=1";
    const params: any[] = [];

    if (filters.eventType) {
      sql += " AND event_type = ?";
      params.push(filters.eventType);
    }

    if (filters.sessionId) {
      sql += " AND session_id = ?";
      params.push(filters.sessionId);
    }

    if (filters.characterId) {
      sql += " AND character_id = ?";
      params.push(filters.characterId);
    }

    if (filters.startTime) {
      sql += " AND timestamp >= ?";
      params.push(filters.startTime.toISOString());
    }

    if (filters.endTime) {
      sql += " AND timestamp <= ?";
      params.push(filters.endTime.toISOString());
    }

    if (filters.tags && filters.tags.length > 0) {
      const tagConditions = filters.tags.map(() => "tags LIKE ?").join(" OR ");
      sql += ` AND (${tagConditions})`;
      filters.tags.forEach((tag) => {
        params.push(`%"${tag}"%`);
      });
    }

    sql += " ORDER BY timestamp DESC";

    if (filters.limit) {
      sql += " LIMIT ?";
      params.push(filters.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as any[];

    return rows.map((row) => this.rowToGameEvent(row));
  }

  /**
   * Get context for decision-making
   */
  public getContext(
    sessionId: string,
    depth: "recent" | "session" | "campaign"
  ): GameEvent[] {
    let limit = 10;
    if (depth === "session") limit = 100;
    if (depth === "campaign") limit = 1000;

    return this.queryHistory({
      sessionId: depth === "campaign" ? undefined : sessionId,
      limit,
    });
  }

  /**
   * Get session summary
   */
  public getSessionSummary(sessionId: string): {
    sessionId: string;
    eventCount: number;
    startTime: Date | null;
    endTime: Date | null;
    keyEvents: GameEvent[];
    discoveries: Discovery[];
  } {
    const eventCount = this.db
      .prepare("SELECT COUNT(*) as count FROM game_events WHERE session_id = ?")
      .get(sessionId) as { count: number };

    const timeRange = this.db
      .prepare(`
            SELECT MIN(timestamp) as start_time, MAX(timestamp) as end_time
            FROM game_events
            WHERE session_id = ?
        `)
      .get(sessionId) as { start_time: string | null; end_time: string | null };

    const keyEvents = this.queryHistory({
      sessionId,
      eventType: "discovery",
      limit: 10,
    });

    const discoveries = this.getDiscoveries(sessionId);

    return {
      sessionId,
      eventCount: eventCount.count,
      startTime: timeRange.start_time ? new Date(timeRange.start_time) : null,
      endTime: timeRange.end_time ? new Date(timeRange.end_time) : null,
      keyEvents,
      discoveries,
    };
  }

  /**
   * Track or update NPC relationship
   */
  public trackRelationship(
    characterId: string,
    npcId: string,
    sessionId: string,
    change: number,
    notes?: string
  ): Relationship {
    // Get existing relationship
    const existing = this.db
      .prepare(`
            SELECT * FROM relationships
            WHERE character_id = ? AND npc_id = ? AND session_id = ?
        `)
      .get(characterId, npcId, sessionId) as any;

    const newValue = existing ? existing.value + change : change;
    const now = new Date().toISOString();

    if (existing) {
      this.db
        .prepare(`
                UPDATE relationships
                SET value = ?, last_updated = ?, notes = ?
                WHERE id = ?
            `)
        .run(newValue, now, notes || existing.notes, existing.id);

      return {
        id: existing.id,
        characterId,
        npcId,
        value: newValue,
        sessionId,
        lastUpdated: new Date(now),
        notes: notes || existing.notes,
      };
    } else {
      const result = this.db
        .prepare(`
                INSERT INTO relationships (character_id, npc_id, value, session_id, last_updated, notes)
                VALUES (?, ?, ?, ?, ?, ?)
            `)
        .run(characterId, npcId, newValue, sessionId, now, notes || null);

      return {
        id: result.lastInsertRowid as number,
        characterId,
        npcId,
        value: newValue,
        sessionId,
        lastUpdated: new Date(now),
        notes,
      };
    }
  }

  /**
   * Get relationship between character and NPC
   */
  public getRelationship(
    characterId: string,
    npcId: string,
    sessionId: string
  ): Relationship | null {
    const row = this.db
      .prepare(`
            SELECT * FROM relationships
            WHERE character_id = ? AND npc_id = ? AND session_id = ?
        `)
      .get(characterId, npcId, sessionId) as any;

    if (!row) return null;

    return {
      id: row.id,
      characterId: row.character_id,
      npcId: row.npc_id,
      value: row.value,
      sessionId: row.session_id,
      lastUpdated: new Date(row.last_updated),
      notes: row.notes,
    };
  }

  /**
   * Record a discovery
   */
  public recordDiscovery(discovery: Discovery): number {
    const result = this.db
      .prepare(`
            INSERT INTO discoveries (clue_id, session_id, discoverer, method, timestamp, description)
            VALUES (?, ?, ?, ?, ?, ?)
        `)
      .run(
        discovery.clueId,
        discovery.sessionId,
        discovery.discoverer,
        discovery.method,
        discovery.timestamp.toISOString(),
        discovery.description || null
      );

    // Also log as an event
    this.logEvent({
      eventType: "discovery",
      sessionId: discovery.sessionId,
      timestamp: discovery.timestamp,
      characterId: discovery.discoverer,
      details: {
        clueId: discovery.clueId,
        method: discovery.method,
        description: discovery.description,
      },
      tags: ["discovery", "clue"],
    });

    return result.lastInsertRowid as number;
  }

  /**
   * Get all discoveries for a session
   */
  public getDiscoveries(sessionId: string): Discovery[] {
    const rows = this.db
      .prepare(`
            SELECT * FROM discoveries
            WHERE session_id = ?
            ORDER BY timestamp DESC
        `)
      .all(sessionId) as any[];

    return rows.map((row) => ({
      id: row.id,
      clueId: row.clue_id,
      sessionId: row.session_id,
      discoverer: row.discoverer,
      method: row.method,
      timestamp: new Date(row.timestamp),
      description: row.description,
    }));
  }

  /**
   * Full-text search through all logs
   */
  public searchLogs(
    keyword: string,
    sessionId?: string,
    limit = 50
  ): GameEvent[] {
    let sql = `
            SELECT ge.* FROM game_events ge
            INNER JOIN events_fts ON ge.id = events_fts.event_id
            WHERE events_fts MATCH ?
        `;
    const params: any[] = [keyword];

    if (sessionId) {
      sql += " AND ge.session_id = ?";
      params.push(sessionId);
    }

    sql += " ORDER BY ge.timestamp DESC LIMIT ?";
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((row) => this.rowToGameEvent(row));
  }

  /**
   * Create or update a session
   */
  public createSession(sessionId: string, notes?: string): void {
    this.db
      .prepare(`
            INSERT OR IGNORE INTO sessions (session_id, start_time, notes)
            VALUES (?, ?, ?)
        `)
      .run(sessionId, new Date().toISOString(), notes || null);
  }

  /**
   * End a session
   */
  public endSession(sessionId: string): void {
    this.db
      .prepare(`
            UPDATE sessions
            SET end_time = ?
            WHERE session_id = ?
        `)
      .run(new Date().toISOString(), sessionId);
  }

  /**
   * Get recent events (helper for context)
   */
  public getRecentEvents(sessionId: string, count = 10): GameEvent[] {
    return this.queryHistory({
      sessionId,
      limit: count,
    });
  }

  /**
   * Get all character actions in a session
   */
  public getCharacterActions(
    sessionId: string,
    characterId: string
  ): GameEvent[] {
    return this.queryHistory({
      sessionId,
      characterId,
      eventType: "action",
    });
  }

  /**
   * Convert database row to GameEvent
   */
  private rowToGameEvent(row: any): GameEvent {
    return {
      id: row.id,
      eventType: row.event_type,
      sessionId: row.session_id,
      timestamp: new Date(row.timestamp),
      details: JSON.parse(row.details),
      characterId: row.character_id,
      location: row.location,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
    };
  }

  /**
   * Get statistics about the database
   */
  public getStats(): {
    totalEvents: number;
    totalSessions: number;
    totalDiscoveries: number;
    totalRelationships: number;
  } {
    const events = this.db
      .prepare("SELECT COUNT(*) as count FROM game_events")
      .get() as { count: number };
    const sessions = this.db
      .prepare("SELECT COUNT(*) as count FROM sessions")
      .get() as { count: number };
    const discoveries = this.db
      .prepare("SELECT COUNT(*) as count FROM discoveries")
      .get() as { count: number };
    const relationships = this.db
      .prepare("SELECT COUNT(*) as count FROM relationships")
      .get() as { count: number };

    return {
      totalEvents: events.count,
      totalSessions: sessions.count,
      totalDiscoveries: discoveries.count,
      totalRelationships: relationships.count,
    };
  }

  // ============================================================
  // RULES DATABASE METHODS
  // Static reference data for Call of Cthulhu 7e
  // ============================================================

  /**
   * Get skill information
   */
  public getSkill(skillName: string): Skill | undefined {
    const row = this.db
      .prepare("SELECT * FROM skills WHERE name = ?")
      .get(skillName) as any;
    if (!row) return undefined;

    return {
      name: row.name,
      baseValue: row.base_value,
      description: row.description,
      category: row.category,
      uncommon: row.uncommon === 1,
      examples: row.examples ? JSON.parse(row.examples) : undefined,
    };
  }

  /**
   * Get all skills
   */
  public getAllSkills(): Skill[] {
    const rows = this.db.prepare("SELECT * FROM skills").all() as any[];
    return rows.map((row) => ({
      name: row.name,
      baseValue: row.base_value,
      description: row.description,
      category: row.category,
      uncommon: row.uncommon === 1,
      examples: row.examples ? JSON.parse(row.examples) : undefined,
    }));
  }

  /**
   * Get skills by category
   */
  public getSkillsByCategory(category: string): Skill[] {
    const rows = this.db
      .prepare("SELECT * FROM skills WHERE category = ?")
      .all(category) as any[];
    return rows.map((row) => ({
      name: row.name,
      baseValue: row.base_value,
      description: row.description,
      category: row.category,
      uncommon: row.uncommon === 1,
      examples: row.examples ? JSON.parse(row.examples) : undefined,
    }));
  }

  /**
   * Get weapon data
   */
  public getWeapon(weaponName: string): WeaponData | undefined {
    const row = this.db
      .prepare("SELECT * FROM weapons WHERE name = ?")
      .get(weaponName) as any;
    if (!row) return undefined;

    return {
      name: row.name,
      skill: row.skill,
      damage: row.damage,
      range: row.range,
      attacksPerRound: row.attacks_per_round,
      ammo: row.ammo,
      malfunction: row.malfunction,
      era: row.era,
    };
  }

  /**
   * Get all weapons
   */
  public getAllWeapons(): WeaponData[] {
    const rows = this.db.prepare("SELECT * FROM weapons").all() as any[];
    return rows.map((row) => ({
      name: row.name,
      skill: row.skill,
      damage: row.damage,
      range: row.range,
      attacksPerRound: row.attacks_per_round,
      ammo: row.ammo,
      malfunction: row.malfunction,
      era: row.era,
    }));
  }

  /**
   * Lookup rules by query
   */
  public async lookupRule(query: RuleQuery): Promise<RuleLookupResult> {
    let sql = "SELECT * FROM rules WHERE 1=1";
    const params: any[] = [];

    if (query.category) {
      sql += " AND category = ?";
      params.push(query.category);
    }

    if (query.keywords && query.keywords.length > 0) {
      const keywordConditions = query.keywords
        .map(() => "(title LIKE ? OR description LIKE ? OR mechanics LIKE ?)")
        .join(" OR ");
      sql += ` AND (${keywordConditions})`;
      query.keywords.forEach((keyword) => {
        const pattern = `%${keyword}%`;
        params.push(pattern, pattern, pattern);
      });
    }

    if (query.tags && query.tags.length > 0) {
      const tagConditions = query.tags.map(() => "tags LIKE ?").join(" OR ");
      sql += ` AND (${tagConditions})`;
      query.tags.forEach((tag) => {
        params.push(`%"${tag}"%`);
      });
    }

    const results = this.db.prepare(sql).all(...params) as any[];

    const rules: RuleEntry[] = results.map((row) => ({
      id: row.id,
      category: row.category,
      title: row.title,
      description: row.description,
      mechanics: row.mechanics,
      examples: row.examples ? JSON.parse(row.examples) : undefined,
      relatedRules: row.related_rules
        ? JSON.parse(row.related_rules)
        : undefined,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
    }));

    return {
      rules,
      count: rules.length,
    };
  }

  /**
   * Get sanity loss for a specific trigger
   */
  public getSanityLoss(trigger: string): string | undefined {
    const result = this.db
      .prepare("SELECT sanity_loss FROM sanity_triggers WHERE trigger = ?")
      .get(trigger) as { sanity_loss: string } | undefined;
    return result?.sanity_loss;
  }

  /**
   * Get all sanity triggers
   */
  public getAllSanityTriggers(): Map<string, string> {
    const results = this.db
      .prepare("SELECT trigger, sanity_loss FROM sanity_triggers")
      .all() as Array<{ trigger: string; sanity_loss: string }>;
    return new Map(results.map((r) => [r.trigger, r.sanity_loss]));
  }

  /**
   * Perform a skill check according to CoC 7e rules
   */
  public async skillCheck(
    skillName: string,
    baseValue: number,
    difficulty: Difficulty = "regular",
    modifiers = 0,
    bonusDice = 0,
    penaltyDice = 0
  ): Promise<SkillCheckResult> {
    const adjustedValue = Math.min(100, baseValue + modifiers);

    let target = adjustedValue;
    if (difficulty === "hard") {
      target = Math.floor(adjustedValue / 2);
    } else if (difficulty === "extreme") {
      target = Math.floor(adjustedValue / 5);
    }

    const roll = this.rollD100WithBonusPenalty(bonusDice, penaltyDice);

    let level: SkillCheckResult["level"];
    let success = false;

    if (roll <= 5 && roll <= adjustedValue) {
      level = "critical";
      success = true;
    } else if (roll >= 96 || (roll > adjustedValue && roll >= 96)) {
      level = "fumble";
      success = false;
    } else if (roll <= Math.floor(adjustedValue / 5)) {
      level = "extreme";
      success = true;
    } else if (roll <= Math.floor(adjustedValue / 2)) {
      level = "hard";
      success = true;
    } else if (roll <= target) {
      level = "regular";
      success = true;
    } else {
      level = "failure";
      success = false;
    }

    const description = this.formatSkillCheckResult(
      skillName,
      roll,
      target,
      level,
      difficulty
    );

    return {
      success,
      roll,
      target,
      level,
      description,
      skillName,
    };
  }

  /**
   * Perform sanity check according to CoC 7e
   */
  public async sanityCheck(check: SanityCheck): Promise<SanityLossResult> {
    const [successLoss, failureLoss] = check.sanityLoss.split("/");

    const roll = this.rollD100();
    const success = roll <= check.currentSanity;

    const lossFormula = success ? successLoss : failureLoss;
    const loss = this.rollDice(lossFormula);

    const newSanity = Math.max(0, check.currentSanity - loss);

    const temporaryInsanity = loss >= 5;
    const indefiniteInsanity = newSanity === 0;

    const lossPercent = (loss / check.currentSanity) * 100;
    const permanentInsanity = lossPercent >= 20;

    let effect = "";
    if (indefiniteInsanity) {
      effect =
        "Indefinite Insanity - character develops a permanent phobia or mania and requires psychiatric treatment";
    } else if (permanentInsanity) {
      effect =
        "Permanent Insanity - character is permanently insane and removed from play";
    } else if (temporaryInsanity) {
      effect =
        "Temporary Insanity - character is incapacitated for 1d10+4 rounds or longer. Roll on Temporary Insanity table";
    }

    const description = `Sanity check ${success ? "succeeded" : "failed"}. Lost ${loss} Sanity (${check.currentSanity} → ${newSanity})${temporaryInsanity ? " - TEMPORARY INSANITY!" : ""}`;

    return {
      loss,
      roll,
      newSanity,
      temporaryInsanity,
      indefiniteInsanity,
      permanentInsanity,
      effect,
      description,
    };
  }

  /**
   * Calculate bonus damage based on STR + SIZ (CoC 7e)
   */
  public calculateBonusDamage(str: number, siz: number): string {
    const total = str + siz;

    if (total <= 64) return "-2";
    if (total <= 84) return "-1";
    if (total <= 124) return "0";
    if (total <= 164) return "+1d4";
    if (total <= 204) return "+1d6";
    if (total <= 284) return "+2d6";
    if (total <= 364) return "+3d6";
    if (total <= 444) return "+4d6";

    return "+5d6";
  }

  /**
   * Calculate build based on STR + SIZ (CoC 7e)
   */
  public calculateBuild(str: number, siz: number): number {
    const total = str + siz;

    if (total <= 64) return -2;
    if (total <= 84) return -1;
    if (total <= 124) return 0;
    if (total <= 164) return 1;
    if (total <= 204) return 2;
    if (total <= 284) return 3;
    if (total <= 364) return 4;
    if (total <= 444) return 5;

    return 6;
  }

  /**
   * Calculate move rate based on characteristics (CoC 7e)
   */
  public calculateMoveRate(
    dex: number,
    str: number,
    siz: number,
    age: number
  ): number {
    let moveRate = 8;

    if (age >= 80) moveRate = 5;
    else if (age >= 70) moveRate = 6;
    else if (age >= 60) moveRate = 7;
    else if (age >= 50) moveRate = 7;
    else if (age >= 40) moveRate = 8;

    if (str < siz && dex < siz) moveRate = 7;
    if (str > siz && dex > siz) moveRate = 9;

    return moveRate;
  }

  /**
   * Roll damage
   */
  public rollDamage(formula: string, bonus = 0): DamageResult {
    const total = this.rollDice(formula) + bonus;

    return {
      total,
      rolls: [],
      formula,
      bonus,
    };
  }

  /**
   * Get rule explanation for Keeper
   */
  public async getRuleExplanation(topic: string): Promise<string> {
    const result = await this.lookupRule({
      keywords: [topic],
    });

    if (result.count === 0) {
      return `No rules found for: ${topic}`;
    }

    const explanations = result.rules.map((rule) => {
      let text = `**${rule.title}**\n${rule.description}`;
      if (rule.mechanics) text += `\nMechanics: ${rule.mechanics}`;
      if (rule.examples) text += `\nExamples: ${rule.examples.join(", ")}`;
      return text;
    });

    return explanations.join("\n\n");
  }

  // ============================================================
  // PRIVATE HELPER METHODS
  // ============================================================

  private formatSkillCheckResult(
    skillName: string,
    roll: number,
    target: number,
    level: string,
    difficulty: Difficulty
  ): string {
    const difficultyText = difficulty !== "regular" ? ` (${difficulty})` : "";

    switch (level) {
      case "critical":
        return `Critical success on ${skillName}${difficultyText}! (Rolled ${roll}, needed ≤5)`;
      case "fumble":
        return `Fumble on ${skillName}${difficultyText}! (Rolled ${roll}, fumble on ≥96)`;
      case "extreme":
        return `Extreme success on ${skillName}${difficultyText}! (Rolled ${roll})`;
      case "hard":
        return `Hard success on ${skillName}${difficultyText}! (Rolled ${roll})`;
      case "regular":
        return `Success on ${skillName}${difficultyText}! (Rolled ${roll}, needed ≤${target})`;
      default:
        return `Failed ${skillName}${difficultyText}. (Rolled ${roll}, needed ≤${target})`;
    }
  }

  private rollD100WithBonusPenalty(bonusDice = 0, penaltyDice = 0): number {
    const unitsDie = Math.floor(Math.random() * 10);

    let tensDie = Math.floor(Math.random() * 10);
    const tensDice = [tensDie];

    for (let i = 0; i < bonusDice; i++) {
      tensDice.push(Math.floor(Math.random() * 10));
    }

    for (let i = 0; i < penaltyDice; i++) {
      tensDice.push(Math.floor(Math.random() * 10));
    }

    if (bonusDice > 0) {
      tensDie = Math.min(...tensDice);
    } else if (penaltyDice > 0) {
      tensDie = Math.max(...tensDice);
    }

    const result = tensDie * 10 + unitsDie;
    return result === 0 ? 100 : result;
  }

  private rollD100(): number {
    return this.rollD100WithBonusPenalty(0, 0);
  }

  private rollDice(formula: string): number {
    if (!formula.includes("d")) {
      return Number.parseInt(formula) || 0;
    }

    const match = formula.match(/(\d+)d(\d+)([+-]\d+)?/);
    if (!match) return 0;

    const numDice = Number.parseInt(match[1]);
    const diceSize = Number.parseInt(match[2]);
    const modifier = match[3] ? Number.parseInt(match[3]) : 0;

    let total = 0;
    for (let i = 0; i < numDice; i++) {
      total += Math.floor(Math.random() * diceSize) + 1;
    }

    return total + modifier;
  }
}
