# Engine Start Judgement / Settlement Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A command is judged the minute its actor decided it: the World Action Engine's start judgement runs on the 09:00 world before the clock moves, so an action started at 09:00 is under way from 09:00 and a one-minute action (talk or a one-minute walk) ends at 09:01, settled in that same tick.

**Architecture:** The Engine has two functions, each its own session over its own world context. The **start judgement** (one phase, `starts`) runs when the orchestrator drains the inbox, before the clock advances; its transitions commit immediately with `startedAt` = the minute the actor decided. The **settlement** (`endings → characterChanges → itemChanges → sceneChanges → occurrences`) runs after the clock advances, movement steps and progress are spent, over due / replaced / interrupted actions. The old "start credit" approach (booking one minute of progress on a start judged a minute late) is abandoned; its diff is saved at `/private/tmp/claude-501/.../scratchpad/start-credit.patch` for reference only.

**Tech Stack:** TypeScript (Node ≥ 18, pnpm), vitest, biome. Path alias `@/*` → `src/*` in tests.

**Spec:** This plan's own "Design decisions" section below (agreed in conversation on 2026-09-05; no separate spec file). The renderer's `utterancePending` change (`src/roleSim/renderer/{buildBundle,llmRenderer,types}.ts`) is independent, already in the tree, and stays.

## Global Constraints

- Package manager is pnpm; run tests with `pnpm test -- <file>`, lint with `pnpm check`, type-check with `pnpm build:tsc`.
- Per the user's workflow: **no per-task commits and no per-task test runs**. Verify once at the end (Task 9); the user reviews, then one commit for the whole plan.
- Every prompt-reachable string and every rule document under `src/engine/rules/` is English (a test walks the directory and fails on CJK).
- Do not reintroduce the start credit, `endedAsStarted`, `rollCheck`, or a post-flush "first step" in the orchestrator.
- `ISO 8601 gameDateTime` strings are the only time field; `addMinutes` takes whole minutes.

## Design decisions (the spec)

1. **Two sessions per tick, at most.** `resolveTick(context, deps)` derives which function is asked for from the context's triggers (`sessionKindOf`): a `new_action` trigger is a start judgement; anything else a settlement; a mix is refused as unusable. A session runs only its own phases (`SESSION_PHASES` in `worldResolutionStageSchemas.ts`), shares one `MAX_PROVIDER_CALLS` (12) ceiling, and rewinds only within its own phases (`rewindPhaseFor(errors, context, kind)`).
2. **Orchestrator order:** drain at clock T → start session on T → commit starts (`startedAt` = T, `nextWakeAt` = T + duration) → clock T+1 → movement advance (first step of a just-started walk) → `progressMinutes += 1` → triggers (due wins over replaced) → `rollDueChecks` → settlement session on T+1 → subsystems, scripted events, weather → flush → commit settlement transitions → TickReport.
3. **Failures:** start session fails → commands back to the inbox (they start a minute late). Settlement fails → interruptions re-pended; due actions stay due.
4. **Boarding is not part of a drive.** The validator no longer demands a boarding `characterChange` beside a `movement.vehicleId` start (`vehicleBoardingGaps` deleted, `passVersusUnblockConflicts` deleted — neither pair can share a session any more). `initMovementRuntime` refuses a drive whose driver is not in the interior scene with `notAboard: { vehicleId, interiorSceneId }`; the orchestrator turns that into a `failed` transition and `fallbackFact` tells the actor, in Chinese, that they are standing beside the vehicle and must board first.
5. **Prompts name phases within their session:** "phase 1 of 1 of the START JUDGEMENT — STARTS", "phase 2 of 5 of the SETTLEMENT — CHARACTER CHANGES". `session-protocol.md` describes the two functions.
6. **Phase order constant** is `["starts", "endings", "characterChanges", "itemChanges", "sceneChanges", "occurrences"]`; the settlement is the contiguous tail.

---

### Task 1: Phase vocabulary, runner, validators, prompts — DONE

