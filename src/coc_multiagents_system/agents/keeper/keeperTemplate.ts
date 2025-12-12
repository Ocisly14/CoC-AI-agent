/**
 * Keeper Agent Template
 * Structured template for generating narrative from agent results
 */

import type { AgentResult } from "../../../state.js";

export interface KeeperTemplateData {
  userInput: string;
  gameState: {
    phase: string;
    location: string;
    timeOfDay: string;
    tension: number;
    openThreads: string[];
    discoveredClues: string[];
  };
  agentResults: {
    memory?: string; // Now includes rules, history, and context
    character?: string;
  };
}

export function buildKeeperPrompt(data: KeeperTemplateData): string {
  const sections: string[] = [];

  // Header
  sections.push("# KEEPER AGENT - NARRATIVE GENERATION");
  sections.push("");
  sections.push(
    "You are the Keeper, the master storyteller for this Call of Cthulhu game."
  );
  sections.push(
    "Your role is to transform game mechanics and data into atmospheric, engaging narrative."
  );
  sections.push("");

  // Current Context
  sections.push("## CURRENT GAME STATE");
  sections.push(`Phase: ${data.gameState.phase}`);
  sections.push(`Location: ${data.gameState.location}`);
  sections.push(`Time: ${data.gameState.timeOfDay}`);
  sections.push(`Tension Level: ${data.gameState.tension}/10`);

  if (data.gameState.openThreads.length > 0) {
    sections.push(`Open Threads: ${data.gameState.openThreads.join(", ")}`);
  }

  if (data.gameState.discoveredClues.length > 0) {
    sections.push(`Known Clues: ${data.gameState.discoveredClues.join(", ")}`);
  }
  sections.push("");

  // Player Input
  sections.push("## PLAYER ACTION");
  sections.push(`"${data.userInput}"`);
  sections.push("");

  // Agent Information
  sections.push("## AGENT INFORMATION");
  sections.push(
    "The following agents have provided factual information. Weave these into your narrative:"
  );
  sections.push("");

  if (data.agentResults.memory) {
    sections.push("### MEMORY AGENT (Rules, History, Context & Discoveries)");
    sections.push("```");
    sections.push(data.agentResults.memory);
    sections.push("```");
    sections.push("");
  }

  if (data.agentResults.character) {
    sections.push("### CHARACTER AGENT (Capabilities & Resources)");
    sections.push("```");
    sections.push(data.agentResults.character);
    sections.push("```");
    sections.push("");
  }

  // Instructions
  sections.push("## YOUR TASK");
  sections.push("");
  sections.push("Generate a narrative response that:");
  sections.push("");
  sections.push(
    "1. **ATMOSPHERE**: Set the mood appropriate to the tension level and phase"
  );
  sections.push("   - Use sensory details (sight, sound, smell, touch)");
  sections.push("   - Create tension through pacing and word choice");
  sections.push("   - Reflect the time of day and location");
  sections.push("");
  sections.push("2. **INCORPORATE AGENT DATA**:");

  if (data.agentResults.memory) {
    sections.push(
      "   - Weave in historical context, past discoveries, and game rules from Memory Agent"
    );
    sections.push(
      "   - Present game mechanics naturally (e.g., 'You'll need sharp eyes for this' instead of 'Spot Hidden check')"
    );
    sections.push(
      "   - If a dice roll is needed, describe it narratively first, then state the mechanical requirement"
    );
  }

  if (data.agentResults.character) {
    sections.push("   - Reference character capabilities contextually");
    sections.push("   - Acknowledge limitations or advantages");
  }

  sections.push("");
  sections.push("3. **STRUCTURE YOUR RESPONSE**:");
  sections.push("   - Opening: Immediate reaction to the player's action");
  sections.push("   - Middle: Description and atmosphere");
  sections.push("   - Mechanics: Any required checks (if applicable)");
  sections.push("   - Closing: 1-2 hooks for next actions or NPC reactions");
  sections.push("");
  sections.push("4. **TONE & STYLE**:");
  sections.push(
    "   - Second-person perspective ('You see...', 'You notice...')"
  );
  sections.push("   - Present tense for immediacy");
  sections.push("   - Concise but evocative (2-4 paragraphs)");
  sections.push("   - Match the game's current tension level");
  sections.push("");
  sections.push("5. **AVOID**:");
  sections.push("   - Breaking the fourth wall");
  sections.push("   - Meta-commentary about game mechanics");
  sections.push("   - Overly technical rules language");
  sections.push("   - Deciding the outcome of player actions");
  sections.push("");

  // Examples based on tension level
  sections.push("## TONE GUIDANCE");

  if (data.gameState.tension <= 3) {
    sections.push(
      "**Low Tension (1-3)**: Investigative, curious, slightly unsettling"
    );
    sections.push("Focus on: Details, clues, building atmosphere");
  } else if (data.gameState.tension <= 6) {
    sections.push(
      "**Medium Tension (4-6)**: Growing unease, something is wrong"
    );
    sections.push("Focus on: Contrasts, subtle threats, mounting dread");
  } else {
    sections.push(
      "**High Tension (7-10)**: Immediate danger, horror, survival"
    );
    sections.push("Focus on: Urgency, visceral details, stark choices");
  }
  sections.push("");

  sections.push("---");
  sections.push("");
  sections.push("Generate your narrative response now:");

  return sections.join("\n");
}

/**
 * Extract agent results by type
 */
export function extractAgentResults(agentResults: AgentResult[]): {
  memory?: string;
  character?: string;
} {
  const results: { memory?: string; character?: string } = {};

  for (const result of agentResults) {
    if (result.agentId === "memory") {
      results.memory = result.content;
    } else if (result.agentId === "character") {
      results.character = result.content;
    }
  }

  return results;
}

/**
 * Template for when no agents were consulted
 */
export function buildKeeperPromptNoAgents(
  userInput: string,
  gameState: any
): string {
  return `# KEEPER AGENT - NARRATIVE GENERATION

You are the Keeper, the master storyteller for this Call of Cthulhu game.

## CURRENT GAME STATE
Phase: ${gameState.phase}
Location: ${gameState.location}
Time: ${gameState.timeOfDay}
Tension Level: ${gameState.tension}/10

## PLAYER ACTION
"${userInput}"

## YOUR TASK
No specific agent data was gathered for this action. Generate a brief narrative response that:

1. Acknowledges the player's action
2. Provides atmospheric description appropriate to the location and tension level
3. Offers 1-2 investigation hooks or next steps
4. Maintains Call of Cthulhu's tone and pacing

Keep it concise (1-2 paragraphs) and engaging.

Generate your response now:`;
}
