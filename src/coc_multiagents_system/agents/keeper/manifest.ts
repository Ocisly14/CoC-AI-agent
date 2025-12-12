/**
 * Keeper Agent Manifest
 * Describes capabilities and usage for the Keeper Agent
 */

import { AgentManifest } from '../../shared/models/agentTypes.js';

export const KEEPER_AGENT_MANIFEST: AgentManifest = {
    agentId: 'keeper',
    agentName: 'Keeper Agent',
    version: '1.0.0',
    description: 'Narrative director and world master',
    purpose: 'Creates atmospheric descriptions, portrays NPCs, designs scenarios, manages clues, builds tension, improvises responses',
    capabilities: [
        {
            name: 'narrateScene',
            description: 'Generates atmospheric narration for a scene',
            parameters: [
                { name: 'location', type: 'string', description: 'Current location', required: true },
                { name: 'context', type: 'any', description: 'Recent events and situation', required: true },
                { name: 'mood', type: 'string', description: 'Desired atmosphere (mysterious, tense, calm, etc.)', required: false }
            ],
            returns: 'Atmospheric scene description',
            examples: [
                'Describe entering an abandoned library',
                'Describe a tense confrontation in a dark alley',
                'Describe peaceful downtime at the hotel'
            ]
        },
        {
            name: 'portrayNPC',
            description: 'Generates NPC dialogue and behavior',
            parameters: [
                { name: 'npcId', type: 'string', description: 'NPC identifier', required: true },
                { name: 'playerInput', type: 'string', description: 'What player said/did', required: true },
                { name: 'context', type: 'any', description: 'Current situation', required: true }
            ],
            returns: 'NPC response with dialogue and actions',
            examples: [
                'Librarian responds to questions about the book',
                'Cultist reacts to being discovered',
                'Professor shares cryptic knowledge'
            ]
        },
        {
            name: 'revealClue',
            description: 'Describes a discovered clue based on investigation method',
            parameters: [
                { name: 'clueId', type: 'string', description: 'Clue identifier', required: true },
                { name: 'discoveryMethod', type: 'string', description: 'How it was found (Spot Hidden, Library Use, etc.)', required: true }
            ],
            returns: 'Clue description tailored to discovery method'
        },
        {
            name: 'escalateTension',
            description: 'Increases horror and tension through events',
            parameters: [
                { name: 'currentLevel', type: 'number', description: 'Current tension level (0-10)', required: true }
            ],
            returns: 'Horror event description'
        },
        {
            name: 'generateMystery',
            description: 'Creates an investigation scenario',
            parameters: [
                { name: 'theme', type: 'string', description: 'Mystery theme', required: true },
                { name: 'difficulty', type: 'string', description: 'Scenario difficulty', required: false }
            ],
            returns: 'Complete scenario with clues, NPCs, and resolution'
        },
        {
            name: 'improviseResponse',
            description: 'Creates response to unexpected player action',
            parameters: [
                { name: 'playerAction', type: 'string', description: 'Unexpected action taken', required: true },
                { name: 'context', type: 'any', description: 'Current game state', required: true }
            ],
            returns: 'Narrative outcome of the action'
        }
    ],
    dependencies: ['Rule Agent (for rule queries and explanations)'],
    whenToUse: [
        'When describing locations, scenes, or atmosphere',
        'When players interact with NPCs',
        'When revealing investigation clues',
        'When building horror and tension',
        'When improvising responses to unexpected actions',
        'When generating scenario content'
    ],
    whenNotToUse: [
        'For mechanical resolution (use Rule Agent)',
        'For updating character stats (use Character Agent)',
        'For logging events (use Memory Agent)'
    ]
};