**Files:**
- Modify: `src/engine/resolution/worldResolutionStageSchemas.ts` — `RESOLUTION_PHASES` reordered; `EngineSessionKind`, `SESSION_PHASES`, `sessionOfPhase`, `sessionPhasesOf`; `PHASE_DESCRIPTIONS` texts.
- Modify: `src/engine/resolution/worldActionEngine.ts` — `sessionKindOf(context)`; `Session.kind/phases`; runs `session.phases` only; `rewindPhaseFor(errors, context, session.kind)`; mixed contexts return `unusable`.
- Modify: `src/engine/resolution/worldResolutionStageValidator.ts` — starts phase no longer checks the endings draft; boarding and pass-vs-unblock checks removed; `rewindPhaseFor(errors, context, session = "settlement")` clamps to the session's phases.
- Modify: `src/engine/resolution/worldDeltaValidator.ts` — `vehicleBoardingGaps` and `passVersusUnblockConflicts` deleted with their gate calls.
- Modify: `src/engine/resolution/worldResolutionStagePrompts.ts` — `phaseNumber`/`phaseCount`/`sessionName`/`phaseHeading`; system prompt opening; Vehicles section note; `acceptedSoFarSection` slices the session.
- Modify: `src/engine/rules/session-protocol.md` — two functions, per-session budget wording.

**Interfaces produced:**
- `export type EngineSessionKind = "start" | "settlement"`
- `export const SESSION_PHASES: Record<EngineSessionKind, readonly ResolutionPhase[]>`
- `export function sessionKindOf(context: EngineResolutionContext): EngineSessionKind | "mixed"` (in `worldActionEngine.ts`)
- `export function rewindPhaseFor(errors, context, session?: EngineSessionKind): ResolutionPhase`

- [x] Step 1: Edits applied.
- [x] Step 2: `pnpm exec tsc --noEmit -p tsconfig.json` clean.

### Task 2: Orchestrator reorder and driver-aboard check — DONE

**Files:**
- Modify: `src/engine/core/tickOrchestrator.ts` — `tick()` rewritten in the order of design decision 2; `commitStarts(result, now, newCommands)`; `activeActions()`; `fallbackFact` handles `notAboard`.
- Modify: `src/engine/actions/movementRuntime.ts` — `initMovementRuntime` refuses a driver outside the interior (`notAboard`).
- Modify: `src/engine/actions/types.ts` — `ActionTransition.notAboard?: { vehicleId: string; interiorSceneId: string }`.

- [x] Step 1: Edits applied and type-checked.

### Task 3: Orchestrator tests

**Files:**
- Modify: `src/engine/core/__tests__/tickOrchestrator.test.ts`

**Interfaces consumed:** `createTickEngine({ resolveTickFn })`; the stub `stubResolve()` already answers a `new_action` trigger with `resolvedDurationTicks: 2` and any other trigger with an ending + a citing occurrence, so it serves both sessions unchanged.

- [ ] **Step 1: Make the stub's duration a parameter**

Change the signature to `function stubResolve(durationTicks = 2)` and the start line to `raw.starting.push({ actionId, resolvedDurationTicks: durationTicks });`. Update the doc comment: "a starting action gets a duration and nothing else; a due one gets a result — the same stub serves the start judgement and the settlement, since each context carries only one kind of trigger."

- [ ] **Step 2: Retime the trigger-gate tests**

Replace the bodies of the three tests in `describe("action-driven trigger gate")` after the idle one:

