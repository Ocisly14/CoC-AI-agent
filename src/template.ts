import { type CoCState, initialGameState } from "./state.js";

type TemplateContext = Record<string, unknown>;

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
 * Replace `{{path.to.value}}` placeholders in a template using state-driven context.
 * This keeps prompts declarative while safely surfacing the latest state to the LLM.
 */
export const composeTemplate = (
  template: string,
  state: CoCState,
  extraContext: TemplateContext = {}
): string => {
  const context: TemplateContext = {
    ...state,
    gameState: state.gameState ?? initialGameState,
    ...extraContext,
  };

  return template.replace(/{{\s*([^}]+?)\s*}}/g, (_match, rawPath) => {
    const value = getValueAtPath(context, rawPath);
    return renderValue(value);
  });
};
