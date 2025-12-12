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

/**
 * Complete agent manifest
 */
export interface AgentManifest {
  agentId: string;
  agentName: string;
  version: string;
  description: string;
  purpose: string;
  capabilities: AgentCapability[];
  dependencies?: string[];
  whenToUse: string[];
  whenNotToUse?: string[];
}
