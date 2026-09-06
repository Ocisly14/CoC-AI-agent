#!/usr/bin/env tsx
// Replay two observed description-drift cases against the original model.
// Usage: pnpm tsx scripts/probe-description-coherence.ts [trace-dir] [output-dir]
// Three live calls; preserves recorded world/outcomes, refreshes production
// system/check prompts, and feeds the new item result into the scene phase.
// Writes requests/results only. Does not apply changes to a simulation.
import "dotenv/config";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  renderPhaseSystemPrompt,
  renderStateChangeCheck,
} from "../src/engine/resolution/worldResolutionStagePrompts.js";
import { PHASE_TOOL_NAMES } from "../src/engine/resolution/worldResolutionStageSchemas.js";
import { getAdapter } from "../src/models/providers/index.js";
import type {
  ModelMessage,
  ToolChatRequest,
  ToolChatResponse,
  ToolSpec,
} from "../src/models/providers/types.js";
import type { ModelProviderName } from "../src/models/types.js";

type Phase = Parameters<typeof renderStateChangeCheck>[0];
type Row = {
  sourceActionId: string;
  characterId?: string;
  itemId?: string;
  sceneId?: string;
  operation: Record<string, unknown>;
};
type Trace = {
  provider: ModelProviderName;
  modelName: string;
  request: ModelMessage[];
  response: ToolChatResponse;
  tools: ToolSpec[];
};
const source =
  process.argv[2] ?? "logs/prompts-tlou2_deepseek_10tick_20260905_split";
const output = process.argv[3] ?? `logs/description-coherence-${Date.now()}`;
mkdirSync(output, { recursive: true });

async function replay(file: string, phase: Phase, itemChanges?: Row[]) {
  const original: Trace = JSON.parse(
    readFileSync(path.join(source, file), "utf8")
  );
  const messages = structuredClone(original.request);
  let checksReplaced = 0;
  let upstreamReplaced = 0;
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.content) {
      if (part.kind !== "text") continue;
      part.text = part.text.replace(
        /## This phase's check\n[\s\S]*?(?=\n\nCall `)/g,
        () => {
          checksReplaced++;
          return renderStateChangeCheck(phase);
        }
      );
      if (itemChanges) {
        part.text = part.text.replace(
          /(### `itemChanges` — accepted in phase 3\n)[\s\S]*?(?=\n\n##)/g,
          (_, heading) => {
            upstreamReplaced++;
            return heading + JSON.stringify(itemChanges, null, 1);
          }
        );
      }
    }
  }
  assert.equal(checksReplaced, 1, "must replace exactly one phase check");
  if (itemChanges) assert.equal(upstreamReplaced, 1);
  const request: ToolChatRequest = {
    modelName: original.modelName,
    system: [
      {
        text: renderPhaseSystemPrompt(
          phase,
          {
            maxProviderCalls: 12,
            maxPhaseAttempts: 3,
          },
          "zh"
        ),
        cacheControl: true,
      },
    ],
    messages,
    tools: original.tools,
    toolChoice: "any",
    allowParallelCalls: true,
    maxOutputTokens: 8192,
  };
  const requestPath = path.join(output, `${phase}.request.json`);
  writeFileSync(requestPath, JSON.stringify(request, null, 2));
  console.log(`Calling ${original.provider}/${original.modelName}: ${phase}`);
  const started = Date.now();
  const response = await getAdapter(original.provider).chatWithTools(request);
  writeFileSync(
    path.join(output, `${phase}.result.json`),
    JSON.stringify(
      {
        source: path.join(source, file),
        durationMs: Date.now() - started,
        baseline: original.response,
        response,
      },
      null,
      2
    )
  );
  assert.equal(response.toolCalls.length, 1);
  const call = response.toolCalls[0];
  assert.equal(call.name, PHASE_TOOL_NAMES[phase]);
  assert.ok(!call.unreadableArgs);
  const rows = call.args[phase] as Row[];
  assert.ok(Array.isArray(rows));
  console.log(`${phase}: ${JSON.stringify(rows)}`);
  return rows;
}

// Independent character and item cases; all calls settle before proceeding.
const results = await Promise.allSettled([
  replay("0063-world-action-engine_characterChanges.json", "characterChanges"),
  replay("0120-world-action-engine_itemChanges.json", "itemChanges"),
]);
const failures = results.filter((r) => r.status === "rejected");
for (const failure of failures) console.error(failure.reason);
assert.equal(
  failures.length,
  0,
  "live replay failed; inspect saved requests/results"
);
const [characters, items] = results.map((r) => {
  assert.equal(r.status, "fulfilled");
  return r.value;
});
assert.ok(
  characters.some(
    (r) =>
      r.characterId === "npc_abby_anderson" &&
      r.sourceActionId === "action_4f207e05" &&
      r.operation.kind === "setAppearance"
  )
);
const mapRows = items.filter(
  (r) =>
    r.itemId === "item.lodge_greatroom.hand_map" &&
    r.sourceActionId === "action_159fda24"
);
assert.ok(
  mapRows.some(
    (r) =>
      r.operation.kind === "move" &&
      r.operation.from === "scene:SCN_lodge_greatroom" &&
      r.operation.to === "npc_mel"
  )
);
assert.ok(
  mapRows.some(
    (r) =>
      r.operation.kind === "set" &&
      typeof r.operation.description === "string" &&
      !r.operation.appendDescription
  )
);
const scenes = await replay(
  "0121-world-action-engine_sceneChanges.json",
  "sceneChanges",
  items
);
assert.ok(
  scenes.some(
    (r) =>
      r.sceneId === "SCN_lodge_greatroom" &&
      r.sourceActionId === "action_159fda24" &&
      r.operation.kind === "setDescription" &&
      typeof r.operation.description === "string" &&
      !r.operation.description.includes("[item.lodge_greatroom.hand_map]")
  )
);
console.log(
  `Required operations present. Inspect prose for semantic correctness: ${output}`
);
