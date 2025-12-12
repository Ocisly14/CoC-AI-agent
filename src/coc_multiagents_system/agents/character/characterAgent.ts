import Database from 'better-sqlite3';
type DBInstance = InstanceType<typeof Database>;
import { CoCDatabase } from '../../shared/database/schema.js';
import {
    CharacterAttributes,
    CharacterProfile,
    CharacterStatus
} from '../../shared/models/gameTypes.js';

type CharacterRow = {
    character_id: string;
    name: string;
    attributes: string;
    status: string;
    inventory: string | null;
    skills: string | null;
    notes: string | null;
    updated_at: string;
};

/**
 * Character Agent data layer
 * Persists investigator attributes, vitals, and inventory
 */
export class CharacterAgent {
    private db: DBInstance;

    constructor(cocDB: CoCDatabase) {
        this.db = cocDB.getDatabase();
    }

    /**
     * Upsert a full character profile
     */
    public upsertCharacter(profile: CharacterProfile): CharacterProfile {
        const now = new Date().toISOString();

        this.db.prepare(`
            INSERT INTO characters (character_id, name, attributes, status, inventory, notes, updated_at)
            VALUES (@character_id, @name, @attributes, @status, @inventory, @notes, @updated_at)
            ON CONFLICT(character_id) DO UPDATE SET
                name=excluded.name,
                attributes=excluded.attributes,
                status=excluded.status,
                inventory=excluded.inventory,
                notes=excluded.notes,
                updated_at=excluded.updated_at
        `).run({
            character_id: profile.id,
            name: profile.name,
            attributes: JSON.stringify(profile.attributes),
            status: JSON.stringify(profile.status),
            inventory: JSON.stringify(profile.inventory ?? []),
            skills: JSON.stringify(profile.skills ?? {}),
            notes: profile.notes ?? null,
            updated_at: now
        });

        return { ...profile };
    }

    /**
     * Fetch a character by ID
     */
    public getCharacter(characterId: string): CharacterProfile | null {
        const row = this.db.prepare(`
            SELECT * FROM characters WHERE character_id = ?
        `).get(characterId) as CharacterRow | undefined;

        return row ? this.rowToProfile(row) : null;
    }

    /**
     * Merge and persist attribute updates (e.g., STR/DEX changes)
     */
    public updateAttributes(characterId: string, updates: Partial<CharacterAttributes>): CharacterProfile {
        const existing = this.getOrCreate(characterId);
        const mergedAttributes = { ...existing.attributes, ...updates } as CharacterAttributes;
        return this.upsertCharacter({ ...existing, attributes: mergedAttributes });
    }

    /**
     * Merge and persist status updates (HP/Sanity/Luck/conditions)
     */
    public updateStatus(characterId: string, updates: Partial<CharacterStatus>): CharacterProfile {
        const existing = this.getOrCreate(characterId);
        const mergedStatus = { ...existing.status, ...updates };
        return this.upsertCharacter({ ...existing, status: mergedStatus });
    }

    /**
     * Set or replace the inventory list
     */
    public setInventory(characterId: string, items: string[]): CharacterProfile {
        const existing = this.getOrCreate(characterId);
        return this.upsertCharacter({ ...existing, inventory: items });
    }

    /**
     * Return a concise textual summary for prompts
     */
    public summarizeProfile(profile: CharacterProfile): string {
        const attrs = Object.entries(profile.attributes)
            .map(([k, v]) => `${k}:${v}`)
            .join(', ');

        const statusParts = [
            `HP ${profile.status.hp}/${profile.status.maxHp}`,
            `Sanity ${profile.status.sanity}/${profile.status.maxSanity}`,
            `Luck ${profile.status.luck}`,
            profile.status.mp !== undefined ? `MP ${profile.status.mp}` : null,
        ].filter(Boolean);

        const conditions = profile.status.conditions?.length
            ? `Conditions: ${profile.status.conditions.join(', ')}`
            : 'Conditions: none';

        const items = profile.inventory.length ? profile.inventory.join(', ') : 'Empty';

        return [
            `${profile.name} (${profile.id})`,
            `Attributes: ${attrs}`,
            `Status: ${statusParts.join(' | ')}`,
            conditions,
            `Inventory: ${items}`,
        ].join('\n');
    }

    /**
     * Ensure a profile exists (returns current or creates a stub)
     */
    public getOrCreate(characterId: string, fallback?: CharacterProfile): CharacterProfile {
        const existing = this.getCharacter(characterId);
        if (existing) return existing;

        const stub = fallback ?? this.buildDefaultProfile(characterId);
        return this.upsertCharacter(stub);
    }

    private rowToProfile(row: CharacterRow): CharacterProfile {
        return {
            id: row.character_id,
            name: row.name,
            attributes: JSON.parse(row.attributes),
            status: JSON.parse(row.status),
            inventory: row.inventory ? JSON.parse(row.inventory) : [],
            skills: row.skills ? JSON.parse(row.skills) : {},
            notes: row.notes ?? undefined
        };
    }

    private buildDefaultProfile(characterId: string): CharacterProfile {
        return {
            id: characterId,
            name: 'Investigator',
            attributes: {
                STR: 50,
                CON: 50,
                DEX: 50,
                APP: 50,
                POW: 50,
                SIZ: 50,
                INT: 50,
                EDU: 50,
            },
            status: {
                hp: 10,
                maxHp: 10,
                sanity: 60,
                maxSanity: 99,
                luck: 50,
                mp: 10,
                conditions: [],
                notes: 'New investigator'
            },
            inventory: [],
            skills: {
                "Spot Hidden": 25,
                "Listen": 20,
                "Library Use": 20,
                "Fighting (Brawl)": 25,
                "Dodge": 25,
                "Firearms (Handgun)": 20,
            },
            notes: 'Auto-created placeholder profile'
        };
    }
}
