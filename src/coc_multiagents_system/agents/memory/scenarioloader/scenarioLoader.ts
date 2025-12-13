/**
 * Scenario Loader
 * Loads scenario data from documents and stores them in the database
 */

import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { CoCDatabase } from "../database/schema.js";
import type {
  ScenarioProfile,
  ScenarioSnapshot,
  ScenarioCharacter,
  ScenarioClue,
  ScenarioCondition,
  ParsedScenarioData,
  ScenarioQuery,
  ScenarioSearchResult,
} from "../../models/scenarioTypes.js";
import { ScenarioDocumentParser } from "./scenarioDocumentParser.js";

/**
 * Scenario Loader class
 */
export class ScenarioLoader {
  private db: CoCDatabase;
  private parser: ScenarioDocumentParser;

  constructor(db: CoCDatabase, parser?: ScenarioDocumentParser) {
    this.db = db;
    this.parser = parser || new ScenarioDocumentParser();
  }

  /**
   * Check if any files in directory have changed since last load
   */
  private checkForChanges(dirPath: string): { hasChanges: boolean; currentFiles: Map<string, number> } {
    if (!fs.existsSync(dirPath)) {
      return { hasChanges: false, currentFiles: new Map() };
    }

    const currentFiles = new Map<string, number>();
    const files = fs.readdirSync(dirPath).filter(file => 
      file.endsWith('.docx') || file.endsWith('.pdf')
    );

    // Get modification times for all relevant files
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      currentFiles.set(file, stats.mtime.getTime());
    }

    // Check if we have existing scenarios
    const existingScenarios = this.getAllScenarios();
    
    // If no scenarios exist, we need to load
    if (existingScenarios.length === 0) {
      return { hasChanges: true, currentFiles };
    }

    // Check timestamp file
    const lastLoadFile = path.join(dirPath, '.last_scenario_load_timestamp');
    let lastLoadTime = 0;
    
    if (fs.existsSync(lastLoadFile)) {
      try {
        lastLoadTime = parseInt(fs.readFileSync(lastLoadFile, 'utf8'));
      } catch {
        return { hasChanges: true, currentFiles };
      }
    }

    // Check if any file is newer than last load
    const hasChanges = Array.from(currentFiles.values()).some(mtime => mtime > lastLoadTime);
    
