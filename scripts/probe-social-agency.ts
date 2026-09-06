#!/usr/bin/env tsx
// Replay the recorded failed Tommy/Manny attempts, then their occurrences.
// Usage: node --import tsx scripts/probe-social-agency.ts [--dry-run]
// Use --observation --endings-only for the recorded 19:10 Mel observation.
// Add --provider=anthropic to compare using that provider's configured MEDIUM model.
// Refreshes production instructions, schemas and skill guidance; preserves
// original world, commands and dice. Two API calls, no simulation state writes.
import "dotenv/config";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { EngineResolutionContext } from "../src/engine/resolution/types.js";
import {
  renderContextSegments,
  renderPhaseInstruction,
  renderPhaseSystemPrompt,
} from "../src/engine/resolution/worldResolutionStagePrompts.js";
import {
  type AcceptedResolutionDraft,
  type EndingDecision,
  PHASE_TOOLS,
  PHASE_TOOL_NAMES,
} from "../src/engine/resolution/worldResolutionStageSchemas.js";
import { occurrenceObligations } from "../src/engine/resolution/worldResolutionStageValidator.js";
import { getAdapter } from "../src/models/providers/index.js";
import { getModelSettings } from "../src/models/generator.js";
import type { ModelMessage } from "../src/models/providers/types.js";
import { ModelClass, ModelProviderName } from "../src/models/types.js";

const source = "logs/prompts-tlou2_deepseek_10tick_20260905_split";
const observation = process.argv.includes("--observation");
const endingsOnly = process.argv.includes("--endings-only");
const providerArg = process.argv
  .find((arg) => arg.startsWith("--provider="))
  ?.slice("--provider=".length);
if (providerArg)
  assert.ok(
    Object.values(ModelProviderName).includes(providerArg as ModelProviderName),
    "unknown provider"
  );
const providerOverride = providerArg as ModelProviderName | undefined;
const endingFile = observation
  ? "0156-world-action-engine_endings.json"
  : "0138-world-action-engine_endings.json";
const occurrenceFile = observation
  ? "0160-world-action-engine_occurrences.json"
  : "0142-world-action-engine_occurrences.json";
const output = `logs/${observation ? "observation-outcome" : "social-agency"}-${providerOverride ? `${providerOverride}-` : ""}${Date.now()}`;
const dryRun = process.argv.includes("--dry-run");
mkdirSync(output, { recursive: true });
const read = (file: string) =>
  JSON.parse(readFileSync(path.join(source, file), "utf8"));
