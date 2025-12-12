/**
 * NPC Loader
 * Loads NPC data from documents and stores them in the database
 */

import { randomUUID } from "crypto";
import fs from "fs";
import type { CoCDatabase } from "../database/schema.js";
import type {
  CharacterAttributes,
  CharacterStatus,
  NPCClue,
  NPCProfile,
  NPCRelationship,
  ParsedNPCData,
} from "../models/gameTypes.js";
import { NPCDocumentParser } from "./npcDocumentParser.js";

/**
 * Default attributes for NPCs when not specified
 */
const DEFAULT_ATTRIBUTES: CharacterAttributes = {
  STR: 50,
  CON: 50,
  DEX: 50,
  APP: 50,
  POW: 50,
  SIZ: 50,
  INT: 50,
  EDU: 50,
};

/**
 * Calculate default status from attributes
 */
function calculateDefaultStatus(
  attributes: CharacterAttributes
): CharacterStatus {
  const hp = Math.floor((attributes.CON + attributes.SIZ) / 10);
  const maxSanity = attributes.POW * 5;
  const mp = Math.floor(attributes.POW / 5);

  return {
    hp,
    maxHp: hp,
    sanity: maxSanity,
    maxSanity,
    luck: 50,
    mp,
    conditions: [],
  };
}

/**
 * NPC Loader class
 */
export class NPCLoader {
  private db: CoCDatabase;
  private parser: NPCDocumentParser;

  constructor(db: CoCDatabase, parser?: NPCDocumentParser) {
    this.db = db;
    this.parser = parser || new NPCDocumentParser();
  }

  /**
   * Load NPCs from a directory
   */
  async loadNPCsFromDirectory(dirPath: string): Promise<NPCProfile[]> {
    console.log(`\n=== Loading NPCs from directory: ${dirPath} ===`);

    if (!fs.existsSync(dirPath)) {
      console.log(`Directory does not exist, creating: ${dirPath}`);
      fs.mkdirSync(dirPath, { recursive: true });
      return [];
    }

    // Parse all documents in the directory
    const parsedNPCs = await this.parser.parseDirectory(dirPath);

    if (parsedNPCs.length === 0) {
      console.log("No NPC documents found in directory.");
      return [];
    }

    // Convert and store each NPC
    const npcProfiles: NPCProfile[] = [];
    for (const parsedData of parsedNPCs) {
      try {
        const npcProfile = this.convertToNPCProfile(parsedData);
        this.saveNPCToDatabase(npcProfile);
        npcProfiles.push(npcProfile);
        console.log(`✓ Loaded NPC: ${npcProfile.name} (${npcProfile.id})`);
      } catch (error) {
        console.error(`✗ Failed to load NPC ${parsedData.name}:`, error);
      }
    }

    console.log(`\n=== Successfully loaded ${npcProfiles.length} NPCs ===\n`);
    return npcProfiles;
  }

  /**
   * Convert ParsedNPCData to NPCProfile
   */
  private convertToNPCProfile(parsedData: ParsedNPCData): NPCProfile {
    const npcId = this.generateNPCId(parsedData.name);

    // Merge attributes with defaults
    const attributes: CharacterAttributes = {
      ...DEFAULT_ATTRIBUTES,
      ...parsedData.attributes,
    };

    // Calculate or use provided status
    const defaultStatus = calculateDefaultStatus(attributes);
    const status: CharacterStatus = {
      ...defaultStatus,
      ...parsedData.status,
    };

    // Convert clues
    const clues: NPCClue[] = (parsedData.clues || []).map((clue, index) => ({
      id: `${npcId}-clue-${index}`,
      clueText: clue.clueText,
      category: clue.category,
      difficulty: clue.difficulty,
      revealed: false,
      relatedTo: clue.relatedTo,
    }));

    // Convert relationships
    const relationships: NPCRelationship[] = (
      parsedData.relationships || []
    ).map((rel, index) => ({
      targetId: `${rel.targetName.toLowerCase().replace(/\s+/g, "-")}`,
      targetName: rel.targetName,
      relationshipType: rel.relationshipType,
      attitude: rel.attitude,
      description: rel.description,
      history: rel.history,
    }));

    const npcProfile: NPCProfile = {
      id: npcId,
      name: parsedData.name,
      attributes,
      status,
      inventory: parsedData.inventory || [],
      skills: parsedData.skills || {},
      notes: parsedData.notes,
      occupation: parsedData.occupation,
      age: parsedData.age,
      appearance: parsedData.appearance,
      personality: parsedData.personality,
      background: parsedData.background,
      goals: parsedData.goals || [],
      secrets: parsedData.secrets || [],
      clues,
      relationships,
      isNPC: true,
    };

    return npcProfile;
  }

  /**
   * Generate a unique ID for an NPC based on their name
   */
  private generateNPCId(name: string): string {
    return `npc-${name.toLowerCase().replace(/\s+/g, "-")}-${randomUUID().slice(0, 8)}`;
  }

