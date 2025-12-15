/**
 * Agent type definitions
 * Shared types for agent manifests
 */

/**
 * Agent capability description
 */
export interface AgentCapability {
  name: string;
  description: string;
  parameters?: AgentParameter[];
  returns?: string;
  examples?: string[];
}

/**
 * Agent parameter definition
 */
export interface AgentParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

