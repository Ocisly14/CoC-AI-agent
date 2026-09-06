---
id: watercraft_operation
title: "Watercraft Operation"
description: "Pilot, navigate, and handle boats and other watercraft."
durationGuidance:
  default: 3
  range: "1-30"
  notes: "a critical maneuver 1-3 min; docking or clearing a hazard 5-10 min; handling a storm 20-30 min"
---

# Watercraft Operation guidance

Use for handling boats and other watercraft — steering, docking,
reading water, and keeping a vessel workable in bad conditions. Weather, sea
state, and the vessel's condition set the difficulty.

## Applicability

- Accepted for maneuvers under pressure: docking in wind, clearing a hazard,
  riding out weather, running without lights.
- Rejected for open-water route-finding (Survival & Navigation), for engine
  repair (Repair & Engineering), and for swimming once out of the boat.
- A vessel the actor has no way to operate — no fuel, no crew for its size —
  is a rejection with the missing thing stated.

## Success levels

- **Regular** — The vessel does what was asked, within its capabilities. Noise and wake can follow;
  damaging contact with a dock is not a default cost of success.
- **Hard** — Cleanly handled: quiet, no damage, position held.
- **Extreme** — Exceptional control within the vessel's limits, water and
  weather. Do not grant a physically impossible berth or untraversed distance.

## Failure

- The maneuver misses: the approach must be made again, the hazard is still
  ahead, ground is lost against wind or current.
- **Fumble** — A supported grounding, collision or swamping. Resolve the
  actual impact and protection; damage and people overboard are consequences
  only where the physical cause warrants them, not automatic fumble bonuses.

## State surface

Typical deltas this domain produces. Not a requirement and never a substitute
for what actually happened — a one-off descriptive result is occurrence
`content`, not a state change.

- `movement.route` with `vehicleId` — ordinary travel by the vessel;
  occupants remain in its interior scene. Use `character.position` only for
  boarding, leaving or discontinuous displacement.
- `item.set` / `item.destroy` — hull, rigging, engine, cargo.
- `character.hp` and `character.addCondition` — people put in the water, and
  what the water then does to them.
- `scene.addCondition` — a grounded vessel, a blocked channel, a wreck.
