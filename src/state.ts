import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type { CharacterProfile } from "./coc_multiagents_system/agents/models/gameTypes.js";

export type AgentId = "character" | "memory" | "action"; // keeper is no longer in queue, rule merged into memory

export type Phase = "intro" | "investigation" | "confrontation" | "downtime";

export interface GameState {
  sessionId: string;
  phase: Phase;
  location: string;
  timeOfDay: string;
  tension: number;
  openThreads: string[];
  discoveredClues: string[];
  playerCharacter: CharacterProfile;
  npcCharacters: CharacterProfile[];
}

const defaultPlayerCharacter: CharacterProfile = {
  id: "investigator-1",
  name: "Investigator",
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
  },
  inventory: [],
  skills: {
    "Spot Hidden": 25,
    Listen: 20,
    "Library Use": 20,
    "Fighting (Brawl)": 25,
    Dodge: 25,
    "Firearms (Handgun)": 20,
  },
  notes: "Auto-generated placeholder character",
};

export const initialGameState: GameState = {
  sessionId: "session-local",
  phase: "intro",
  location: "Unknown",
  timeOfDay: "Evening",
  tension: 1,
  openThreads: [],
  discoveredClues: [],
  playerCharacter: defaultPlayerCharacter,
  npcCharacters: [],
};

export interface AgentResult {
  agentId: AgentId;
  content: string;
  timestamp: Date;
  metadata?: any;
}

export const CoCGraphState = Annotation.Root({
  ...MessagesAnnotation.spec,
  agentQueue: Annotation<AgentId[]>({
    default: () => [] as AgentId[],
    reducer: (_current, update) => update ?? [],
  }),
  nextAgent: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_current, update) => update,
  }),
  routingNotes: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_current, update) => update,
  }),
  gameState: Annotation<GameState>({
    default: () => initialGameState,
    reducer: (_current, update) => update ?? initialGameState,
  }),
  agentResults: Annotation<AgentResult[]>({
    default: () => [] as AgentResult[],
    reducer: (current, update) => {
      if (!update) return current;
      return [...current, ...update];
    },
  }),
  allAgentsCompleted: Annotation<boolean>({
    default: () => false,
    reducer: (_current, update) => update ?? false,
  }),
});

export type CoCState = typeof CoCGraphState.State;
