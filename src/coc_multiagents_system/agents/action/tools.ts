import { ToolMessage } from "@langchain/core/messages";

export const actionTools = [
  {
    type: "function",
    function: {
      name: "roll_dice",
      description:
        "Roll N dice with given sides, default d100. Returns array of integers.",
      parameters: {
        type: "object",
        properties: {
          sides: { type: "integer", minimum: 2, default: 100 },
          count: { type: "integer", minimum: 1, default: 1 },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add",
      description: "Add two numbers.",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" },
        },
        required: ["a", "b"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "subtract",
      description: "Subtract b from a (a - b).",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" },
        },
        required: ["a", "b"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "multiply",
      description: "Multiply two numbers.",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" },
        },
        required: ["a", "b"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "divide",
      description:
        "Divide a by b (a / b). Handles divide-by-zero by returning null.",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" },
        },
        required: ["a", "b"],
      },
    },
  },
];

export const executeActionTool = (call: any, log: string[]): ToolMessage => {
  const name = call.name;
  const args = call.args as Record<string, any>;
  let result: any;

  switch (name) {
    case "roll_dice": {
      const sides = Math.max(2, Math.floor(args?.sides ?? 100));
      const count = Math.max(1, Math.floor(args?.count ?? 1));
      const rolls = Array.from(
        { length: count },
        () => Math.floor(Math.random() * sides) + 1
      );
      result = { rolls, sides, total: rolls.reduce((a, b) => a + b, 0) };
      log.push(
        `roll_dice: d${sides} x${count} -> ${rolls.join(", ")} (total ${result.total})`
      );
      break;
    }
    case "add": {
      result = (args?.a ?? 0) + (args?.b ?? 0);
      log.push(`add: ${args?.a} + ${args?.b} = ${result}`);
      break;
    }
    case "subtract": {
      result = (args?.a ?? 0) - (args?.b ?? 0);
      log.push(`subtract: ${args?.a} - ${args?.b} = ${result}`);
      break;
    }
    case "multiply": {
      result = (args?.a ?? 0) * (args?.b ?? 0);
      log.push(`multiply: ${args?.a} * ${args?.b} = ${result}`);
      break;
    }
    case "divide": {
      if (args?.b === 0) {
        result = null;
        log.push("divide: attempted divide by zero");
      } else {
        result = (args?.a ?? 0) / args?.b;
        log.push(`divide: ${args?.a} / ${args?.b} = ${result}`);
      }
      break;
    }
    default: {
      result = null;
      log.push(`unknown tool: ${name}`);
    }
  }

  return new ToolMessage({
    content: typeof result === "string" ? result : JSON.stringify(result),
    name,
    tool_call_id: call.id,
  });
};
