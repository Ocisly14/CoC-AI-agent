/**
 * CoC Multi-Agent Template System
 * Centralized template management for unified prompt generation
 */

import { composeTemplate, TemplateType } from "../template.js";
import type { CoCState } from "../state.js";
import {
    getKeeperWithAgentsTemplate,
    getKeeperSimpleTemplate,
    getKeeperFallbackTemplate,
} from "./keeperTemplates.js";
import {
    getCharacterAgentTemplate,
    getMemoryAgentTemplate,
    getActionAgentTemplate,
    getOrchestratorTemplate,
} from "./agentTemplates.js";

/**
 * Template context interface for type safety
 */
export interface TemplateContext {
    // Game state
    phase?: string;
    location?: string;
    timeOfDay?: string;
    tension?: string;
    openThreads?: string[];
    discoveredClues?: string[];

    // User interaction
    userInput?: string;
    latestUserMessage?: string;
    latestPlayerInput?: string;

    // Agent outputs
    characterAnalysis?: string;
    memoryAnalysis?: string;
    actionAnalysis?: string;

    // Character information
    characterSummary?: string;
    gameStateSummary?: string;
    
    // System information
    routingNotes?: string;
    dbStats?: string;
    contextSummary?: string;
    toolSpec?: string;

    // Flags for conditional content
    hasInvestigationTools?: boolean;
    hasCombatTools?: boolean;
    hasSocialTools?: boolean;

    // Additional dynamic context
    [key: string]: any;
}

/**
 * Template factory for generating context-aware prompts
 */
export class CoCTemplateFactory {
    /**
     * Generate Keeper response template with agent insights
     */
    static getKeeperWithAgents(
        state: CoCState,
        agentResults: { agentId: string; content: string }[],
        extraContext: TemplateContext = {}
    ): string {
        const context: TemplateContext = {
            ...extraContext,
            phase: state.gameState?.phase,
            location: state.gameState?.location,
            timeOfDay: state.gameState?.timeOfDay,
            tension: state.gameState?.tension,
            openThreads: state.gameState?.openThreads,
            discoveredClues: state.gameState?.discoveredClues,
        };

        // Process agent results
        agentResults.forEach((result: { agentId: string; content: string }) => {
            switch (result.agentId) {
                case 'character':
                    context.characterAnalysis = result.content;
                    break;
                case 'memory':
                    context.memoryAnalysis = result.content;
                    break;
                case 'action':
                    context.actionAnalysis = result.content;
                    break;
            }
        });

        return composeTemplate(getKeeperWithAgentsTemplate(), state, context, "handlebars");
    }

    /**
     * Generate simple Keeper response template
     */
    static getKeeperSimple(
        state: CoCState,
        userInput: string,
        extraContext: TemplateContext = {}
    ): string {
        const context: TemplateContext = {
            ...extraContext,
            userInput,
            phase: state.gameState?.phase,
            location: state.gameState?.location,
            timeOfDay: state.gameState?.timeOfDay,
            tension: state.gameState?.tension,
        };

        return composeTemplate(getKeeperSimpleTemplate(), state, context, "handlebars");
    }

    /**
     * Generate fallback Keeper template for error conditions
     */
    static getKeeperFallback(
        state: CoCState,
        userInput: string,
        extraContext: TemplateContext = {}
    ): string {
        const context: TemplateContext = {
            ...extraContext,
            userInput,
            phase: state.gameState?.phase || "unknown",
            location: state.gameState?.location || "unknown location",
        };

        return composeTemplate(getKeeperFallbackTemplate(), state, context);
    }

    /**
     * Generate Character Agent analysis template
     */
    static getCharacterAgent(
        state: CoCState,
        characterSummary: string,
        extraContext: TemplateContext = {}
    ): string {
        const context: TemplateContext = {
            ...extraContext,
            characterSummary,
            latestUserMessage: extraContext.latestUserMessage || "",
            gameStateSummary: extraContext.gameStateSummary || "",
            routingNotes: extraContext.routingNotes || "None",
        };

        return composeTemplate(getCharacterAgentTemplate(), state, context);
    }

