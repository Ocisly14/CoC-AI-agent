import { SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import {
  type CoCState,
  type GameState,
  initialGameState,
} from "../../../state.js";
import { composeTemplate } from "../../../template.js";
import {
  contentToString,
  formatGameState,
  latestHumanMessage,
} from "../../../utils.js";
import type { CharacterProfile } from "../../shared/models/gameTypes.js";
import { actionTools, executeActionTool } from "./tools.js";

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const fallbackModel = new ChatOpenAI({
  model: DEFAULT_MODEL,
  temperature: 0.4,
});

type ActionAgentOutput = {
  summary: string;
  stateUpdate?: Partial<GameState>;
  log?: string[];
};

type SkillCheckRequest = {
  skill: string;
  roll: number;
  difficulty?: "regular" | "hard" | "extreme";
  note?: string;
};

const formatCharacterDelta = (
  before?: GameState["playerCharacter"],
  after?: GameState["playerCharacter"]
): string | null => {
  if (!before || !after) return null;
  const prev = before.status;
  const next = after.status;

  const lines: string[] = [];
  const formatLine = (label: string, fromVal?: number, toVal?: number) => {
    if (fromVal === undefined || toVal === undefined) return;
    if (fromVal === toVal) return;
    const delta = toVal - fromVal;
    const sign = delta > 0 ? "+" : "";
    lines.push(`${label}: ${fromVal} -> ${toVal} (${sign}${delta})`);
  };

  formatLine("HP", prev.hp, next.hp);
  formatLine("Sanity", prev.sanity, next.sanity);
  formatLine("Luck", prev.luck, next.luck);
  if (prev.mp !== undefined || next.mp !== undefined) {
    formatLine("MP", prev.mp, next.mp);
  }

  if (prev.conditions?.join(",") !== after.status.conditions?.join(",")) {
    const prevConds = prev.conditions?.length
      ? prev.conditions.join(", ")
      : "none";
    const nextConds = next.conditions?.length
      ? next.conditions.join(", ")
      : "none";
    lines.push(`Conditions: ${prevConds} -> ${nextConds}`);
  }

  return lines.length ? lines.map((l) => `- ${l}`).join("\n") : null;
};

const parseActionOutput = (raw: string): ActionAgentOutput => {
  try {
    const parsed = JSON.parse(raw) as ActionAgentOutput & {
      checks?: SkillCheckRequest[];
    };
    return {
      summary: parsed.summary ?? raw,
      stateUpdate: parsed.stateUpdate,
      log: parsed.log,
      // @ts-expect-error preserve checks for downstream use
      checks: parsed.checks,
    };
  } catch {
    return { summary: raw };
  }
};

const buildMemoryContext = (agentResults: any[]): string => {
  const memoryFindings = (agentResults || []).filter(
    (r) => r.agentId === "memory"
  );
  if (memoryFindings.length === 0) return "No memory/rule context provided.";

  return memoryFindings
    .map((entry, idx) => {
      const details =
        typeof entry.content === "string"
          ? entry.content
          : JSON.stringify(entry.content);
      return `Memory note ${idx + 1}: ${details}`;
    })
    .join("\n");
};

const mergeCharacter = (
  current: CharacterProfile,
  updates?: Partial<CharacterProfile>
): CharacterProfile => {
  if (!updates) return current;
  const mergedStatus = updates.status
    ? { ...current.status, ...updates.status }
    : current.status;
  const mergedSkills = updates.skills
    ? { ...current.skills, ...updates.skills }
    : current.skills;
  return {
    ...current,
    ...updates,
    status: mergedStatus,
    skills: mergedSkills,
  };
};

const evaluateSkillCheck = (
  check: SkillCheckRequest,
  skills: Record<string, number>
) => {
  const targetBase = skills?.[check.skill] ?? 0;
  const difficulty = check.difficulty ?? "regular";
  const difficultyTarget =
    difficulty === "hard"
      ? Math.floor(targetBase / 2)
      : difficulty === "extreme"
        ? Math.floor(targetBase / 5)
        : targetBase;

  const roll = Math.floor(check.roll);
  const success = roll <= difficultyTarget;
  let level: "critical" | "extreme" | "hard" | "regular" | "failure" =
    "failure";
  if (success) {
    if (roll <= Math.max(1, Math.floor(targetBase / 20))) {
      level = "critical";
    } else if (roll <= Math.floor(targetBase / 5)) {
      level = "extreme";
    } else if (roll <= Math.floor(targetBase / 2)) {
      level = "hard";
    } else {
      level = "regular";
    }
  }

  return {
    ...check,
    target: difficultyTarget,
    targetBase,
    success,
    level,
  };
};

export const createActionNode =
  (model: ChatOpenAI = fallbackModel) =>
  async (state: CoCState): Promise<Partial<CoCState>> => {
    const gameState = state.gameState ?? initialGameState;
    const userMessage = latestHumanMessage(state.messages);
    const memoryContext = buildMemoryContext(state.agentResults || []);
    const toolSpec = JSON.stringify(actionTools, null, 2);

    const systemPrompt = new SystemMessage(
      composeTemplate(
        [
          "You are the Action Resolution agent for Call of Cthulhu.",
          "Given the player's instruction and memory/rule context, identify the specific action, required rolls, and outcomes.",
          "Use the memory context to ground rules and recent events. Do not invent rules.",
          "You MUST respond with strict JSON, no prose. Shape:",
          '{"summary":"short result","checks":[{"skill":"Spot Hidden","roll":42,"difficulty":"regular","note":"searching the study"}],"stateUpdate":{"tension":2,"playerCharacter":{"status":{"hp":9}}},"log":["Spot Hidden vs 50 (Regular) roll 42"]}',
          "Guidelines:",
          "- Only update state fields you are certain about.",
          "- If a roll is needed, call the dice tool, then include the rolled value in `checks`.",
          "- For each check, provide skill name, roll result, and difficulty (regular|hard|extreme).",
          "- Keep `summary` concise and factual; add short log entries if helpful.",
          "- Avoid narrative; keep to mechanics/results.",
          "Memory/Rules context:\n{{memoryContext}}",
          "Context:",
          "- Latest player input: {{latestUserMessage}}",
          "- Game state snapshot: {{gameStateSummary}}",
          "- Routing notes: {{routingNotes}}",
          "- You may call tools for dice rolling or basic math as needed.",
          "- Available tools (JSON): {{toolSpec}}",
        ].join("\n"),
        state,
        {
          latestUserMessage: userMessage || "No recent player input.",
          gameStateSummary: formatGameState(gameState),
          routingNotes: state.routingNotes ?? "None",
          memoryContext,
          toolSpec,
        }
      )
    );

    const toolEnabledModel = model.bindTools(actionTools);
    const messages = [systemPrompt, ...state.messages];
    const firstResponse = await toolEnabledModel.invoke(messages);

    let actionResponse = firstResponse;
    const toolLogs: string[] = [];

    if (firstResponse.tool_calls && firstResponse.tool_calls.length > 0) {
      const toolResults = firstResponse.tool_calls.map((call: any) =>
        executeActionTool(call, toolLogs)
      );
      actionResponse = await toolEnabledModel.invoke([
        ...messages,
        firstResponse,
        ...toolResults,
      ]);
    }

    const parsed = parseActionOutput(
      contentToString(actionResponse.content)
    ) as ActionAgentOutput & { checks?: SkillCheckRequest[] };
    const mergedLog = parsed.log ? [...parsed.log, ...toolLogs] : toolLogs;

    const stateUpdate = parsed.stateUpdate ?? {};
    const mergedPlayerCharacter = mergeCharacter(
      gameState.playerCharacter,
      stateUpdate.playerCharacter
    );

    const updatedGameState: GameState = {
      ...gameState,
      ...stateUpdate,
      playerCharacter: mergedPlayerCharacter,
    };
    const characterDelta = formatCharacterDelta(
      gameState.playerCharacter,
      updatedGameState.playerCharacter
    );
    const evaluatedChecks = parsed.checks
      ? parsed.checks.map((c) =>
          evaluateSkillCheck(c, mergedPlayerCharacter.skills || {})
        )
      : [];
    const checkSummary = evaluatedChecks.length
      ? evaluatedChecks
          .map(
            (c) =>
              `${c.skill}: roll ${c.roll} vs ${c.target} (${c.difficulty ?? "regular"}) -> ${
                c.success ? c.level : "failure"
              }`
          )
          .join("\n")
      : null;

    const formattedSummary = characterDelta
      ? `${parsed.summary}\n\n# Character Update\n${characterDelta}`
      : parsed.summary;

    const finalContent = [
      formattedSummary,
      checkSummary ? `\n# Checks\n${checkSummary}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      gameState: updatedGameState,
      agentResults: [
        {
          agentId: "action",
          content: finalContent,
          timestamp: new Date(),
          metadata: {
            stateUpdate: parsed.stateUpdate,
            log: mergedLog,
            raw: contentToString(actionResponse.content),
            characterDelta,
            checks: evaluatedChecks,
          },
        },
      ],
    };
  };
