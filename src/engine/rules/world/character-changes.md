# Character Changes

Character changes represent persistent, objective state. Each entry names the
action that caused it with `sourceActionId` and the affected `characterId`.
Persistent means retained across ticks until changed, not permanent.
Momentary description belongs in an occurrence.

## Available operations

- `hp {delta, reason}` — physical injury or healing.
- `fatigue {delta, reason}` — persistent exertion or recovery not already owned
  by a deterministic subsystem.
- `position {position:{type:"scene", sceneId}}` — non-travel displacement only;
  follow `movement-and-position.md`.
- `spot {spot}` — position within the current place.
- `addCondition {condition:{id, description}}` — a persistent, objectively
  verifiable major impairment.
- `removeCondition {conditionId}` — remove a real existing condition when the
  supplied world and action establish that it ended.
- `setAppearance {appearance}` — replace the character's complete persistent
  appearance description.

## Conditions

`character.addCondition` has a strict objective threshold. Inner activity is never a condition.

A character condition must satisfy all three tests:

1. it persists across ticks;
2. another observer can see it or independently verify it;
3. it makes an important mental or physical function impossible or severely
   impaired.

Its description states both the objective condition and its functional impact.
Examples include unconsciousness, a fracture preventing use of a limb, severe
bleeding, poisoning, hypothermia, catatonia or disorientation so profound that
the person cannot act coherently.

Thoughts, feelings, moods, suspicion, recognition, resolve and relationship
stances are not conditions. They belong to the character's own perception and
memory pipeline.

## Appearance

`setAppearance` replaces the whole persistent appearance, so preserve every
part that remains true and change only what the accepted outcome altered.
This includes durable changes such as a new scar or shaved hair, and repairs
to existing prose whose claims about the current body are no longer true.

A visible state that remains relevant across ticks, such as a dressing or wet
clothing, can be recorded in appearance without making it permanent. Use a
condition only for a major functional impairment meeting all three tests.
A passing gesture or momentary expression belongs only in an occurrence.

Existing appearance is also a claim about the current body. When it already states a visible bodily state—a split hand still
bleeding, a face still filthy—and this tick's outcome changed that state,
`setAppearance` is the only place the change can land, whether or not the
state was ever severe enough to be a condition. Rewrite the sentence that has
become false and leave every other part of the prose untouched. Appearance
left asserting what the action undid is read as current by every tick after
this one: the next settlement sees a wound nobody treated, narrates it as
still open, and someone dresses it a second time.

Before submitting, compare each affected character's CURRENT appearance,
conditions and position with the accepted outcomes. No HP change and no
existing condition do NOT excuse stale appearance. If the outcome says a
bleeding wound was cleaned, dressed and stopped bleeding, replace appearance
that still says it is bleeding with the supported treated state. Do not claim
the wound healed or vanished unless the outcome says so. Preserve unrelated
features, clothing and injuries. A temporary result can invalidate existing
prose even when it does not qualify as a new condition: repairing that claim
is required, not an optional cosmetic addition. Submit `[]` only after this
comparison finds no differences to record.

## SAN

There is no `san` operation. SAN changes only through an occurrence's
`sanityChecks` (see `sanity-check.md`): declare the exposure, and code rolls
and writes the loss. Nothing else you write moves SAN — not treatment, not
recovery, not what a conversation or a text did to someone. Record what
happened as an occurrence and, where it meets the threshold above, as a
condition.
