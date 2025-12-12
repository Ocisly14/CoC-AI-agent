/**
 * Character Agent Manifest
 * Describes capabilities and usage for the Character Agent
 */

import { AgentManifest } from '../../shared/models/agentTypes.js';

export const CHARACTER_AGENT_MANIFEST: AgentManifest = {
    agentId: 'character',
    agentName: 'Character Agent',
    version: '1.0.0',
    description: 'Player character management and state tracking',
    purpose: 'Maintains character sheets, tracks inventory and equipment, manages character progression, enforces character limitations',
    capabilities: [
        {
            name: 'loadCharacter',
            description: 'Loads a character by ID into active session',
            parameters: [
                { name: 'characterId', type: 'string', description: 'Unique character identifier', required: true }
            ],
            returns: 'PlayerCharacter object with full character data'
        },
        {
            name: 'updateStat',
            description: 'Updates a character statistic (HP, Sanity, skill, etc.)',
            parameters: [
                { name: 'characterId', type: 'string', description: 'Character to update', required: true },
                { name: 'stat', type: 'string', description: 'Stat name (e.g., "hp", "sanity", "Spot Hidden")', required: true },
                { name: 'value', type: 'number', description: 'New value', required: true }
            ],
            returns: 'Updated character object'
        },
        {
            name: 'addItem',
            description: 'Adds item to character inventory',
            parameters: [
                { name: 'characterId', type: 'string', description: 'Character ID', required: true },
                { name: 'item', type: 'string', description: 'Item name or description', required: true }
            ],
            returns: 'Updated inventory'
        },
        {
            name: 'removeItem',
            description: 'Removes item from character inventory',
            parameters: [
                { name: 'characterId', type: 'string', description: 'Character ID', required: true },
                { name: 'item', type: 'string', description: 'Item to remove', required: true }
            ],
            returns: 'Updated inventory'
        },
        {
            name: 'getAvailableActions',
            description: 'Returns list of actions character can perform based on skills and equipment',
            parameters: [
                { name: 'characterId', type: 'string', description: 'Character ID', required: true },
                { name: 'context', type: 'any', description: 'Current situation context', required: false }
            ],
            returns: 'Array of available action descriptions'
        },
        {
            name: 'applyDamage',
            description: 'Applies damage to character, checks for wounds and dying',
            parameters: [
                { name: 'characterId', type: 'string', description: 'Character taking damage', required: true },
                { name: 'damage', type: 'number', description: 'Amount of damage', required: true }
            ],
            returns: 'Updated character with wound status'
        },
        {
            name: 'addExperience',
            description: 'Awards experience points for skill improvement',
            parameters: [
                { name: 'characterId', type: 'string', description: 'Character ID', required: true },
                { name: 'skill', type: 'string', description: 'Skill that improved', required: true }
            ],
            returns: 'Updated character'
        }
    ],
    whenToUse: [
        'When checking if character has an item or skill',
        'When updating character HP, Sanity, or other stats',
        'When applying damage or healing',
        'When character gains or loses items',
        'When checking character capabilities',
        'During character progression and skill improvement'
    ],
    whenNotToUse: [
        'For rolling dice (use Rule Agent)',
        'For generating narrative (use Keeper Agent)'
    ]
};
