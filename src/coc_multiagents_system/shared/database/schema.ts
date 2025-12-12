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