const originalEndings = read(endingFile);
const world = originalEndings.request[0].content[1].text as string;
function section(heading: string) {
  const block = world.split(/\n\n(?=## )/).find((b) => b.startsWith(heading));
  assert.ok(block, heading);
  return JSON.parse(block.slice(block.indexOf("\n") + 1));
}
// Rebuild volatile instructions with current production text while retaining
// recorded world data and rolls. The original skeleton graph segment is retained;
// its dummy value here is unused because only the volatile segment is replayed.
const instructionContext = {
  trigger: section("## Trigger"),
  tick: section("## Tick"),
  rules: { worldInvariants: [] },
  state: {
    graph: { places: [], edges: [] },
    blockedEdges: section("## Blocked Connections"),
    places: section("## Detailed Places"),
    vehicles: section("## Vehicles"),
    items: section("## Items"),
    characters: section("## Characters"),
  },
  events: section("## Objective Events"),
  actions: {
    newCommands: [],
    activeActions: section("## Active Actions (in flight)").map(
      (a: { actionId: string }) => ({ ...a, id: a.actionId })
    ),
  },
} as unknown as EngineResolutionContext;
const endedIds = instructionContext.trigger.actionIds;
const baselineEndings = originalEndings.response.toolCalls[0].args
  .endings as EndingDecision[];

async function replay(
  phase: "endings" | "occurrences",
  draft: AcceptedResolutionDraft
) {
  const file = phase === "endings" ? endingFile : occurrenceFile;
  const trace = read(file);
  const provider = providerOverride ?? (trace.provider as ModelProviderName);
  const settings = getModelSettings(provider, ModelClass.MEDIUM);
  assert.ok(settings);
  const modelName = providerOverride ? settings.name : trace.modelName;
  const messages: ModelMessage[] = structuredClone(trace.request);
  let replaced = 0;
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.content) {
      if (part.kind !== "text") continue;
      if (part.text.startsWith("# Phase ")) {
        part.text = renderPhaseInstruction(phase, instructionContext, draft);
        replaced++;
      }
      if (part.text.includes("## Active Actions (in flight)")) {
        part.text = renderContextSegments(instructionContext).volatile;
        // World state, commands and dice must not change in an instruction replay.
        for (const heading of [
          "## Characters",
          "## Items",
          "## Detailed Places",
          "## Active Actions (in flight)",
          "## Objective Events",
        ]) {
          const block = part.text
            .split(/\n\n(?=## )/)
            .find((b) => b.startsWith(heading));
          assert.ok(block, heading);
          assert.deepEqual(
            JSON.parse(block.slice(block.indexOf("\n") + 1)),
            section(heading)
          );
        }
      }
    }
  }
  assert.equal(replaced, 1);
  const request = {
    modelName,
    system: [
      {
        text: renderPhaseSystemPrompt(
          phase,
          { maxProviderCalls: 12, maxPhaseAttempts: 3 },
          "zh"
        ),
        cacheControl: true,
      },
    ],
    messages,
    tools: trace.tools.map((tool: { name: string }) =>
      tool.name === PHASE_TOOL_NAMES[phase] ? PHASE_TOOLS[phase] : tool
    ),
    toolChoice: "any" as const,
    allowParallelCalls: true,
    maxOutputTokens: settings.maxOutputTokens ?? 8192,
  };
  writeFileSync(
    path.join(output, `${phase}.request.json`),
    JSON.stringify(request, null, 2)
  );
  if (dryRun) {
    console.log(
      `Prepared ${provider}/${modelName}: ${phase}; no API call; ${output}`
    );
    return phase === "endings" ? baselineEndings : [];
  }
  console.log(`Calling ${provider}/${modelName}: ${phase}`);
  const started = Date.now();
  const response = await getAdapter(provider).chatWithTools(request);
  writeFileSync(
    path.join(output, `${phase}.result.json`),
    JSON.stringify(
      {
        source: path.join(source, file),
        provider,
        modelName,
        durationMs: Date.now() - started,
        baseline: trace.response,
        response,
      },
      null,
      2
    )
  );
  assert.equal(response.toolCalls.length, 1);
  assert.equal(response.toolCalls[0].name, PHASE_TOOL_NAMES[phase]);
  assert.ok(!response.toolCalls[0].unreadableArgs);
  const rows = response.toolCalls[0].args[phase];
  assert.ok(Array.isArray(rows));
  console.log(`${phase}: ${JSON.stringify(rows)}`);
  return rows;
}
const endings = await replay("endings", {});
assert.deepEqual(
  endings.map((e: EndingDecision) => e.actionId).sort(),
  [...endedIds].sort()
);
// A routine observation may now close without a new outcome. Do not make
// this probe enforce the obsolete contract that caused retrospective recaps.
for (const id of observation ? [] : ["action_6070c61a", "action_9e279f2b"]) {
  assert.ok(
    endings.some(
      (e: EndingDecision) => e.actionId === id && e.mode === "outcome"
    )
  );
}
if (endingsOnly) {
  console.log(`Inspect source and timing semantics in: ${output}`);
  process.exit(0);
}
// These three domains were empty in the source tick; this probe does not rerun them.
const draft: AcceptedResolutionDraft = {
  endings,
  characterChanges: [],
  itemChanges: [],
  sceneChanges: [],
};
const occurrences = await replay("occurrences", draft);
if (!dryRun) {
  for (const obligation of occurrenceObligations(instructionContext, draft)) {
    assert.ok(
      occurrences.some(
        (o) =>
          o.actionIds?.includes(obligation.actionId) &&
          o.speech === obligation.speech
      )
    );
  }
}
console.log(`Inspect target-response semantics in: ${output}`);
