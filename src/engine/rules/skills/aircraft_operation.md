---
id: aircraft_operation
title: "Aircraft Operation"
description: "Pilot and safely operate aircraft."
durationGuidance:
  default: 3
  range: "1-30"
  notes: "a critical maneuver 1-3 min; a takeoff or landing sequence 5-10 min; an emergency or a prolonged flight 20-30 min"
---

# Aircraft Operation guidance

Use for flying: takeoff, landing, maneuver, and holding an aircraft
together in conditions it was not meant for. Weather, fuel, damage, and
darkness are the binding inputs.

## Applicability

- Accepted for takeoff and landing under any pressure, evasive or precise
  flying, and emergency handling.
- Rejected for navigation as route-finding (Survival & Navigation) and for
  repairs (Repair & Engineering).
- An aircraft the actor has no type experience with calls for a higher
  `requiredLevel`, not an automatic rejection.

## Success levels

- **Regular** — The maneuver is flown. Normal fuel use is possible; airframe damage is not a default success cost.
- **Hard** — Flown precisely, on the intended line, without further damage.
- **Extreme** — An exceptionally controlled feasible recovery or landing;
  do not exceed the supplied airframe, weather, fuel and route constraints.

## Failure

- The maneuver is not achieved: a go-around, altitude lost, the approach
  abandoned. Fuel is spent and the situation is tighter than before.
- **Fumble** — A supported loss of control, impact or structural failure.
  Scale consequences to altitude, speed, protection and actual force. A fumble
  does not automatically mean a fatal crash or injury to every occupant.

## State surface

Typical deltas this domain produces. Not a requirement and never a substitute
for what actually happened — a one-off descriptive result is occurrence
`content`, not a state change.

- `movement.route` with `vehicleId` — ordinary travel by the aircraft;
  occupants remain in its interior scene. Use `character.position` only for
  boarding, leaving or discontinuous displacement.
- `item.set` / `item.destroy` — airframe, engine, cargo, and fuel spent.
- `character.hp` and `character.addCondition` — a hard landing or a crash.
- `scene.addCondition` and `scene.environmentHazard` — where it comes down:
  wreckage, fire, a field no longer crossable.