```ts
  it("a new command is judged at the minute it was decided, before the clock moves", async () => {
    const { engine, resolve } = makeEngine();
    const receipt = await engine.submitCommand(command());
    expect(receipt).toMatchObject({ accepted: true, status: "queued" });

    await engine.tick();

    expect(resolve.fn).toHaveBeenCalledTimes(1);
    const context = resolve.calls[0];
    expect(context.actions.newCommands).toHaveLength(1);
    expect(context.trigger.triggers).toEqual([
      { actionIds: [receipt.actionId], reason: "new_action" },
    ]);
    // The start judgement saw the 09:00 world, not the 09:01 one.
    expect(context.tick.tickStartTime).toBe("1923-04-02T09:00:00");

    expect(engine.getAction(receiptActionId(receipt))).toMatchObject({
      status: "active",
      resolvedDurationTicks: 2,
      startedAt: "1923-04-02T09:00:00",
      nextWakeAt: "1923-04-02T09:02:00",
      progressMinutes: 1,
    });
  });

  it("the active action is settled on the tick its minutes run out, and not before", async () => {
    const { engine, resolve } = makeEngine();
    const receipt = await engine.submitCommand(command());

    await engine.tick(); // 09:00 judged, clock → 09:01, one minute spent
    expect(resolve.fn).toHaveBeenCalledTimes(1);

    await engine.tick(); // 09:02 — two minutes spent: due, settled
    expect(resolve.fn).toHaveBeenCalledTimes(2);
    const settlement = resolve.calls[1];
    expect(settlement.trigger.triggers[0].reason).toBe("duration_reached");
    expect(settlement.actions.newCommands).toEqual([]);
    expect(settlement.tick.tickStartTime).toBe("1923-04-02T09:02:00");
    expect(engine.getAction(receiptActionId(receipt))).toMatchObject({
      status: "completed",
      progressMinutes: 2,
    });

    await engine.tick(); // nothing left
    expect(resolve.fn).toHaveBeenCalledTimes(2);
  });

  it("a one-minute action decided at 09:00 ends at 09:01, in one tick with two sessions", async () => {
    const { engine, resolve } = makeEngine(makeDgsm(), stubResolve(1));
    const reports: import("../types.js").TickReport[] = [];
    engine.on("tickCompleted", (r) => {
      reports.push(r);
    });
    const receipt = await engine.submitCommand(command());
    await engine.tick();

    // Start judgement on 09:00, settlement on 09:01: two sessions, one tick.
    expect(resolve.fn).toHaveBeenCalledTimes(2);
    expect(resolve.calls[0].trigger.triggers[0].reason).toBe("new_action");
    expect(resolve.calls[1].trigger.triggers[0].reason).toBe("duration_reached");
    expect(reports[0].transitions.map((t) => t.to)).toEqual([
      "active",
      "completed",
    ]);
    expect(engine.getAction(receiptActionId(receipt))).toMatchObject({
      status: "completed",
      startedAt: "1923-04-02T09:00:00",
      progressMinutes: 1,
    });
    expect(reports[0].commits).toHaveLength(1);
    expect(reports[0].commits[0].outcome?.elapsedMinutes).toBe(1);
    expect(reports[0].occurrences).toHaveLength(1);
  });

  it("emits derived commits and the transition/occurrence report", async () => {
    const { engine } = makeEngine();
    const reports: import("../types.js").TickReport[] = [];
    engine.on("tickCompleted", (r) => {
      reports.push(r);
    });
    await engine.submitCommand(command());
    await engine.tick();
    await engine.tick();

    expect(reports[0].transitions).toHaveLength(1);
    expect(reports[0].transitions[0].to).toBe("active");
    expect(reports[1].commits).toHaveLength(1);
    expect(reports[1].commits[0]).toMatchObject({
      characterId: "npc_1",
      actionText: "I search the desk.",
      definitionId: "act",
    });
  });
```

- [ ] **Step 3: Rewrite the replacement test for two sessions**

```ts
  it("a replacing command is judged at its own minute, and the old action is settled as replaced a minute later", async () => {
    const { engine, resolve } = makeEngine(makeDgsm(), stubResolve(3));
    const first = await engine.submitCommand(command());
    await engine.tick(); // c1 active from 09:00, one minute spent

    await engine.submitCommand(
      command({
        commandId: "c2",
        description: "I abandon the desk and run to the door.",
        replacesActionId: first.actionId,
      })
    );
    await engine.tick();

    expect(resolve.fn).toHaveBeenCalledTimes(3);
    // The start judgement of c2, alone, on the 09:01 world…
    expect(resolve.calls[1].trigger.triggers.map((t) => t.reason)).toEqual([
      "new_action",
    ]);
    // …then the settlement, which is told c1 was cut short.
    expect(resolve.calls[2].trigger.triggers.map((t) => t.reason)).toEqual([
      "replacement",
    ]);
    expect(engine.getAction(receiptActionId(first))?.status).toBe(
      "interrupted"
    );
    const second = engine
      .getActorActions("npc_1")
      .find((a) => a.status === "active");
    expect(second?.command.commandId).toBe("c2");
  });

  it("an action whose time is spent this minute is due, not replaced, whatever its actor does next", async () => {
    const { engine, resolve } = makeEngine(); // duration 2
    const first = await engine.submitCommand(command());
    await engine.tick(); // one minute spent
    await engine.submitCommand(
      command({ commandId: "c2", replacesActionId: first.actionId })
    );
    await engine.tick(); // second minute spent: c1 is due at 09:02

    const reasons = resolve.calls[2].trigger.triggers.map((t) => t.reason);
    expect(reasons).toEqual(["duration_reached"]);
    expect(engine.getAction(receiptActionId(first))?.status).toBe("completed");
  });
```