    return { hasChanges, currentFiles };
  }

  /**
   * Update the last load timestamp
   */
  private updateLastLoadTimestamp(dirPath: string): void {
    const lastLoadFile = path.join(dirPath, '.last_scenario_load_timestamp');
    const currentTime = Date.now().toString();
    fs.writeFileSync(lastLoadFile, currentTime, 'utf8');
  }

  /**
   * Load scenarios from a directory (only if files have changed)
   */
  async loadScenariosFromDirectory(dirPath: string, forceReload = false): Promise<ScenarioProfile[]> {
    console.log(`\n=== Checking Scenarios in directory: ${dirPath} ===`);

    if (!fs.existsSync(dirPath)) {
      console.log(`Directory does not exist, creating: ${dirPath}`);
      fs.mkdirSync(dirPath, { recursive: true });
      return [];
    }

    // Check for file changes unless forced reload
    if (!forceReload) {
      const { hasChanges } = this.checkForChanges(dirPath);
      if (!hasChanges) {
        const existingScenarios = this.getAllScenarios();
        console.log(`No changes detected. Using ${existingScenarios.length} existing scenarios from database.`);
        return existingScenarios;
      }
    }

    console.log(`Loading Scenarios from directory: ${dirPath}`);

    // Parse all documents in the directory
    const parsedScenarios = await this.parser.parseDirectory(dirPath);

    if (parsedScenarios.length === 0) {
      console.log("No scenario documents found in directory.");
      this.updateLastLoadTimestamp(dirPath);
      return [];
    }

    // Convert and store each scenario
    const scenarioProfiles: ScenarioProfile[] = [];
    for (const parsedData of parsedScenarios) {
      try {
        const scenarioProfile = this.convertToScenarioProfile(parsedData);
        this.saveScenarioToDatabase(scenarioProfile);
        scenarioProfiles.push(scenarioProfile);
        console.log(`✓ Loaded Scenario: ${scenarioProfile.name} (${scenarioProfile.id}) - ${scenarioProfile.timeline.length} time points`);
      } catch (error) {
        console.error(`✗ Failed to load scenario ${parsedData.name}:`, error);
      }
    }

    // Update timestamp after successful load
    this.updateLastLoadTimestamp(dirPath);

    console.log(`\n=== Successfully loaded ${scenarioProfiles.length} scenarios ===\n`);
    return scenarioProfiles;
  }

  /**
   * Convert ParsedScenarioData to ScenarioProfile
   */
  private convertToScenarioProfile(parsedData: ParsedScenarioData): ScenarioProfile {
    const scenarioId = this.generateScenarioId(parsedData.name);

    // Convert timeline entries
    const timeline: ScenarioSnapshot[] = parsedData.timeline.map((timelineEntry, index) => {
      const snapshotId = `${scenarioId}-snapshot-${index}`;

      // Convert characters
      const characters: ScenarioCharacter[] = (timelineEntry.characters || []).map((char, charIndex) => ({
        id: `${snapshotId}-char-${charIndex}`,
        name: char.name,
        role: char.role || "unknown",
        status: char.status || "unknown",
        location: char.location,
        notes: char.notes,
      }));

      // Convert clues
      const clues: ScenarioClue[] = (timelineEntry.clues || []).map((clue, clueIndex) => ({
        id: `${snapshotId}-clue-${clueIndex}`,
        clueText: clue.clueText,
        category: (clue.category as any) || "observation",
        difficulty: (clue.difficulty as any) || "regular",
        location: clue.location || timelineEntry.location,
        discoveryMethod: clue.discoveryMethod,
        reveals: clue.reveals || [],
        discovered: false,
      }));

      // Convert conditions
      const conditions: ScenarioCondition[] = (timelineEntry.conditions || []).map((cond, condIndex) => ({
        type: (cond.type as any) || "other",
        description: cond.description,
        mechanicalEffect: cond.mechanicalEffect,
      }));

      const snapshot: ScenarioSnapshot = {
        id: snapshotId,
        scenarioId,
        timePoint: {
          timestamp: timelineEntry.timePoint.timestamp,
          notes: timelineEntry.timePoint.notes,
        },
        name: timelineEntry.name || parsedData.name,
        location: timelineEntry.location,
        description: timelineEntry.description,
        characters,
        clues,
        conditions,
        events: timelineEntry.events || [],
        exits: timelineEntry.exits || [],
        keeperNotes: timelineEntry.keeperNotes,
      };

      return snapshot;
    });

    const scenarioProfile: ScenarioProfile = {
      id: scenarioId,
      name: parsedData.name,
      description: parsedData.description,
      timeline,
      tags: parsedData.tags || [],
      connections: parsedData.connections?.map((conn) => ({
        scenarioId: this.generateScenarioId(conn.scenarioName),
        relationshipType: conn.relationshipType as any,
        description: conn.description,
      })) || [],
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        gameSystem: "CoC 7e",
      },
    };

    return scenarioProfile;
  }

  /**
   * Generate a unique ID for a scenario based on its name
   */
  private generateScenarioId(name: string): string {
    return `scenario-${name.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "")}-${randomUUID().slice(0, 8)}`;
  }

  /**
   * Save scenario to database
   */
  private saveScenarioToDatabase(scenario: ScenarioProfile): void {
    const database = this.db.getDatabase();
    const hasCategoryColumn = this.db.hasColumn("scenarios", "category");
    const hasTimeOrderColumn = this.db.hasColumn("scenario_snapshots", "time_order");

    this.db.transaction(() => {
      // Insert or update scenario
      const scenarioColumns = ["scenario_id", "name", "description", "tags", "connections", "metadata"];
      const scenarioValues: any[] = [
        scenario.id,
        scenario.name,
        scenario.description,
        JSON.stringify(scenario.tags),
        JSON.stringify(scenario.connections),
        JSON.stringify(scenario.metadata),
      ];

      if (hasCategoryColumn) {
        // Backward compatibility: older DBs may have category
        scenarioColumns.splice(2, 0, "category");
        scenarioValues.splice(2, 0, "location");
      }

      const scenarioStmt = database.prepare(
        `INSERT OR REPLACE INTO scenarios (${scenarioColumns.join(", ")}) VALUES (${scenarioColumns
          .map(() => "?")
          .join(", ")})`
      );

      scenarioStmt.run(...scenarioValues);

      // Delete existing related data
      database.prepare("DELETE FROM scenario_snapshots WHERE scenario_id = ?").run(scenario.id);
      // Note: Foreign key constraints will cascade delete related characters, clues, and conditions

      // Insert timeline snapshots
      scenario.timeline.forEach((snapshot, idx) => {
        // Insert snapshot
        const snapshotColumns = [
          "snapshot_id",
          "scenario_id",
          "time_timestamp",
          "time_notes",
          "snapshot_name",
          "location",
          "description",
          "events",
          "exits",
          "keeper_notes",
        ];
        const snapshotValues: any[] = [
          snapshot.id,
          scenario.id,
          snapshot.timePoint.timestamp,
          snapshot.timePoint.notes || null,
          snapshot.name,
          snapshot.location,
          snapshot.description,
          JSON.stringify(snapshot.events),
          JSON.stringify(snapshot.exits),
          snapshot.keeperNotes || null,
        ];

        if (hasTimeOrderColumn) {
          snapshotColumns.splice(3, 0, "time_order");
          snapshotValues.splice(3, 0, idx);
        }

        const snapshotStmt = database.prepare(
          `INSERT INTO scenario_snapshots (${snapshotColumns.join(", ")}) VALUES (${snapshotColumns
            .map(() => "?")
            .join(", ")})`
        );

        snapshotStmt.run(...snapshotValues);

        // Insert characters for this snapshot
        if (snapshot.characters.length > 0) {
          const charStmt = database.prepare(`
                        INSERT INTO scenario_characters (
                            id, snapshot_id, character_name, character_role, character_status,
                            character_location, character_notes
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    `);

          for (const char of snapshot.characters) {
            charStmt.run(
              char.id,
              snapshot.id,
              char.name,
              char.role,
              char.status,
              char.location || null,
              char.notes || null
            );
          }
        }

        // Insert clues for this snapshot
        if (snapshot.clues.length > 0) {
          const clueStmt = database.prepare(`
                        INSERT INTO scenario_clues (
                            clue_id, snapshot_id, clue_text, category, difficulty,
                            clue_location, discovery_method, reveals, discovered, discovery_details
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);

          for (const clue of snapshot.clues) {
            clueStmt.run(
              clue.id,
              snapshot.id,
              clue.clueText,
              clue.category,
              clue.difficulty,
              clue.location,
              clue.discoveryMethod || null,
              JSON.stringify(clue.reveals),
              clue.discovered ? 1 : 0,
              clue.discoveryDetails ? JSON.stringify(clue.discoveryDetails) : null
            );
          }
        }

        // Insert conditions for this snapshot
        if (snapshot.conditions.length > 0) {
          const condStmt = database.prepare(`
                        INSERT INTO scenario_conditions (
                            condition_id, snapshot_id, condition_type, description, mechanical_effect
                        ) VALUES (?, ?, ?, ?, ?)
                    `);

          for (const cond of snapshot.conditions) {
            const condId = `${snapshot.id}-cond-${randomUUID().slice(0, 8)}`;
            condStmt.run(
              condId,
              snapshot.id,
              cond.type,
              cond.description,
              cond.mechanicalEffect || null
            );
          }
        }
      });
    });
  }

  /**
   * Get a scenario from the database by ID
   */
  getScenarioById(scenarioId: string): ScenarioProfile | null {
    const database = this.db.getDatabase();

    // Get scenario data
    const scenario = database
      .prepare(`SELECT * FROM scenarios WHERE scenario_id = ?`)
      .get(scenarioId) as any;

    if (!scenario) {
      return null;
    }

    // Get timeline snapshots
    const hasTimeOrder = this.db.hasColumn("scenario_snapshots", "time_order");
    const orderColumn = hasTimeOrder ? "time_order" : "rowid";
    const snapshots = database
      .prepare(`
            SELECT * FROM scenario_snapshots 
            WHERE scenario_id = ? 
            ORDER BY ${orderColumn} ASC
        `)
      .all(scenarioId) as any[];

    const timeline: ScenarioSnapshot[] = [];

    for (const snap of snapshots) {
      // Get characters for this snapshot
      const characters = database
        .prepare(`SELECT * FROM scenario_characters WHERE snapshot_id = ?`)
        .all(snap.snapshot_id) as any[];

      // Get clues for this snapshot
      const clues = database
        .prepare(`SELECT * FROM scenario_clues WHERE snapshot_id = ?`)
        .all(snap.snapshot_id) as any[];

      // Get conditions for this snapshot
      const conditions = database
        .prepare(`SELECT * FROM scenario_conditions WHERE snapshot_id = ?`)
        .all(snap.snapshot_id) as any[];

      const timelineSnapshot: ScenarioSnapshot = {
        id: snap.snapshot_id,
        scenarioId,
        timePoint: {
          timestamp: snap.time_timestamp,
          notes: snap.time_notes,
        },
        name: snap.snapshot_name,
        location: snap.location,
        description: snap.description,
        characters: characters.map((c) => ({
          id: c.id,
          name: c.character_name,
          role: c.character_role,
          status: c.character_status,
          location: c.character_location,
          notes: c.character_notes,
        })),
        clues: clues.map((c) => ({
          id: c.clue_id,
          clueText: c.clue_text,
          category: c.category,
          difficulty: c.difficulty,
          location: c.clue_location,
          discoveryMethod: c.discovery_method,
          reveals: c.reveals ? JSON.parse(c.reveals) : [],
          discovered: c.discovered === 1,
          discoveryDetails: c.discovery_details ? JSON.parse(c.discovery_details) : undefined,
        })),
        conditions: conditions.map((c) => ({
          type: c.condition_type,
          description: c.description,
          mechanicalEffect: c.mechanical_effect,
        })),
        events: snap.events ? JSON.parse(snap.events) : [],
        exits: snap.exits ? JSON.parse(snap.exits) : [],
        keeperNotes: snap.keeper_notes,
      };

      timeline.push(timelineSnapshot);
    }

    const scenarioProfile: ScenarioProfile = {
      id: scenario.scenario_id,
      name: scenario.name,
      description: scenario.description,
      timeline,
      tags: JSON.parse(scenario.tags || "[]"),
      connections: JSON.parse(scenario.connections || "[]"),
      metadata: JSON.parse(scenario.metadata),
    };

    return scenarioProfile;
  }

  /**
   * Get all scenarios from the database
   */
  getAllScenarios(): ScenarioProfile[] {
    const database = this.db.getDatabase();

    const scenarios = database
      .prepare(`SELECT scenario_id FROM scenarios`)
      .all() as any[];

    return scenarios
      .map((s) => this.getScenarioById(s.scenario_id))
      .filter((scenario) => scenario !== null) as ScenarioProfile[];
  }

  /**
   * Search scenarios based on query
   */
  searchScenarios(query: ScenarioQuery): ScenarioSearchResult {
    const database = this.db.getDatabase();
    let sqlQuery = `SELECT scenario_id FROM scenarios WHERE 1=1`;
    const params: any[] = [];

    if (query.name) {
      sqlQuery += ` AND name LIKE ?`;
      params.push(`%${query.name}%`);
    }

    if (query.tags && query.tags.length > 0) {
      for (const tag of query.tags) {
        sqlQuery += ` AND tags LIKE ?`;
        params.push(`%"${tag}"%`);
      }
    }

    const results = database.prepare(sqlQuery).all(params) as any[];

    const scenarios = results
      .map((r) => this.getScenarioById(r.scenario_id))
      .filter((scenario) => scenario !== null) as ScenarioProfile[];

    return {
      scenarios,
      snapshots: scenarios.flatMap((s) => s.timeline),
      totalCount: scenarios.length,
    };
  }

  /**
   * Check if scenario already exists in database
   */
  scenarioExists(scenarioId: string): boolean {
    const database = this.db.getDatabase();
    const result = database
      .prepare(`SELECT COUNT(*) as count FROM scenarios WHERE scenario_id = ?`)
      .get(scenarioId) as any;
    return result.count > 0;
  }

  /**
   * Mark a clue as discovered
   */
  discoverClue(
    clueId: string,
    discoveredBy: string,
    method: string,
    timestamp: string = new Date().toISOString()
  ): void {
    const database = this.db.getDatabase();

    const discoveryDetails = {
      discoveredBy,
      discoveredAt: timestamp,
      method,
    };

    database
      .prepare(`
            UPDATE scenario_clues 
            SET discovered = 1, discovery_details = ?
            WHERE clue_id = ?
        `)
      .run(JSON.stringify(discoveryDetails), clueId);
  }

  /**
   * Get undiscovered clues for a scenario or snapshot
   */
  getUndiscoveredClues(scenarioId?: string, snapshotId?: string): ScenarioClue[] {
    const database = this.db.getDatabase();

    let query: string;
    let params: any[];

    if (snapshotId) {
      query = `
                SELECT * FROM scenario_clues 
                WHERE snapshot_id = ? AND discovered = 0
            `;
      params = [snapshotId];
    } else if (scenarioId) {
      query = `
                SELECT sc.* FROM scenario_clues sc
                JOIN scenario_snapshots ss ON sc.snapshot_id = ss.snapshot_id
                WHERE ss.scenario_id = ? AND sc.discovered = 0
            `;
      params = [scenarioId];
    } else {
      query = `SELECT * FROM scenario_clues WHERE discovered = 0`;
      params = [];
    }

    const results = database.prepare(query).all(params) as any[];

    return results.map((c) => ({
      id: c.clue_id,
      clueText: c.clue_text,
      category: c.category,
      difficulty: c.difficulty,
      location: c.clue_location,
      discoveryMethod: c.discovery_method,
      reveals: c.reveals ? JSON.parse(c.reveals) : [],
      discovered: false,
    }));
  }
}
