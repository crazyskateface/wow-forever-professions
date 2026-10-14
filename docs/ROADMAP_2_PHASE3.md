# Roadmap v2 Phase 3 — Route optimizer v1

Status: implemented on October 9, 2026.

Historical checkpoint: Phase 4 has since added active-recipe state, switch resistance,
and practical acquisition friction as described in `ROADMAP_2_PHASE4.md`.

## Route algorithm

The route optimizer now uses a backward dynamic-programming pass rather than
constructing the result greedily from the start skill.

For the selected objective, it first evaluates every eligible recipe at every skill
through the shared Phase 2 cost model. It then calculates:

```text
bestScore[target] = 0

for skill from target - 1 down to start:
  bestScore[skill] = min(
    candidate step score + bestScore[skill + 1]
  )
```

The selected candidate at each state is recorded separately from its total future
score. Once the table is complete, the optimizer reconstructs the route from the
requested start to target and compresses consecutive uses of the same recipe into
guide ranges.

Objective step scores remain:

```text
cost      → expected copper cost for one skill-up
crafts    → expected crafts for one skill-up
materials → expected reagent units for one skill-up
```

Equal-score candidates use expected craft count and then recipe ID as deterministic
tie breakers. Identical inputs therefore produce identical routes.

## Blocked routes

All requested skill points are evaluated before reconstruction. If the dataset has a
coverage gap or cost optimization reaches a skill where every usable recipe lacks
price data, the result identifies the first blocked skill and reason.

The engine still reconstructs the optimal reachable prefix. That preserves useful
guide output before a later data gap while never claiming that the requested target
was reached.

## Route invariants

A complete route guarantees:

- exactly one decision for every skill transition
- the first step starts at the requested current skill
- the final step reaches the requested target
- reconstructed steps contain no gaps
- compressed segments contain no gaps or overlaps
- gray and unavailable recipes never enter the decision table
- each step uses the Phase 2 probability and expected-cost calculation for that skill

## Current model boundary

Forever profession crafts currently advance at most one profession skill point, and
the Phase 3 model has no route-dependent state such as a switch penalty or one-time
acquisition cost. Under those assumptions every candidate at skill `s` leads to the
same next state, `s + 1`.

The dynamic-programming recurrence is still the correct global formulation, but for
some datasets it can produce the same decisions as a per-skill minimum. The value of
this phase is the explicit future-cost table, deterministic route reconstruction, and
the state boundary needed by Phase 4. Switch resistance and acquisition friction will
make the global decision materially different by adding the previous recipe or other
route state to the recurrence.

## Deterministic test fixtures

Tests now prove that:

- the recipe with the cheapest raw craft can lose because its skill-up probability
  makes its expected leveling cost higher
- changing probability changes the selected recipe
- gray recipes are never selected
- explicitly unavailable recipes are never selected
- the reconstructed per-skill path is correct
- compressed route ranges contain no gaps
- a complete route reaches the requested target
- a blocked route returns the optimal prefix up to its first coverage gap

## Leatherworking result

The canonical Forever Leatherworking dataset still produces a complete `1 → 300`
craft-count route through the new engine:

```text
recipes considered: 603
per-skill decisions: 299
compressed segments: 35
route bounds: 1 → 300
expected crafts: approximately 300.342
local API evaluation: approximately 165 ms
```

Phase 4 can now extend the state and scoring model with switch resistance and
acquisition friction without moving route logic into the UI.