- [ ] **Step 4: Fix the fallback-occurrence and persistence timings**

In "leaves the Engine's own occurrence alone rather than doubling up": two ticks, `const completedTick = reports[1];`. In "round-trips queued and active actions without re-resolution": after the first tick expect `nextWakeAt: "1923-04-02T09:02:00"`; `dgsm2.setGameDateTime("1923-04-02T09:01:00")`; then a single `await engine2.tick(); // 09:02 — due` with `expect(resolve2.fn).toHaveBeenCalledTimes(1)` and status completed (delete the "09:02 — not due" tick).

- [ ] **Step 5: Retime the road tests and add the first-step test**

In "wakes at exactly the duration it resolved": `expect(started?.nextWakeAt).toBe("1923-04-02T09:02:00");` with the comment "The clock is at 09:00 when the action starts, plus its own 2 ticks." Add, in the same describe:

```ts
  it("takes the first step in the tick the route is judged, so a one-minute walk ends a minute after it was decided", async () => {
    const positions: unknown[] = [];
    const dgsm = makeRoadDgsm();
    // Standing right next to J_A: the whole walk is one step.
    (dgsm as unknown as { getCharacterPosition: () => unknown }).getCharacterPosition =
      () => ({ type: "road", roadId: "R_MAIN", position: 0.05 });
    const { engine, resolve } = makeEngine(dgsm, stubResolveWithWalk());
    const reports: import("../types.js").TickReport[] = [];
    engine.on("tickCompleted", (r) => {
      reports.push(r);
    });
    const receipt = await engine.submitCommand(
      command({ description: "我沿主街往回走到北口。" })
    );
    await engine.tick();

    // Judged on 09:00, stepped and settled on 09:01.
    expect(resolve.fn).toHaveBeenCalledTimes(2);
    expect(
      reports[0].stateChanges.some((c) => c.kind === "character.position")
    ).toBe(true);
    expect(engine.getAction(receiptActionId(receipt))).toMatchObject({
      status: "completed",
      startedAt: "1923-04-02T09:00:00",
      progressMinutes: 1,
    });
  });
```

`makeRoadDgsm` must record position changes for this to be observable through the Applier; if `applier.flush` needs `setCharacterPosition`, add `setCharacterPosition: () => undefined` to the fixture object (check `src/engine/core/applier.ts` for the method name it calls on a `character.position` change).

- [ ] **Step 6: Conditions-reach-the-dice tests**

Each of the three tests currently ticks twice; with a one-minute bar the roll now lands in the first tick. Change each to a single `await engine.tick(); // judged at 09:00, spent and rolled at 09:01` and keep the assertions.

- [ ] **Step 7: Add the driver-not-aboard test**

