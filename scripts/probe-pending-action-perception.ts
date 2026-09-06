#!/usr/bin/env tsx
// Replays the original Mel/Abby views with production ongoing-action metadata.
// Usage: node --import tsx scripts/probe-pending-action-perception.ts
// Add --dry-run to prepare and verify inputs without contacting the provider.
// Two live calls to the recorded model; saves outputs without applying state.
import "dotenv/config";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  RENDERER_SYSTEM_PROMPT,
  formatObservedAction,
} from "../src/roleSim/renderer/llmRenderer.js";
import { getAdapter } from "../src/models/providers/index.js";
import type { ContentPart } from "../src/models/providers/types.js";
import { getModelSettings } from "../src/models/generator.js";
import { ModelClass } from "../src/models/types.js";
import type { ModelProviderName } from "../src/models/types.js";

const source = "logs/prompts-tlou2_deepseek_10tick_20260905_split";
const output = `logs/pending-action-perception-${Date.now()}`;
const dryRun = process.argv.includes("--dry-run");
mkdirSync(output, { recursive: true });
const read = (file: string) =>
  JSON.parse(readFileSync(path.join(source, file), "utf8"));
const ending = read("0156-world-action-engine_endings.json");
const context = ending.request
  .flatMap((m: { content: ContentPart[] }) => m.content)
  .find(
    (p: ContentPart) =>
      p.kind === "text" && p.text.includes("## Active Actions (in flight)")
  ).text;
function section(heading: string) {
  return JSON.parse(
    context
      .split(heading)[1]
      .trim()
      .split(/\n\n## /)[0]
  );
}
const actions = section("## Active Actions (in flight)");
const characters = section("## Characters");

async function replay(file: string) {
  const trace = read(file);
  const content: ContentPart[] = structuredClone(trace.request);
  let replaced = 0;
  for (const part of content) {
    if (part.kind !== "text") continue;
    // Keep old outcome/history as an explicit conflicting-input stress case.
    part.text = part.text.replace("Result (objective; render as what the viewpoint experiences):", "Result (actor outcome; render supported evidence within current state and speech timing):");
    let characterId: string | undefined;
    part.text = part.text
      .split("\n")
      .map((line) => {
        if (line.startsWith("# ")) characterId = undefined;
        if (line.startsWith("Person (")) {
          characterId = characters.find((c: { id: string }) =>
            line.includes(`[${c.id}]`)
          )?.id;
        }
        if (line.startsWith("  Appearance:") && !characterId) {
          characterId = characters.find(
            (c: { appearance: string }) =>
              c.appearance === line.slice("  Appearance: ".length)
          )?.id;
        }
        if (
          !line.startsWith("  Currently:") ||
          line.includes("idle (between actions)")
        )
          return line;
        const action = actions.find(
          (a: { command: { actorId: string } }) =>
            a.command.actorId === characterId
        );
        assert.ok(
          action,
          `cannot map ongoing line to recorded action: ${line}`
        );
        assert.equal(
          line.slice("  Currently: ".length),
          action.command.description
        );
        replaced++;
        return `  ${formatObservedAction({
          kind: "ongoing",
          description: action.command.description,
          startedAt: action.startedAt,
          progressMinutes: action.progressMinutes,
          resolvedDurationTicks: action.resolvedDurationTicks,
          ...(action.command.utterance?.trim()
            ? { utterancePending: true as const }
            : {}),
        })}`;
      })
      .join("\n");
  }
  assert.ok(replaced > 0);
  const request = {
    modelName: trace.modelName,
    system: [{ text: RENDERER_SYSTEM_PROMPT, cacheControl: true }],
    content,
    maxOutputTokens: getModelSettings(trace.provider as ModelProviderName, ModelClass.MEDIUM)?.maxOutputTokens ?? 8192,
  };
  writeFileSync(
    path.join(output, file.replace(".json", ".request.json")),
    JSON.stringify(request, null, 2)
  );
  if (dryRun) {
    console.log(`Prepared ${file}: ${replaced} ongoing actions; no API call`);
    return;
  }
  console.log(
    `Calling ${trace.provider}/${trace.modelName}: ${file} (${replaced} ongoing actions)`
  );
  const started = Date.now();
  const response = await getAdapter(trace.provider as ModelProviderName).chat(
    request
  );
  writeFileSync(
    path.join(output, file),
    JSON.stringify(
      {
        source: path.join(source, file),
        durationMs: Date.now() - started,
        baseline: trace.response,
        response,
      },
      null,
      2
    )
  );
  assert.ok(response.text.trim());
  console.log(`${file}: ${response.text}`);
}
const results = await Promise.allSettled([
  replay("0169-phase-g-perception-render.json"),
  replay("0164-phase-g-perception-render.json"),
]);
for (const result of results)
  if (result.status === "rejected") console.error(result.reason);
assert.ok(results.every((r) => r.status === "fulfilled"));
console.log(`Inspect speech and completion semantics in: ${output}`);
