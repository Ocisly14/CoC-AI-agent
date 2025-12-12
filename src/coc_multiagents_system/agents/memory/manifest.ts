/**
 * Memory Agent Manifest
 * Describes capabilities and usage for the Memory Agent
 */

import type { AgentManifest } from "../../shared/models/agentTypes.js";

export const MEMORY_AGENT_MANIFEST: AgentManifest = {
  agentId: "memory",
  agentName: "Memory Agent",
  version: "1.0.0",
  description: "Session historian and context manager",
  purpose:
    "Records game events, maintains searchable history, tracks discoveries, manages relationships, provides context for decisions",
  capabilities: [
    {
      name: "logEvent",
      description: "Records a game event to permanent log",
      parameters: [
        {
          name: "eventType",
          type: "string",
          description:
            "Type of event (narration, action, roll, combat, dialogue, discovery)",
          required: true,
        },
        {
          name: "details",
          type: "any",
          description: "Event details",
          required: true,
        },
        {
          name: "timestamp",
          type: "Date",
          description: "When event occurred",
          required: true,
        },
      ],
      returns: "Event ID",
    },
    {
      name: "queryHistory",
      description: "Searches game history by filters",
      parameters: [
        {
          name: "query",
          type: "string",
          description: "Search query",
          required: true,
        },
        {
          name: "filters",
          type: "any",
          description: "Event type, time range, etc.",
          required: false,
        },
      ],
      returns: "Array of matching events",
    },
    {
      name: "getContext",
      description: "Retrieves relevant context for decision-making",
      parameters: [
        {
          name: "depth",
          type: "string",
          description: "Context depth: recent, session, or campaign",
          required: true,
        },
      ],
      returns: "Contextual information from history",
      examples: [
        "Get last 10 events for immediate context",
        "Get session summary",
        "Get full campaign timeline",
      ],
    },
    {
      name: "getSessionSummary",
      description: "Generates summary of a game session",
      parameters: [
        {
          name: "sessionId",
          type: "string",
          description: "Session to summarize",
          required: true,
        },
      ],
      returns: "Formatted session summary",
    },
    {
      name: "trackRelationship",
      description: "Updates NPC relationship with character",
      parameters: [
        {
          name: "characterId",
          type: "string",
          description: "Character ID",
          required: true,
        },
        {
          name: "npcId",
          type: "string",
          description: "NPC ID",
          required: true,
        },
        {
          name: "change",
          type: "number",
          description: "Relationship change (-10 to +10)",
          required: true,
        },
      ],
      returns: "New relationship status",
    },
    {
      name: "recordDiscovery",
      description: "Records a clue or information discovery",
      parameters: [
        {
          name: "clueId",
          type: "string",
          description: "Clue identifier",
          required: true,
        },
        {
          name: "discoverer",
          type: "string",
          description: "Character who found it",
          required: true,
        },
        {
          name: "method",
          type: "string",
          description: "How it was discovered",
          required: true,
        },
      ],
      returns: "Logged discovery record",
    },
    {
      name: "searchLogs",
      description: "Full-text search through all logs",
      parameters: [
        {
          name: "keyword",
          type: "string",
          description: "Search term",
          required: true,
        },
      ],
      returns: "Matching log entries",
    },
  ],
  whenToUse: [
    "After every significant game event",
    "When providing context to other agents",
    'When player asks "What happened earlier?"',
    "When tracking discoveries and clues",
    "When managing NPC relationships",
    "When generating session summaries",
  ],
  whenNotToUse: [
    "For real-time game mechanics (use Rule Agent)",
    "For narrative generation (use Keeper Agent)",
  ],
};
