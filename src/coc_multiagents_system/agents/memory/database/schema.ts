/**
 * Unified Database Schema for CoC Multi-Agent System
 * Stores rules, skills, weapons, and memory data
 */

import Database from "better-sqlite3";
type DBInstance = InstanceType<typeof Database>;
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CoCDatabase {
  private db: DBInstance;

  constructor(dbPath?: string) {
    const defaultPath = path.join(process.cwd(), "data", "coc_game.db");
    this.db = new Database(dbPath || defaultPath);
    this.db.pragma("journal_mode = WAL");
    this.initializeSchema();
  }

  /**
   * Check if a column exists in a table (defensive for schema drift)
   */
  public hasColumn(tableName: string, columnName: string): boolean {
    const safeTable = tableName.replace(/[^\w]/g, "");
    const safeColumn = columnName.replace(/[^\w]/g, "");
    const rows = this.db
      .prepare(`PRAGMA table_info(${safeTable});`)
      .all() as { name: string }[];
    return rows.some((row) => row.name === safeColumn);
  }

  private initializeSchema(): void {
    // Rules table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS rules (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                mechanics TEXT,
                examples TEXT, -- JSON array
                related_rules TEXT, -- JSON array of IDs
                tags TEXT, -- JSON array
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_rules_category ON rules(category);
            CREATE INDEX IF NOT EXISTS idx_rules_title ON rules(title);
        `);

    // Skills table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS skills (
                name TEXT PRIMARY KEY,
                base_value INTEGER NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                uncommon INTEGER NOT NULL DEFAULT 0,
                examples TEXT, -- JSON array
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
        `);

    // Weapons table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS weapons (
                name TEXT PRIMARY KEY,
                skill TEXT NOT NULL,
                damage TEXT NOT NULL,
                range TEXT NOT NULL,
                attacks_per_round INTEGER NOT NULL,
                ammo INTEGER,
                malfunction INTEGER,
                era TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

    // Sanity triggers table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS sanity_triggers (
                trigger TEXT PRIMARY KEY,
                sanity_loss TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

    // Sessions table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                start_time DATETIME NOT NULL,
                end_time DATETIME,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

    // Game events table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS game_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                session_id TEXT NOT NULL,
                timestamp DATETIME NOT NULL,
                details TEXT NOT NULL, -- JSON
                character_id TEXT,
                location TEXT,
                tags TEXT, -- JSON array
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id)
            );
            CREATE INDEX IF NOT EXISTS idx_events_session ON game_events(session_id);
            CREATE INDEX IF NOT EXISTS idx_events_type ON game_events(event_type);
            CREATE INDEX IF NOT EXISTS idx_events_timestamp ON game_events(timestamp);
            CREATE INDEX IF NOT EXISTS idx_events_character ON game_events(character_id);
        `);

    // Memory logs table - chronological play history for characters and keeper
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS memory_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                speaker_type TEXT NOT NULL, -- 'character' | 'keeper'
                character_id TEXT, -- optional link to characters table when speaker is a PC/NPC
                character_name TEXT NOT NULL,
                content TEXT NOT NULL,
                action_type TEXT, -- e.g. declared move/skill use
                action_result TEXT, -- outcome or resolution narrative (JSON/text)
                timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id),
                FOREIGN KEY (character_id) REFERENCES characters(character_id)
            );
            CREATE INDEX IF NOT EXISTS idx_memory_logs_session ON memory_logs(session_id);
            CREATE INDEX IF NOT EXISTS idx_memory_logs_speaker ON memory_logs(speaker_type);
            CREATE INDEX IF NOT EXISTS idx_memory_logs_time ON memory_logs(timestamp);
        `);
    // Backfill action columns if memory_logs already existed
    try {
      this.db.exec("ALTER TABLE memory_logs ADD COLUMN action_type TEXT;");
    } catch {
      // ignore if column already exists
    }
    try {
      this.db.exec("ALTER TABLE memory_logs ADD COLUMN action_result TEXT;");
    } catch {
      // ignore if column already exists
    }

    // Discoveries table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS discoveries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                clue_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                discoverer TEXT NOT NULL,
                method TEXT NOT NULL,
                timestamp DATETIME NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id)
            );
            CREATE INDEX IF NOT EXISTS idx_discoveries_session ON discoveries(session_id);
            CREATE INDEX IF NOT EXISTS idx_discoveries_clue ON discoveries(clue_id);
        `);

    // Relationships table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS relationships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id TEXT NOT NULL,
                npc_id TEXT NOT NULL,
                value INTEGER NOT NULL DEFAULT 0,
                session_id TEXT NOT NULL,
                last_updated DATETIME NOT NULL,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id),
                UNIQUE(character_id, npc_id, session_id)
            );
            CREATE INDEX IF NOT EXISTS idx_relationships_character ON relationships(character_id);
            CREATE INDEX IF NOT EXISTS idx_relationships_npc ON relationships(npc_id);
        `);

    // Characters table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS characters (
                character_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                attributes TEXT NOT NULL, -- JSON blob of attributes (STR, DEX, etc.)
                status TEXT NOT NULL, -- JSON blob of HP/Sanity/Luck/etc.
                inventory TEXT, -- JSON array of strings
                skills TEXT, -- JSON map of skillName -> value
                notes TEXT,
                is_npc INTEGER DEFAULT 0, -- 0 for PC, 1 for NPC
                occupation TEXT,
                age INTEGER,
                appearance TEXT,
                personality TEXT,
                background TEXT,
                goals TEXT, -- JSON array
                secrets TEXT, -- JSON array
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);
            CREATE INDEX IF NOT EXISTS idx_characters_is_npc ON characters(is_npc);
        `);
    // Backfill columns for existing tables
    const columnsToAdd = [
      "skills TEXT",
      "is_npc INTEGER DEFAULT 0",
      "occupation TEXT",
      "age INTEGER",
      "appearance TEXT",
      "personality TEXT",
      "background TEXT",
      "goals TEXT",
      "secrets TEXT",
    ];
    for (const column of columnsToAdd) {
      try {
        this.db.exec(`ALTER TABLE characters ADD COLUMN ${column};`);
      } catch {
        // ignore if column already exists
      }
    }

    // NPC Clues table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS npc_clues (
                id TEXT PRIMARY KEY,
                npc_id TEXT NOT NULL,
                clue_text TEXT NOT NULL,
                category TEXT,
                difficulty TEXT,
                revealed INTEGER DEFAULT 0,
                related_to TEXT, -- JSON array
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (npc_id) REFERENCES characters(character_id)
            );
            CREATE INDEX IF NOT EXISTS idx_npc_clues_npc ON npc_clues(npc_id);
            CREATE INDEX IF NOT EXISTS idx_npc_clues_revealed ON npc_clues(revealed);
        `);

    // NPC Relationships table (extended version)
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS npc_relationships (
                id TEXT PRIMARY KEY,
                source_id TEXT NOT NULL,
                target_id TEXT NOT NULL,
                target_name TEXT NOT NULL,
                relationship_type TEXT NOT NULL,
                attitude INTEGER DEFAULT 0,
                description TEXT,
                history TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (source_id) REFERENCES characters(character_id),
                UNIQUE(source_id, target_id)
            );
            CREATE INDEX IF NOT EXISTS idx_npc_relationships_source ON npc_relationships(source_id);
            CREATE INDEX IF NOT EXISTS idx_npc_relationships_target ON npc_relationships(target_id);
        `);

    // Full-text search for events
    this.db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
                event_id UNINDEXED,
                details,
                content='game_events',
                content_rowid='id'
            );

            CREATE TRIGGER IF NOT EXISTS events_fts_insert AFTER INSERT ON game_events BEGIN
                INSERT INTO events_fts(event_id, details)
                VALUES (new.id, new.details);
            END;

            CREATE TRIGGER IF NOT EXISTS events_fts_delete AFTER DELETE ON game_events BEGIN
                DELETE FROM events_fts WHERE event_id = old.id;
            END;

            CREATE TRIGGER IF NOT EXISTS events_fts_update AFTER UPDATE ON game_events BEGIN
                DELETE FROM events_fts WHERE event_id = old.id;
                INSERT INTO events_fts(event_id, details)
                VALUES (new.id, new.details);
            END;
        `);

    // Scenarios table - for managing scenario/location data
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS scenarios (
                scenario_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                tags TEXT, -- JSON array
                connections TEXT, -- JSON array of connections
                permanent_changes TEXT, -- JSON array of permanent changes (scenario-level, shared by all snapshots)
                metadata TEXT NOT NULL, -- JSON blob with created_at, updated_at, source, author, gameSystem
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_scenarios_name ON scenarios(name);
        `);
    
    // Backfill permanent_changes column if table already existed
    try {
      if (!this.hasColumn("scenarios", "permanent_changes")) {
        this.db.exec(
          "ALTER TABLE scenarios ADD COLUMN permanent_changes TEXT;"
        );
      }
    } catch {
      // ignore if column already exists or cannot be added
    }

    // Scenario snapshots table - for timeline data
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS scenario_snapshots (
                snapshot_id TEXT PRIMARY KEY,
                scenario_id TEXT NOT NULL,
                time_timestamp TEXT NOT NULL,
                time_notes TEXT,
                snapshot_name TEXT,
                location TEXT NOT NULL,
                description TEXT NOT NULL,
                events TEXT, -- JSON array
                exits TEXT, -- JSON array
                keeper_notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (scenario_id) REFERENCES scenarios(scenario_id)
            );
            CREATE INDEX IF NOT EXISTS idx_snapshots_scenario ON scenario_snapshots(scenario_id);
        `);

    // Scenario characters table - characters present in scenarios
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS scenario_characters (
                id TEXT PRIMARY KEY,
                snapshot_id TEXT NOT NULL,
                character_name TEXT NOT NULL,
                character_role TEXT NOT NULL,
                character_status TEXT NOT NULL,
                character_location TEXT,
                character_notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (snapshot_id) REFERENCES scenario_snapshots(snapshot_id)
            );
            CREATE INDEX IF NOT EXISTS idx_scenario_characters_snapshot ON scenario_characters(snapshot_id);
            CREATE INDEX IF NOT EXISTS idx_scenario_characters_name ON scenario_characters(character_name);
        `);

    // Scenario clues table - clues available in scenarios
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS scenario_clues (
                clue_id TEXT PRIMARY KEY,
                snapshot_id TEXT NOT NULL,
                clue_text TEXT NOT NULL,
                category TEXT NOT NULL, -- 'physical', 'witness', 'document', 'environment', 'knowledge', 'observation'
                difficulty TEXT NOT NULL, -- 'automatic', 'regular', 'hard', 'extreme'
                clue_location TEXT NOT NULL,
                discovery_method TEXT,
                reveals TEXT, -- JSON array
                discovered INTEGER DEFAULT 0,
                discovery_details TEXT, -- JSON blob with discoveredBy, discoveredAt, method
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (snapshot_id) REFERENCES scenario_snapshots(snapshot_id)
            );
            CREATE INDEX IF NOT EXISTS idx_scenario_clues_snapshot ON scenario_clues(snapshot_id);
            CREATE INDEX IF NOT EXISTS idx_scenario_clues_location ON scenario_clues(clue_location);
            CREATE INDEX IF NOT EXISTS idx_scenario_clues_discovered ON scenario_clues(discovered);
        `);

    // Scenario conditions table - environmental conditions
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS scenario_conditions (
                condition_id TEXT PRIMARY KEY,
                snapshot_id TEXT NOT NULL,
                condition_type TEXT NOT NULL, -- 'weather', 'lighting', 'sound', 'smell', 'temperature', 'other'
                description TEXT NOT NULL,
                mechanical_effect TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (snapshot_id) REFERENCES scenario_snapshots(snapshot_id)
            );
            CREATE INDEX IF NOT EXISTS idx_scenario_conditions_snapshot ON scenario_conditions(snapshot_id);
            CREATE INDEX IF NOT EXISTS idx_scenario_conditions_type ON scenario_conditions(condition_type);
        `);

    // Full-text search for scenarios
    this.db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS scenarios_fts USING fts5(
                scenario_id UNINDEXED,
                name,
                description,
                content='scenarios',
                content_rowid='rowid'
            );

            CREATE TRIGGER IF NOT EXISTS scenarios_fts_insert AFTER INSERT ON scenarios BEGIN
                INSERT INTO scenarios_fts(scenario_id, name, description)
                VALUES (new.scenario_id, new.name, new.description);
            END;

            CREATE TRIGGER IF NOT EXISTS scenarios_fts_delete AFTER DELETE ON scenarios BEGIN
                DELETE FROM scenarios_fts WHERE scenario_id = old.scenario_id;
            END;

            CREATE TRIGGER IF NOT EXISTS scenarios_fts_update AFTER UPDATE ON scenarios BEGIN
                DELETE FROM scenarios_fts WHERE scenario_id = old.scenario_id;
                INSERT INTO scenarios_fts(scenario_id, name, description)
                VALUES (new.scenario_id, new.name, new.description);
            END;
        `);

    // Module backgrounds table - for module/briefing level information
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS module_backgrounds (
                module_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                background TEXT,
                story_outline TEXT,
                module_notes TEXT,
                keeper_guidance TEXT,
                story_hook TEXT,
                module_limitations TEXT,
                tags TEXT, -- JSON array
                source TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
    // Backfill for module_limitations if table already existed
    try {
      if (!this.hasColumn("module_backgrounds", "module_limitations")) {
        this.db.exec(
          "ALTER TABLE module_backgrounds ADD COLUMN module_limitations TEXT;"
        );
      }
    } catch {
      // ignore if column already exists or cannot be added
    }

    // Full-text search for module backgrounds
    this.db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS module_backgrounds_fts USING fts5(
                module_id UNINDEXED,
                title,
                background,
                story_outline,
                module_notes,
                keeper_guidance,
                story_hook,
                module_limitations,
                content='module_backgrounds',
                content_rowid='rowid'
            );

            CREATE TRIGGER IF NOT EXISTS module_backgrounds_fts_insert AFTER INSERT ON module_backgrounds BEGIN
                INSERT INTO module_backgrounds_fts(module_id, title, background, story_outline, module_notes, keeper_guidance, story_hook, module_limitations)
                VALUES (new.module_id, new.title, new.background, new.story_outline, new.module_notes, new.keeper_guidance, new.story_hook, new.module_limitations);
            END;

            CREATE TRIGGER IF NOT EXISTS module_backgrounds_fts_delete AFTER DELETE ON module_backgrounds BEGIN
                DELETE FROM module_backgrounds_fts WHERE module_id = old.module_id;
            END;

            CREATE TRIGGER IF NOT EXISTS module_backgrounds_fts_update AFTER UPDATE ON module_backgrounds BEGIN
                DELETE FROM module_backgrounds_fts WHERE module_id = old.module_id;
                INSERT INTO module_backgrounds_fts(module_id, title, background, story_outline, module_notes, keeper_guidance, story_hook, module_limitations)
                VALUES (new.module_id, new.title, new.background, new.story_outline, new.module_notes, new.keeper_guidance, new.story_hook, new.module_limitations);
            END;
        `);
  }

  getDatabase(): DBInstance {
    return this.db;
  }

  close(): void {
    this.db.close();
  }

  // Execute a transaction
  transaction<T>(fn: () => T): T {
    const txn = this.db.transaction(fn);
    return txn();
  }
}
