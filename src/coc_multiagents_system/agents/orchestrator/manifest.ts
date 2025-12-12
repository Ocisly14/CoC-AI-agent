/**
 * Orchestrator Agent Manifest
 * Describes capabilities and usage for the Orchestrator Agent
 */

import type { AgentManifest } from "../models/agentTypes.js";

export const ORCHESTRATOR_MANIFEST: AgentManifest = {
  agentId: "orchestrator",
  agentName: "Orchestrator Agent",
  version: "1.0.0",
  description: "Central coordinator and router for all game activities",
  purpose:
    "Manages game flow, routes player input to appropriate agents, coordinates multi-agent responses",
  capabilities: [
    {
      name: "processPlayerInput",
      description:
        "Main entry point for processing player actions and commands",
      parameters: [
        {
          name: "playerId",
          type: "string",
          description: "ID of the player performing the action",
          required: true,
        },
        {
          name: "inputText",
          type: "string",
          description: "The player's input text",
          required: true,
        },
      ],
      returns:
        "OrchestratorResponse with narration, dice results, and state changes",
      examples: [
        'Player: "I examine the ancient tome"',
        'Player: "I talk to the librarian"',
        'Player: "I attack the cultist"',
      ],
    },
    {
      name: "classifyIntent",
      description:
        "Analyzes player input to determine intent type (action, dialogue, investigation, meta)",
      parameters: [
        {
          name: "inputText",
          type: "string",
          description: "Raw player input",
          required: true,
        },
      ],
      returns: "PlayerIntent object with type and metadata",
    },
    {
      name: "transitionPhase",
      description:
        "Changes game phase (intro, investigation, confrontation, downtime)",
      parameters: [
        {
          name: "newPhase",
          type: "string",
          description: "Target game phase",
          required: true,
        },
      ],
      returns: "void",
    },
    {
      name: "changeLocation",
      description: "Moves party to a new location",
      parameters: [
        {
          name: "location",
          type: "string",
          description: "Name of new location",
          required: true,
        },
      ],
      returns: "void",
    },
  ],
  whenToUse: [
    "Always - this is the main entry point",
    "When coordinating multiple agents",
    "When managing game state transitions",
  ],
};