```ts
describe("a drive whose driver is not in the cab", () => {
  function makeTruckDgsm() {
    const base = makeDgsm();
    const scenes = new Map([
      ["SCN_1", { id: "SCN_1", name: "车库门口", connections: [] }],
      ["S_CAB", { id: "S_CAB", name: "驾驶室", parentLocationId: "VEH_TRUCK", connections: [] }],
      ["J_B", { id: "J_B", name: "南口", connections: [] }],
    ]);
    const truck = {
      id: "VEH_TRUCK",
      name: "旧卡车",
      interiorSceneId: "S_CAB",
      position: { type: "scene", sceneId: "SCN_1" },
    };
    return {
      ...base,
      getState: () => ({ ...base.getState(), scenes }),
      getScene: (id: string) => scenes.get(id) ?? null,
      getVehicle: (id: string) => (id === "VEH_TRUCK" ? truck : null),
      getVehicles: () => [truck],
      getTopology: () => ({
        roads: new Map(),
        nodeSceneIds: new Set(["SCN_1", "J_B"]),
        sceneToParent: new Map(),
        sceneToRoads: new Map(),
      }),
    } as unknown as DynamicGameStateManager;
  }

  function stubResolveWithDrive() {
    const fn = vi.fn(async (context: EngineResolutionContext) => {
      const raw: RawTickResolution = { starting: [], ending: [] };
      for (const t of context.trigger.triggers) {
        for (const actionId of t.actionIds) {
          if (t.reason === "new_action") {
            raw.starting?.push({
              actionId,
              movement: { route: ["J_B"], vehicleId: "VEH_TRUCK" },
            });
          }
        }
      }
      const finalized = finalizeResolution(raw, context);
      return {
        ok: true as const,
        resolution: finalized.resolution,
        movementInits: finalized.movementInits,
        checkInits: finalized.checkInits,
        codeToolInvocations: [],
      };
    });
    return { fn, calls: [] as EngineResolutionContext[] };
  }

  it("never sets off, and the actor is told they are standing beside the vehicle", async () => {
    const { engine } = makeEngine(makeTruckDgsm(), stubResolveWithDrive());
    await engine.submitCommand(command({ description: "我开卡车去南口。" }));
    const reports: import("../types.js").TickReport[] = [];
    engine.on("tickCompleted", (r) => {
      reports.push(r);
    });
    await engine.tick();

    const transition = reports[0].transitions[0];
    expect(transition.to).toBe("failed");
    expect(transition.notAboard).toEqual({
      vehicleId: "VEH_TRUCK",
      interiorSceneId: "S_CAB",
    });
    const fact = reports[0].occurrences[0].facts[0].content;
    expect(fact).toContain("旧卡车");
    expect(fact).toContain("没有出发");
    expect(fact).toContain("先上车");
  });
});
```

`placesAdjacent(dgsm, "SCN_1", "J_B")` must be true for the init to reach the driver check; if the fixture's topology is not enough, put the truck's `position` at `J_B`'s neighbour by giving `SCN_1` a connection `{ id: "connection.scn1.jb", targetId: "J_B" }` and `J_B` the reverse (see `placesAdjacent` in `src/engine/shared/`).

### Task 4: Engine runner tests

**Files:**
- Modify: `src/engine/resolution/__tests__/worldActionEngine.test.ts`

**Interfaces consumed:** `resolveTick`, `sessionKindOf`, `SESSION_PHASES`, `PHASE_TOOL_NAMES`.

- [ ] **Step 1: Make the fixture produce one kind of context**

Change `makeContext` to take `kind: "start" | "settlement"` (default `"start"`): a start context has `newCommands = [cmd, ...(second ? [cmd2] : [])]`, `activeActions` as FYI (`ending`/`talk` still allowed), and a single trigger `{ actionIds: newCommandIds, reason: "new_action" }`. A settlement context has `newCommands: []`, the same `activeActions`, and a trigger `{ actionIds: activeIds, reason: "duration_reached" }`. Replace `happyPath` with:

```ts
const START_ANSWERS: Partial<Record<ResolutionPhase, object>> = {
  starts: {
    starting: [{ actionId: "action_c1", movement: { route: ["SCN_FAR"] } }],
  },
};
const SETTLEMENT_ANSWERS: Record<ResolutionPhase, object> = {
  ...BASE_ANSWERS, // endings/characterChanges/itemChanges/sceneChanges/occurrences: []
};
function startPath(overrides: Partial<Record<ResolutionPhase, object>> = {}) {
  return SESSION_PHASES.start.map((phase) =>
    accept(phase, overrides[phase] ?? START_ANSWERS[phase] ?? {})
  );
}
function settlementPath(overrides: Partial<Record<ResolutionPhase, object>> = {}) {
  return SESSION_PHASES.settlement.map((phase) =>
    accept(phase, overrides[phase] ?? SETTLEMENT_ANSWERS[phase])
  );
}
```

and `retrying(phase, overrides, ...retries)` splices into whichever path contains `phase`.

- [ ] **Step 2: Re-home every test**

