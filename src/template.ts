import handlebars from "handlebars";
import { type CoCState, type GameState, initialGameState } from "./state.js";
import { names, uniqueNamesGenerator } from "unique-names-generator";

type TemplateContext = Record<string, unknown>;

// Template function type for dynamic templates
export type TemplateType = string | ((params: { state: CoCState }) => string);

const renderValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) return value.map(renderValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
};

const getValueAtPath = (context: TemplateContext, rawPath: string): unknown => {
  const path = rawPath.trim().split(".").filter(Boolean);
  return path.reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, context);
};

/**
 * Enhanced template composition with support for dynamic templates and handlebars.
 * Replaces `{{path.to.value}}` placeholders in a template using state-driven context.
 * This keeps prompts declarative while safely surfacing the latest state to the LLM.
 * 
 * @param template - Template string or function
 * @param state - CoC game state
 * @param extraContext - Additional context variables
 * @param templatingEngine - Optional templating engine ("handlebars")
 * @returns Composed template with placeholders filled
 */
export const composeTemplate = (
  template: TemplateType,
  state: CoCState,
  extraContext: TemplateContext = {},
  templatingEngine?: "handlebars"
): string => {
  // Handle both GameState directly and { gameState: GameState } object
  const gameState = 'gameState' in state && state.gameState 
    ? state.gameState 
    : (state as GameState);
  
  const context: TemplateContext = {
    ...state,
    gameState: gameState ?? initialGameState,
    ...extraContext,
  };

  // Resolve template function to string
  const templateStr = typeof template === "function" ? template({ state }) : template;

  // Use handlebars if specified
  if (templatingEngine === "handlebars") {
    const templateFunction = handlebars.compile(templateStr);
    return templateFunction(context);
  }

  // Default simple replacement
  return templateStr.replace(/{{\s*([^}]+?)\s*}}/g, (_match, rawPath) => {
    const value = getValueAtPath(context, rawPath);
    return renderValue(value);
  });
};

/**
 * Generates a string with random user names populated in a template.
 * Useful for creating examples with varied character names.
 * 
 * @param template - Template string containing {{user1}}, {{user2}}, etc. placeholders
 * @param length - Number of random user names to generate
 * @returns Template with user placeholders replaced by random names
 */
export const composeRandomUser = (template: string, length: number): string => {
  const exampleNames = Array.from({ length }, () =>
    uniqueNamesGenerator({ dictionaries: [names] })
  );
  
  let result = template;
  for (let i = 0; i < exampleNames.length; i++) {
    result = result.replaceAll(`{{user${i + 1}}}`, exampleNames[i]);
  }

  return result;
};

/**
 * Adds a header to a body of text with proper formatting.
 * 
 * @param header - Header text to prepend
 * @param body - Body text
 * @returns Formatted text with header
 */
export const addHeader = (header: string, body: string): string => {
  return body.length > 0 ? `${header ? header + "\n" : header}${body}\n` : "";
};

/**
 * Composes context for CoC game scenarios with enhanced error handling and validation.
 * 
 * @param params - Object containing state, template, and optional templating engine
 * @returns Composed context string
 */
export const composeContext = ({
  state,
  template,
  templatingEngine,
  extraContext = {},
}: {
  state: CoCState;
  template: TemplateType;
  templatingEngine?: "handlebars";
  extraContext?: TemplateContext;
}): string => {
  try {
    return composeTemplate(template, state, extraContext, templatingEngine);
  } catch (error) {
    console.error("Error composing context:", error);
    // Fallback to simple template without dynamic features
    const fallbackTemplate = typeof template === "string" ? template : "{{gameState}}";
    return composeTemplate(fallbackTemplate, state, extraContext);
  }
};
