---
id: swimming
title: "Swimming"
description: "Swim, dive, stay afloat, and act effectively in water."
durationGuidance:
  default: 3
  range: "1-30"
  notes: "a short crossing 1-3 min; a river crossing 5-10 min; a long swim or a rescue 15-30 min"
---

# Swimming guidance

Use for staying up, getting across, going under, and doing anything
useful while in water. Current, cold, darkness, and what the actor is wearing
or carrying decide the difficulty far more than distance does.

## Applicability

- Accepted for swimming, diving, treading water, and acting under or on water,
  including pulling someone else out.
- Rejected for handling a boat (Watercraft Operation) and for dry-land
  movement (Athletics).
- Encumbrance is binding: a clothed, laden actor in cold moving water is at a
  higher required level regardless of how short the crossing looks.

## Success levels

- **Regular** — The feasible swimming task succeeds. Item loss is not a default
  cost of success; it requires a supplied current, impact or other concrete cause.
- **Hard** — Made with control: cargo kept, breath kept, arriving able to act
  immediately.
- **Extreme** — Exceptional control within the body, equipment and water
  conditions. Success does not grant impossible breath or instant completion.

## Failure

- No progress. The actor is swept back, loses the line, or surfaces where they
  started. Apply actual exertion only if code has not already done so. Additional loss
  requires a fumble or an independently established cause.
- **Fumble** — The actor goes under: water inhaled, an HP loss, and a drowning
  or exhaustion condition that persists until someone or something resolves
  it, when supported by actual immersion and exposure. A rescue fumble
  does not automatically injure both people.

## State surface

Typical deltas this domain produces. Not a requirement and never a substitute
for what actually happened — a one-off descriptive result is occurrence
`content`, not a state change.

- `movement.route` — ordinary swimming through connected places;
  `character.position` only for discontinuous displacement, and
  `character.spot` for a different place within the same scene.
- `character.fatigue` — actual effort not already owned by code.
- `character.hp` and `character.addCondition` — water inhaled, hypothermia,
  exhaustion. These persist until something resolves them.
- `item.move` / `item.destroy` — carried items lost to the water or ruined by
  it. Check material, waterproofing and duration of exposure rather than
  automatically destroying all carried paper or ammunition.
