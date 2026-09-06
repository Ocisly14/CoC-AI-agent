---
id: repair_engineering
title: "Repair & Engineering"
description: "Diagnose, repair, improvise, and operate technical or mechanical equipment."
durationGuidance:
  default: 15
  range: "3-60"
  notes: "swap a fuse or make a quick adjustment 3-10 min; trace a fault or replace a part 15-30 min; rewire a system or rebuild an assembly 45-60 min"
---

# Repair & Engineering guidance

Use for diagnosing, fixing, improvising, and operating technical and
mechanical equipment — electrical and mechanical alike. Parts and tools are as
binding as skill: name what is missing when something is.

## Applicability

- Accepted for finding the fault, effecting the repair, jury-rigging a
  substitute, and running machinery that needs technique rather than a
  licence.
- Rejected for bypassing a lock as a security problem (Stealth & Security),
  for driving a vehicle (Land Vehicle Operation), and for building an object
  as craft rather than as a mechanism (Knowledge & Craft).
- A repair with no parts available is not a repair. It is either an
  improvisation with a stated compromise, or a rejection.

## Success levels

- **Regular** — It works again, or works well enough. An improvisation carries
  a named limitation — it will hold for a while, it will not take load.
- **Hard** — A sound repair within the assessed time and available parts.
  Describe the defect actually corrected; do not guarantee future reliability.
- **Extreme** — The best feasible repair or improvisation from supplied parts.
  Do not invent an upgrade, unavailable component or impossible capability.

## Failure

- The fault stands. Time and any consumed parts are gone, and the actor may
  have narrowed it down without fixing it.
- **Fumble** — The equipment is made worse: a part shears, a short is created,
  a working subsystem is broken in the attempt. Apply the item damage, and
  where the machine was doing something, stop it.

## State surface

Typical deltas this domain produces. Not a requirement and never a substitute
for what actually happened — a one-off descriptive result is occurrence
`content`, not a state change.

- `item.set` — repaired, adjusted, jury-rigged or damaged while still in play;
  `item.destroy` when the attempt ruins it beyond use.
- `item.create` — an improvised part made from what was at hand.
- `scene.removeCondition` / `scene.addCondition` — power restored and the dark
  lifted, or a machine now running and audible.
- `scene.connectionBlock` — a door, gate, or shutter mechanism that now opens
  or no longer does.
- `character.fatigue` — supported work cost only if code has not applied it.
