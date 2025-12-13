/**
 * Memory Agent - Intelligent memory management with LLM-guided function selection
 * This is the actual agent that uses MemoryUtils and GameState to provide intelligent memory services
 */

export const MEMORY_AGENT_FUNCTION_CATEGORIES = {
  // NPC Data Query
  NPC_DATA: {
    category: "NPC Data",
    description: "Query NPC character information",
    functions: [
      {
        name: "findCharactersByNames",
        description: "Find NPC by name",
        examples: ["find Professor John", "get Dr. Smith info", "who is Mary"],
        keywords: ["npc", "character", "person", "who is", "find", "get info", "tell me about"]
      }
    ]
  },

  // Scenario Data Query
  SCENARIO_DATA: {
    category: "Scenario Data", 
    description: "Query scenario and location information",
    functions: [
      {
        name: "findScenarioSnapshotByLocation",
        description: "Find scenario by location and time",
        examples: ["library scenario", "hospital at night", "university campus morning"],
        keywords: ["scenario", "location", "place", "scene", "at", "in", "go to", "visit"]
      }
    ]
  },

  // Rule Data Query
  RULE_DATA: {
    category: "Rule Data",
    description: "Query game rules and mechanics",
    functions: [
      {
        name: "lookupRule",
        description: "Look up specific rules or mechanics",
        examples: ["combat rules", "skill check mechanics", "sanity loss rules"],
        keywords: ["rule", "how to", "how does", "mechanics", "system", "regulation", "explain"]
      }
    ]
  }
} as const;

export const MEMORY_AGENT_SELECTION_PROMPT = `
You are an intelligent function selector responsible for analyzing user input and determining which MemoryUtils functions need to be called.

## Available Function Categories:

${Object.entries(MEMORY_AGENT_FUNCTION_CATEGORIES).map(([key, category]) => `
### ${category.category}
${category.description}

${category.functions.map(func => `
**${func.name}**: ${func.description}
- Examples: ${func.examples.join(', ')}
- Keywords: ${func.keywords.join(', ')}
`).join('')}
`).join('')}

## Output Format:

Please return JSON format containing the functions to call and their parameters:

\`\`\`json
{
  "functions": [
    {
      "name": "function_name",
      "category": "category_name", 
      "parameters": {
        "parameter_name": "parameter_value"
      }
    }
  ]
}
\`\`\`

## Examples:

**User Input**: "Who is Professor John?"
**Output**:
\`\`\`json
{
  "functions": [
    {
      "name": "findCharactersByNames", 
      "category": "NPC Data",
      "parameters": {
        "names": ["Professor John"]
      }
    }
  ]
}
\`\`\`

**User Input**: "What's the library scenario like at midnight?"
**Output**:
\`\`\`json
{
  "functions": [
    {
      "name": "findScenarioSnapshotByLocation",
      "category": "Scenario Data", 
      "parameters": {
        "location": "library",
        "timePoint": "midnight"
      }
    }
  ]
}
\`\`\`

**User Input**: "How do skill checks work?"
**Output**:
\`\`\`json
{
  "functions": [
    {
      "name": "lookupRule",
      "category": "Rule Data",
      "parameters": {
        "query": "skill checks"
      }
    }
  ]
}
\`\`\`

Now please analyze the user input and return the corresponding function call suggestions.
`;

export type MemoryFunctionCall = {
  name: string;
  category: string;
  parameters: Record<string, any>;
};

export type MemoryFunctionSelection = {
  functions: MemoryFunctionCall[];
};

/**
 * Memory Agent - Intelligent memory management agent
 * Uses LLM-guided function selection to provide smart memory services
 */
import { GameStateManager } from "../../../state.js";

export class MemoryAgent {
  private memoryUtils: any;
  private gameStateManager: GameStateManager;

  constructor(memoryUtils: any, gameStateManager: GameStateManager) {
    this.memoryUtils = memoryUtils;
    this.gameStateManager = gameStateManager;
  }

  /**
   * Process user input and execute appropriate memory operations
   */
  async processUserInput(userInput: string): Promise<void> {
    // This would typically use an LLM to parse the input using MEMORY_AGENT_SELECTION_PROMPT
    // For now, this is a placeholder for the LLM integration
    const selection = await this.parseInputWithLLM(userInput);
    await this.executeSelection(selection);
  }

  /**
   * Execute functions and update GameState based on results
   */
  async executeSelection(selection: MemoryFunctionSelection): Promise<void> {
    for (const functionCall of selection.functions) {
      await this.executeAndUpdateState(functionCall);
    }
  }

  /**
   * Parse user input using LLM (placeholder for actual LLM integration)
   */
  private async parseInputWithLLM(userInput: string): Promise<MemoryFunctionSelection> {
    // TODO: Integrate with LLM using MEMORY_AGENT_SELECTION_PROMPT
    // This would send the prompt + user input to LLM and parse the JSON response
    throw new Error("LLM integration not implemented yet");
  }

  /**
   * Execute function and update corresponding GameState area
   */
  private async executeAndUpdateState(functionCall: MemoryFunctionCall): Promise<void> {
    const { name, category, parameters } = functionCall;

    try {
      switch (category) {
        case "NPC Data":
          const npcData = await this.memoryUtils.findCharactersByNames(
            parameters.names || [parameters.name],
            { includePCs: false }
          );
          this.gameStateManager.updateNpcs(npcData);
          break;

        case "Scenario Data":
          const locationQuery = parameters.timePoint 
            ? `${parameters.location} ${parameters.timePoint}`
            : parameters.location;
          const scenarioData = await this.memoryUtils.findScenarioSnapshotByLocation(locationQuery);
          this.gameStateManager.updateCurrentScenario(scenarioData);
          break;

        case "Rule Data":
          const ruleData = await this.memoryUtils.lookupRule({
            keywords: [parameters.query]
          });
          this.gameStateManager.addTemporaryRules(ruleData);
          break;

        default:
          console.warn(`Unknown category: ${category}`);
      }
    } catch (error) {
      console.error(`Error executing ${name}:`, error);
    }
  }
}