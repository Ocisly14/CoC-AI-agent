/**
 * Shared utility functions for agents
 */

import { BaseMessage } from "@langchain/core/messages";
import { GameState, AgentId } from "./state.js";

/**
 * Convert various content types to string
 */
export const contentToString = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");
  }
  return JSON.stringify(content, null, 2);
};

/**
 * Extract the latest human message from message history
 */
export const latestHumanMessage = (messages: BaseMessage[]): string => {
  const reversed = [...messages].reverse();
  const human = reversed.find(
    (message) => (message as any)._getType?.() === "human" || (message as any).type === "human",
  );
  return human ? contentToString(human.content) : "";
};

/**
 * Format game state as a summary string
 */
export const formatGameState = (gameState: GameState): string => {
  const threads = gameState.openThreads.length
    ? gameState.openThreads.join("; ")
    : "None";
  const clues = gameState.discoveredClues.length
    ? gameState.discoveredClues.join("; ")
    : "None";

  const characterStatus = gameState.playerCharacter
    ? `PC ${gameState.playerCharacter.name} (HP ${gameState.playerCharacter.status.hp}/${gameState.playerCharacter.status.maxHp}, Sanity ${gameState.playerCharacter.status.sanity}/${gameState.playerCharacter.status.maxSanity}, Luck ${gameState.playerCharacter.status.luck})`
    : "PC: none";

  const npcCharacters = gameState.npcCharacters.length
    ? `${gameState.npcCharacters.length} NPCs tracked`
    : "No NPCs tracked";

  return [
    `Phase: ${gameState.phase}`,
    `Location: ${gameState.location}`,
    `Time: ${gameState.timeOfDay}`,
    `Tension: ${gameState.tension}/10`,
    `Threads: ${threads}`,
    `Clues: ${clues}`,
    characterStatus,
    npcCharacters
  ].join(" | ");
};

/**
 * Type guard for AgentId
 */
export const isAgentId = (value: string): value is AgentId =>
  ["character", "memory", "action"].includes(value);