  /**
   * Save NPC to database
   */
  private saveNPCToDatabase(npc: NPCProfile): void {
    const database = this.db.getDatabase();

    this.db.transaction(() => {
      // Insert or update character
      const stmt = database.prepare(`
                INSERT OR REPLACE INTO characters (
                    character_id, name, attributes, status, inventory, skills, notes,
                    is_npc, occupation, age, appearance, personality, background, goals, secrets,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);

      stmt.run(
        npc.id,
        npc.name,
        JSON.stringify(npc.attributes),
        JSON.stringify(npc.status),
        JSON.stringify(npc.inventory),
        JSON.stringify(npc.skills),
        npc.notes || null,
        1, // is_npc = true
        npc.occupation || null,
        npc.age || null,
        npc.appearance || null,
        npc.personality || null,
        npc.background || null,
        JSON.stringify(npc.goals),
        JSON.stringify(npc.secrets)
      );

      // Delete existing clues and relationships for this NPC
      database.prepare("DELETE FROM npc_clues WHERE npc_id = ?").run(npc.id);
      database
        .prepare("DELETE FROM npc_relationships WHERE source_id = ?")
        .run(npc.id);

      // Insert clues
      if (npc.clues.length > 0) {
        const clueStmt = database.prepare(`
                    INSERT INTO npc_clues (
                        id, npc_id, clue_text, category, difficulty, revealed, related_to
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `);

        for (const clue of npc.clues) {
          clueStmt.run(
            clue.id,
            npc.id,
            clue.clueText,
            clue.category || null,
            clue.difficulty || null,
            clue.revealed ? 1 : 0,
            clue.relatedTo ? JSON.stringify(clue.relatedTo) : null
          );
        }
      }

      // Insert relationships
      if (npc.relationships.length > 0) {
        const relStmt = database.prepare(`
                    INSERT INTO npc_relationships (
                        id, source_id, target_id, target_name, relationship_type, attitude, description, history
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);

        for (const rel of npc.relationships) {
          const relId = `${npc.id}-rel-${rel.targetId}`;
          relStmt.run(
            relId,
            npc.id,
            rel.targetId,
            rel.targetName,
            rel.relationshipType,
            rel.attitude,
            rel.description || null,
            rel.history || null
          );
        }
      }
    });
  }

  /**
   * Get an NPC from the database by ID
   */
  getNPCById(npcId: string): NPCProfile | null {
    const database = this.db.getDatabase();

    // Get character data
    const character = database
      .prepare(`
            SELECT * FROM characters WHERE character_id = ? AND is_npc = 1
        `)
      .get(npcId) as any;

    if (!character) {
      return null;
    }

    // Get clues
    const clues = database
      .prepare(`
            SELECT * FROM npc_clues WHERE npc_id = ?
        `)
      .all(npcId) as any[];

    // Get relationships
    const relationships = database
      .prepare(`
            SELECT * FROM npc_relationships WHERE source_id = ?
        `)
      .all(npcId) as any[];

    // Build NPC profile
    const npcProfile: NPCProfile = {
      id: character.character_id,
      name: character.name,
      attributes: JSON.parse(character.attributes),
      status: JSON.parse(character.status),
      inventory: JSON.parse(character.inventory || "[]"),
      skills: JSON.parse(character.skills || "{}"),
      notes: character.notes,
      occupation: character.occupation,
      age: character.age,
      appearance: character.appearance,
      personality: character.personality,
      background: character.background,
      goals: JSON.parse(character.goals || "[]"),
      secrets: JSON.parse(character.secrets || "[]"),
      clues: clues.map((c) => ({
        id: c.id,
        clueText: c.clue_text,
        category: c.category,
        difficulty: c.difficulty,
        revealed: c.revealed === 1,
        relatedTo: c.related_to ? JSON.parse(c.related_to) : undefined,
      })),
      relationships: relationships.map((r) => ({
        targetId: r.target_id,
        targetName: r.target_name,
        relationshipType: r.relationship_type,
        attitude: r.attitude,
        description: r.description,
        history: r.history,
      })),
      isNPC: true,
    };

    return npcProfile;
  }

  /**
   * Get all NPCs from the database
   */
  getAllNPCs(): NPCProfile[] {
    const database = this.db.getDatabase();

    const characters = database
      .prepare(`
            SELECT character_id FROM characters WHERE is_npc = 1
        `)
      .all() as any[];

    return characters
      .map((c) => this.getNPCById(c.character_id))
      .filter((npc) => npc !== null) as NPCProfile[];
  }

  /**
   * Check if NPC already exists in database
   */
  npcExists(npcId: string): boolean {
    const database = this.db.getDatabase();
    const result = database
      .prepare(`
            SELECT COUNT(*) as count FROM characters WHERE character_id = ? AND is_npc = 1
        `)
      .get(npcId) as any;
    return result.count > 0;
  }
}