Rule: a test about starts (route, check, duration, `startingWithoutSkill`, the starts merge) uses `makeContext()` + `startPath()` and expects `generateToolCalls` called once per phase of the START session; a test about endings, changes, occurrences, dice turns, rewinds or the strict fallback uses `makeContext({ kind: "settlement", ending: true })` (+ `talk: true` where a pure-speech row is needed) and `settlementPath()`, with `phasesRequested()` expected to equal `[...SESSION_PHASES.settlement, ...]`. Request indexes shift accordingly: the rewound item-change test's redo request is `requests()[5]`, and "remembers the downgrade" checks `req.tools[0].strict === (i !== 3)` for sceneChanges at settlement index 3.

- [ ] **Step 3: Replace the "six phases" headline test and add the guard test**

```ts
  it("the start judgement is one request; the settlement is five, in order; each assembles the same resolution the single submission did", async () => {
    script(...startPath());
    const start = await resolveTick(makeContext(), makeDeps());
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    expect(start.resolution.transitions).toEqual([
      expect.objectContaining({ actionId: "action_c1", to: "active" }),
    ]);
    expect(start.movementInits.action_c1).toEqual({ route: ["SCN_FAR"] });
    expect(phasesRequested()).toEqual(["starts"]);
    expect(gate).toHaveBeenCalledTimes(1);

    generateToolCalls.mockClear();
    gate.mockClear();
    script(
      ...settlementPath({
        endings: { endings: [{ actionId: LIVE, mode: "outcome", outcome: "The cabinet gives." }] },
        occurrences: {
          occurrences: [
            {
              actionIds: [LIVE],
              speech: false,
              perceivers: [{ characterId: "npc_2", clarity: "full" }],
              content: "The cabinet door gives way.",
            },
          ],
        },
      })
    );
    const settled = await resolveTick(
      makeContext({ kind: "settlement", ending: true }),
      makeDeps()
    );
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.resolution.transitions).toEqual([
      expect.objectContaining({ actionId: LIVE, to: "completed" }),
    ]);
    expect(phasesRequested()).toEqual([...SESSION_PHASES.settlement]);
    for (const req of requests()) expect(req.messages).toHaveLength(1);
    expect(gate).toHaveBeenCalledTimes(1);
  });

  it("refuses a context that asks for both functions at once, without a model call", async () => {
    const mixed = makeContext({ kind: "start", ending: true });
    mixed.trigger.triggers.push({ actionIds: [LIVE], reason: "duration_reached" });
    const result = await resolveTick(mixed, makeDeps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toContain("two sessions at once");
    expect(generateToolCalls).not.toHaveBeenCalled();
  });
```

- [ ] **Step 4: Update the "offers each phase exactly its own tool" test**

Iterate over `SESSION_PHASES.settlement` on a settlement run, then over `SESSION_PHASES.start` on a start run; expect the instruction to contain `# Phase ${i + 1} of ${phases.length} of the SETTLEMENT` (or `of the START JUDGEMENT`).

### Task 5: Stage validator tests

**Files:**
- Modify: `src/engine/resolution/__tests__/worldResolutionStageValidator.test.ts`

- [ ] **Step 1: Delete the two cross-session tests**: "catches a driver who never boarded — the first phase that can" and "refuses an unblock that duplicates an accepted one-shot grant".

- [ ] **Step 2: Rewrite `rewindPhaseFor` and `phaseIndex` expectations**

