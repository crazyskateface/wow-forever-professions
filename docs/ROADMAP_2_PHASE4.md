# Roadmap v2 Phase 4 — Route stability and practical friction

Status: implemented on October 9, 2026.

## Stateful route optimization

The dynamic-programming state now includes both profession skill and the active
recipe:

```text
bestScore(skill, activeRecipe)
```

Continuing the active recipe has no transition penalty. Entering a different recipe
can add switch resistance and recipe-specific acquisition friction before its future
route score is considered. Reconstruction carries the selected recipe into the next
skill state, so the engine can reason about an entire sequence rather than smoothing
the output after optimization.

## Transition score

The internal route score for entering a recipe is:

```text
base objective score
+ future route score
+ base objective score × switch penalty ratio
+ base objective score × acquisition friction ratio
+ base objective score × specialization friction ratio
+ base objective score × cooldown friction ratio
```

Only applicable terms are included. Acquisition, specialization, and cooldown
friction apply when entering a recipe segment, including the initial selection. They
do not inflate every continued skill point in that segment.

The ratios keep the heuristic usable for cost, craft-count, and material objectives
without mixing copper, craft counts, and item quantities. Returned route totals remain
the real unpenalized expectations. Friction influences selection but is never reported
as fake crafts, materials, or gold.

## Default policy

```text
recipe switch        7.5%

automatic source       0%
trainer source         0%
vendor source          5%
quest source          10%
drop source           20%
reputation source     20%
unknown source        10%

specialization        10%
cooldown              25%
```

The switch value sits in the roadmap's requested 5–10% range. Trainer and automatic
recipes carry no acquisition friction. Explicit constraints remain stronger than
penalties: an unavailable, wrong-faction, wrong-specialization, disallowed-cooldown,
or otherwise ineligible recipe never becomes a candidate at any score.

When objective scores are exactly equal, continuing the active recipe is the first tie
breaker. Expected craft count and recipe ID remain deterministic secondary tie
breakers.

## Configuration

The optimizer and route request contract accept an optional policy:

```ts
{
  switchPenaltyRatio: 0.075,
  acquisitionPenaltyRatios: {
    vendor: 0.05,
    quest: 0.1,
    drop: 0.2,
    reputation: 0.2,
  },
  specializationPenaltyRatio: 0.1,
  cooldownPenaltyRatio: 0.25,
}
```

Every value is independently configurable from `0` through `1`. Omitted values use
the defaults. Setting every ratio to zero produces the pure objective route while
still preferring continuation on exact ties.

This prepares Phase 7 optimization modes: Recommended can use practical defaults,
Cheapest and Fewest Crafts can reduce selected penalties, and Trainer Friendly can
increase non-trainer acquisition friction.

## Current data limitation

The canonical recipe model currently identifies acquisition category but does not yet
contain travel time, vendor purchase price, drop rarity, or reputation level. Phase 4
therefore treats vendor, quest, drop, reputation, and unknown source categories as
configurable proxies for acquisition effort. Those broad values can be replaced with
recipe-specific evidence as Phase 1 data verification continues.

Cooldown recipes remain hard-excluded unless the request explicitly permits them. If
permitted, their additional friction discourages a theoretical route from depending
on repeated time-gated crafts when an ordinary alternative is close.

## Verification

Tests prove that:

- a sub-threshold saving does not cause a recipe switch
- a meaningful saving still causes a switch
- setting switch resistance to zero restores the lower raw-score transition
- drop acquisition friction can favor a trainer recipe
- acquisition friction can be disabled independently
- specialization and cooldown friction affect otherwise eligible candidates
- invalid ratios are rejected
- all Phase 3 route reconstruction and coverage invariants still hold

Against the canonical Leatherworking `1 → 300` craft-count route:

```text
default practical policy: 13 compressed segments
zero-penalty policy:      27 compressed segments
expected crafts:          approximately 300.342 for both
route status:             complete
```

The practical policy removes more than half of the recipe changes in this dataset
without changing expected crafts at displayed precision. Phase 5 can now present these
stable segments as the primary leveling guide.
