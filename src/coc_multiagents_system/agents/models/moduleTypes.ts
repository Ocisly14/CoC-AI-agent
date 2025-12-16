/**
 * Module background and briefing types
 * Used for importing adventure/module overview documents
 */

/** Parsed module information extracted from documents */
export interface ParsedModuleData {
  title: string;
  background?: string;
  storyOutline?: string;
  moduleNotes?: string;
  keeperGuidance?: string;
  storyHook?: string;
  moduleLimitations?: string;
  initialScenario?: string; // Name or ID of the starting scenario
  tags?: string[];
  source?: string;
}

/** Stored module background record */
export interface ModuleBackground {
  id: string;
  title: string;
  background?: string;
  storyOutline?: string;
  moduleNotes?: string;
  keeperGuidance?: string;
  storyHook?: string;
  moduleLimitations?: string;
  initialScenario?: string; // Name or ID of the starting scenario
  tags: string[];
  source?: string;
  createdAt: string;
}