```ts
describe("rewindPhaseFor", () => {
  const context = makeContext();
  const only = (target: ResolutionError["target"], session?: "start" | "settlement") =>
    rewindPhaseFor([{ target, message: "x" }], context, session);

  it("maps every target kind to the settlement phase that can fix it", () => {
    expect(only({ kind: "resolution" })).toBe("endings");
    expect(only({ kind: "characterChange", index: 0 })).toBe("characterChanges");
    expect(only({ kind: "itemChange", index: 0 })).toBe("itemChanges");
    expect(only({ kind: "sceneChange", index: 0 })).toBe("sceneChanges");
    expect(only({ kind: "occurrence", actionIds: [ENDING] })).toBe("occurrences");
  });

  it("an action id the settlement cannot place goes to its opening phase, never to starts", () => {
    expect(only({ kind: "action", actionId: ENDING })).toBe("endings");
    expect(only({ kind: "action", actionId: TALKING })).toBe("endings");
    expect(only({ kind: "action", actionId: QUEUED })).toBe("endings");
    expect(only({ kind: "action", actionId: "action_ghost" })).toBe("endings");
  });

  it("the start judgement has one phase, and every fault rewinds to it", () => {
    expect(only({ kind: "resolution" }, "start")).toBe("starts");
    expect(only({ kind: "action", actionId: QUEUED }, "start")).toBe("starts");
    expect(only({ kind: "occurrence", actionIds: [] }, "start")).toBe("starts");
  });

  it("takes the earliest phase over the whole set", () => { /* unchanged body */ });

  it("rewinds nothing early when there is nothing to fix", () => {
    expect(rewindPhaseFor([], context)).toBe("occurrences");
    expect(rewindPhaseFor([], context, "start")).toBe("starts");
  });
});

describe("phaseIndex", () => {
  it("is the execution order: the start judgement first, then the settlement", () => {
    expect(phaseIndex("starts")).toBe(0);
    expect(phaseIndex("endings")).toBe(1);
    expect(phaseIndex("occurrences")).toBe(5);
    expect(phaseIndex("itemChanges")).toBeLessThan(phaseIndex("sceneChanges"));
  });
});
```

- [ ] **Step 3: Starts-phase test that referenced the endings draft**: grep for `already answered in the endings phase`; delete that test if present.

### Task 6: Prompt tests

**Files:**
- Modify: `src/engine/resolution/__tests__/worldResolutionStagePrompts.test.ts`

- [ ] **Step 1**: Replace every `Phase ${n} of 6` / `phase ${n} of 6` expectation with the session heading (`of the START JUDGEMENT` for starts, `of the SETTLEMENT` otherwise). Where the fixture `draft` (endings + starting) is rendered for a settlement phase, the accepted-so-far block must list `endings` and never `starting`; add:

```ts
  it("shows a settlement phase only the settlement's earlier phases as accepted", () => {
    const text = renderPhaseInstruction("characterChanges", makeContext(), draft);
    expect(text).toContain("### `endings` — accepted in phase 1");
    expect(text).not.toContain("### `starting`");
  });
  it("tells the starts phase nothing precedes it", () => {
    const text = renderPhaseInstruction("starts", makeContext(), {});
    expect(text).toContain("Nothing precedes this phase");
    expect(text).toContain("# Phase 1 of 1 of the START JUDGEMENT — STARTS");
  });
```

- [ ] **Step 2**: The budget test still expects "12 model calls" and "3 submission attempts" — unchanged. Add `expect(prompt).toContain("start judgement")` and `toContain("settlement")` inside the loop that renders every system prompt.

### Task 7: Movement runtime test

**Files:**
- Modify: `src/engine/actions/__tests__/movementRuntime.test.ts:200-212`

- [ ] **Step 1**: Replace "refuses the wheel at first advance when the driver is not inside" with:

```ts
  it("refuses the wheel at init when the driver is not inside", () => {
    const dgsm = makeDgsm();
    // npc_1 stands at J_A beside the truck: a drive is judged the minute it
    // is commanded, against the world as it stands, and nobody boards them.
    const result = initMovementRuntime(dgsm, "npc_1", ["J_B"], "VEH_TRUCK");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("not inside");
    expect(result.notAboard).toEqual({
      vehicleId: "VEH_TRUCK",
      interiorSceneId: "S_CAB",
    });
  });

  it("stops a drive whose driver was pulled out of the cab mid-route", () => {
    const dgsm = makeDgsm();
    dgsm.__positions.set("npc_1", { type: "scene", sceneId: "S_CAB" });
    const result = initMovementRuntime(dgsm, "npc_1", ["J_B"], "VEH_TRUCK");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    dgsm.__positions.set("npc_1", { type: "scene", sceneId: "J_A" });
    const advanced = advanceMovement(dgsm, "npc_1", result.state);
    expect(advanced.status).toBe("blocked");
    expect(advanced.blockedReason).toContain("not inside");
  });
```

### Task 8: Docs