    /**
     * Generate Memory Agent analysis template
     */
    static getMemoryAgent(
        state: CoCState,
        contextSummary: string,
        dbStats: string,
        extraContext: TemplateContext = {}
    ): string {
        const context: TemplateContext = {
            ...extraContext,
            contextSummary,
            dbStats,
            latestUserMessage: extraContext.latestUserMessage || "",
            gameStateSummary: extraContext.gameStateSummary || "",
            routingNotes: extraContext.routingNotes || "None",
        };

        return composeTemplate(getMemoryAgentTemplate(), state, context);
    }

    /**
     * Generate Action Agent resolution template
     */
    static getActionAgent(
        state: CoCState,
        toolSpec: string,
        extraContext: TemplateContext = {}
    ): string {
        const context: TemplateContext = {
            ...extraContext,
            toolSpec,
            latestUserMessage: extraContext.latestUserMessage || "",
            gameStateSummary: extraContext.gameStateSummary || "",
            routingNotes: extraContext.routingNotes || "None",
            hasInvestigationTools: true, // Default capabilities
            hasCombatTools: true,
            hasSocialTools: true,
        };

        return composeTemplate(getActionAgentTemplate(), state, context);
    }

    /**
     * Generate Orchestrator routing template
     */
    static getOrchestrator(
        state: CoCState,
        playerInput: string,
        extraContext: TemplateContext = {}
    ): string {
        const context: TemplateContext = {
            ...extraContext,
            latestPlayerInput: playerInput,
            gameStateSummary: extraContext.gameStateSummary || "",
        };

        return composeTemplate(getOrchestratorTemplate(), state, context);
    }

    /**
     * Create custom template with dynamic context
     */
    static createCustom(
        template: TemplateType,
        state: CoCState,
        context: TemplateContext = {},
        useHandlebars: boolean = false
    ): string {
        const templatingEngine = useHandlebars ? "handlebars" : undefined;
        return composeTemplate(template, state, context, templatingEngine);
    }
}

/**
 * Template utilities and helpers
 */
export class TemplateUtils {
    /**
     * Format game state for template inclusion
     */
    static formatGameStateForTemplate(gameState: any): string {
        return `Phase: ${gameState?.phase || 'Unknown'}
Location: ${gameState?.location || 'Unknown'}
Time: ${gameState?.timeOfDay || 'Unknown'}
Tension: ${gameState?.tension || 'Normal'}
Open Threads: ${gameState?.openThreads?.length || 0} active
Clues Discovered: ${gameState?.discoveredClues?.length || 0}`;
    }

    /**
     * Format agent results for template inclusion
     */
    static formatAgentResults(agentResults: { agentId: string; content: string }[]): Record<string, string> {
        const formatted: Record<string, string> = {};
        
        agentResults.forEach(result => {
            const key = `${result.agentId}Analysis`;
            formatted[key] = result.content;
        });

        return formatted;
    }

    /**
     * Create routing notes summary
     */
    static createRoutingNotes(
        selectedAgents: string[],
        reasoning?: string
    ): string {
        const agentList = selectedAgents.length > 0 ? selectedAgents.join(', ') : 'none';
        const notes = [`Selected agents: ${agentList}`];
        
        if (reasoning) {
            notes.push(`Reasoning: ${reasoning}`);
        }

        return notes.join('\n');
    }

    /**
     * Validate template context for required fields
     */
    static validateTemplateContext(
        context: TemplateContext,
        requiredFields: string[]
    ): { valid: boolean; missing: string[] } {
        const missing = requiredFields.filter(field => !(field in context) || context[field] == null);
        
        return {
            valid: missing.length === 0,
            missing
        };
    }
}

// Export template functions for backward compatibility
export {
    getKeeperWithAgentsTemplate,
    getKeeperSimpleTemplate,
    getKeeperFallbackTemplate,
    getCharacterAgentTemplate,
    getMemoryAgentTemplate,
    getActionAgentTemplate,
    getOrchestratorTemplate,
};
