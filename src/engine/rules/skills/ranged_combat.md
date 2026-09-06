---
id: ranged_combat
title: "Ranged Combat"
description: "Use firearms, bows, crossbows, and thrown combat weapons."
durationGuidance:
  default: 1
  range: "1-5"
  notes: "a single exchange about 1 min; a prolonged firefight 2-5 min; pursuing a fleeing target takes longer"
---

# Ranged Combat guidance

Use for attacking at a distance: firearms, bows and crossbows, and
weapons thrown to injure. Range, cover, light, and the weapon's state set the
required level.

## Applicability

- Accepted for aimed and hurried shots, covering fire, and thrown weapons used
  as weapons.
- Rejected within grapple range where the weapon cannot be brought to bear
  (Melee Combat), and for throwing an object for distance or accuracy with no
  target to injure (Athletics).
- Ammunition and condition are checked, not assumed: an empty or jammed weapon
  is a rejection with that stated, and rounds spent are a real item change.

## Success levels

For active resistance, name the defender and an applicable defense skill
in the starts phase. Code supplies the resolved dice verdict, including
opposition, at settlement; there is no opposed-roll tool here. Use `diceRoll.met`,
not the actor's success level alone. Damage, when the attempted effect deals it,
comes from `damageRoll`. A disarm or restraint need not deal HP damage.

The levels below describe possible quality, not automatic extra injuries.
Every displacement, disarm or impairment needs the actual attack and physical
effect to support it; a good roll alone never makes a healthy target unconscious.

- **Regular** — A hit. Apply the rolled damage.
- **Hard** — Well placed within the stated aim. An involuntary drop or limb
  impairment needs the actual impact to support it; taking cover is the
  target's decision, not an automatic effect of covering fire.
- **Extreme** — The best feasible placement. Injury follows rolled damage
  and actual impact, not an automatic removal of the target from the exchange.

## Failure

- The shot misses. The round is still spent and the noise still happens —
  everyone within earshot perceives it, and that is an occurrence.
- **Fumble** — The weapon jams, misfires, or breaks, or the shot hits
  something unintended: a bystander, a lamp, a fuel drum. Apply the real
  damage where it landed and the real state change to the weapon.

## State surface

Typical deltas this domain produces. Not a requirement and never a substitute
for what actually happened — a one-off descriptive result is occurrence
`content`, not a state change.

- `character.hp` — damage from `damageRoll`, never estimated.
- `character.addCondition` — bleeding, pinned, unconscious, a limb disabled.
- `item.set` — rounds and arrows spent, magazines emptied, or a weapon jammed
  or damaged but still in play; `item.destroy` for irreversible breakage.
- `scene.addCondition` / `scene.environmentHazard` — an actual supported
  impact and its lasting consequence. A miss alone does not authorize choosing
  a lamp or fuel drum to add damage; require a fumble or an independent cause.
- The noise reaches everyone in earshot. That is an occurrence with a wide
  perceiver list, not a state change.