**Files:**
- Modify: `CLAUDE.md` (Runtime flow diagram steps 5–12; "The LLM seams" World Action Engine paragraphs)
- Modify: `README.md:112-147`
- Modify: `docs/engine-operations.md` §2 (tick order list), §3 ("六个提交工具" and the two paragraphs after it)
- Check only: `src/engine/rules/world/action-adjudication.md`, `occurrences-and-dialogue.md` — their statements ("even the shortest action takes at least one minute and resolves on a later tick"; "a starting action's utterance … spoken when the action ends") remain true and need no change.

- [ ] **Step 1: CLAUDE.md** — replace the runtime-flow steps with:

```
          1. drain the inbox at the clock the actors decided on
          2. START JUDGEMENT session (starts only) on that minute → commit
             starts, startedAt = that minute; no commands → 0 model calls
          3. clock  4. movement runtimes (first step of a new walk) + progress
          5. collect settlement triggers (due / replacement / interrupted)
          6. SETTLEMENT session (endings → changes → occurrences); skipped
             when no triggers → 0 model calls
          8. anchor subsystems + scripted events
          11. single Applier flush (StateChanges + settlement WorldDeltas)
          12. commit the settlement's lifecycle, emit TickReport
```

and add after the "no central scheduler" paragraph: **"A command is judged the minute its actor decided it."** The actor perceived 09:00 and acted; the start judgement runs on the 09:00 world before the clock moves, so `startedAt` is 09:00 and a one-minute action ends at 09:01, settled in that tick with its words in that tick's occurrences. Boarding a vehicle is its own action; a drive whose driver is not in the cab fails at start and the actor is told. Rewrite the World Action Engine paragraph: two functions, `sessionKindOf`, `SESSION_PHASES`, phases per session, per-session budget/rewind, no cross-session checks (`vehicleBoardingGaps`, `passVersusUnblockConflicts` gone).

- [ ] **Step 2: README.md** — same content in English prose: "runs one of two sessions per triggered moment: the start judgement (`starts`) the minute commands arrive, the settlement (`endings → characterChanges → itemChanges → sceneChanges → occurrences`) when actions end." Replace "Once all six phases are accepted" with "Once every phase of a session is accepted".

- [ ] **Step 3: docs/engine-operations.md** — replace the numbered tick order with:

```
1. drain 命令 inbox（时钟还停在角色决定的那一分钟；死亡演员的命令直接 failed）
2. 有新命令就开 **start 判定会话**（只有 starts 阶段），在这一分钟的世界上定时钟、门槛、路线；通过即提交为 active，`startedAt` 就是这一分钟；路线接不上或司机不在车里 → 当场 failed
3. 时钟推进 1 分钟
4. 移动 runtime 推进（刚开始的路在这里走第一步；堵住→中断，到达→到期）；在飞动作 `progressMinutes += 1`
5. 收集结算触发器：到期、被替换（到期的永远不算被替换）、中断
6. `rollDueChecks`，然后开 **结算会话**（endings → characterChanges → itemChanges → sceneChanges → occurrences）；无触发 = 不调用
7. anchor 子系统 + 脚本事件
8. 天气判断（同前）
9. 单次 Applier flush
10. 提交结算会话的生命周期转换，发 `TickReport`
```

and rewrite "六个提交工具" as "两个功能、六个提交工具": start 判定一个阶段、结算五个阶段，各自一次会话、各自一份上下文、各自 12 次调用预算、各自回退。Note the boarding change: 开车前的上车是单独的一个动作；`initMovementRuntime` 在判定时拒绝不在车厢里的司机。

### Task 9: Verification and hand-off

- [ ] **Step 1**: `pnpm check` — fix what biome reports (imports order, unused imports such as `RESOLUTION_PHASES` in the prompts module).
- [ ] **Step 2**: `pnpm build:tsc` — expected: no errors.
- [ ] **Step 3**: `pnpm test` — expected: all green. Known files to watch: the six touched test files plus `src/engine/__tests__/integration/*.test.ts` (their `resolveWith` stubs answer only endings, which the settlement context still carries).
- [ ] **Step 4**: Report results to the user; the user reviews; one commit for the whole plan (no earlier commits).
