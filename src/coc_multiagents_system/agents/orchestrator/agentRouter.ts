/**
 * Agent Router
 * Uses LLM to decide which agents to invoke based on user query and agent manifests
 * Simplified: Only returns agent IDs, agents decide internally what to do
 */

import type { AgentManifest } from "../models/agentTypes.js";

/**
 * Routing result - just agent IDs
 */
export interface RoutingResult {
  agents: string[]; // List of agent IDs to invoke
}

/**
 * Agent Router - decides which agents to call based on user query
 */
export class AgentRouter {
  private agentManifests: Map<string, AgentManifest>;
  private llm: any; // LLM instance

  constructor(llm: any) {
    this.llm = llm;
    this.agentManifests = new Map();
  }

  /**
   * Register an agent manifest
   */
  public registerAgent(manifest: AgentManifest): void {
    this.agentManifests.set(manifest.agentId, manifest);
  }

  /**
   * Register multiple agent manifests
   */
  public registerAgents(manifests: AgentManifest[]): void {
    manifests.forEach((manifest) => this.registerAgent(manifest));
  }

  /**
   * Route user query to appropriate agents using LLM
   * Returns only agent IDs - agents will decide internally what to do
   */
  public async routeQuery(
    userQuery: string,
    context: any
  ): Promise<RoutingResult> {
    // Build prompt with all available agents
    const prompt = this.buildRoutingPrompt(userQuery, context);

    // Call LLM to decide which agents to use
    const llmResponse = await this.llm.generate(prompt);

    // Parse LLM response into agent IDs
    const routingResult = this.parseRoutingResponse(llmResponse);

    return routingResult;
  }

  /**
   * Build LLM prompt with agent descriptions
   */
  private buildRoutingPrompt(userQuery: string, context: any): string {
    const agentDescriptions = this.formatAgentDescriptions();

    const prompt = `You are the Orchestrator for a Call of Cthulhu game session.
Your job is to analyze the player's input and decide which agents should handle it.

## Available Agents:

${agentDescriptions}

## Current Game Context:
- Location: ${context.location || "Unknown"}
- Phase: ${context.phase || "investigation"}
- Time of Day: ${context.timeOfDay || "Unknown"}

## Player Query:
"${userQuery}"

## Your Task:
Based on the player's query, return ONLY the agent IDs that should handle this request.
Each agent will internally decide what to do.

Return a JSON array of agent IDs, for example:
["keeper", "rule"]

or just:
["keeper"]

Guidelines:
- Investigation usually needs: keeper (for narration) + rule (for skill checks)
- Pure dialogue needs: keeper
- Combat needs: rule + keeper + character
- Stat changes need: character
- History questions need: memory
`;

    return prompt;
  }

  /**
   * Format all agent manifests for the LLM prompt
   */
  private formatAgentDescriptions(): string {
    const descriptions: string[] = [];

    this.agentManifests.forEach((manifest, agentId) => {
      let desc = `### ${agentId}\n`;
      desc += `${manifest.description}\n`;
      desc += `Purpose: ${manifest.purpose}\n`;
      desc += `When to use: ${manifest.whenToUse.join("; ")}\n`;

      descriptions.push(desc);
    });

    return descriptions.join("\n");
  }

  /**
   * Parse LLM response into agent IDs
   */
  private parseRoutingResponse(llmResponse: string): RoutingResult {
    try {
      // Extract JSON array from LLM response
      const jsonMatch = llmResponse.match(/\[(.*?)\]/);
      if (!jsonMatch) {
        throw new Error("No JSON array found in LLM response");
      }

      const agentIds = JSON.parse(`[${jsonMatch[1]}]`);

      return {
        agents: agentIds,
      };
    } catch (error) {
      console.error("Failed to parse routing response:", error);
      // Default: use keeper
      return { agents: ["keeper"] };
    }
  }

  /**
   * Get agent manifest by ID
   */
  public getAgentManifest(agentId: string): AgentManifest | undefined {
    return this.agentManifests.get(agentId);
  }
}
