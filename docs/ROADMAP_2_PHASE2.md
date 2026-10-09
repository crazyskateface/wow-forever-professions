# Roadmap v2 Phase 2 — Leveling cost model

Status: implemented on October 9, 2026.

## Domain boundary

Phase 2 now has a framework-independent evaluator in `@forever-professions/domain`.
It accepts one canonical recipe plus an explicit player/data context and returns either:

- a usable per-skill evaluation with probability, expected crafts, detailed reagent
  usage, material units, and copper cost; or
- an ineligible result with machine-readable reasons.

The main entry points are:

```ts
evaluateRecipeAtSkill(recipe, context)
evaluateRecipeRange({ recipe, startSkill, targetSkill, ...context })
```

The optimizer consumes this API instead of maintaining its own probability, material,
price, and eligibility calculations.

## Cost model

At each profession skill `s`:

```text
expected crafts(s) = 1 / skill-up probability(s)

expected reagent quantity(s, item) =
  quantity per craft(item) × expected crafts(s)

craft cost =
  Σ(quantity per craft(item) × unit price(item))

expected leveling cost(s) =
  craft cost × expected crafts(s)
```

Costs use copper internally. A recipe can still be eligible when a reagent price is
missing, but its craft and expected cost are omitted and the missing item IDs are
returned explicitly. This lets craft-count and material objectives continue to work
without pretending that an incomplete price is zero.

## Range behavior

Range evaluation calls the per-skill model once for every transition. A `175 → 182`
evaluation therefore calculates seven independent probabilities and expected craft
counts. It does not apply the probability at 175 to the whole range.

The range result contains every per-skill evaluation, the first blocked skill when
there is one, and aggregated expected crafts, material units, and per-item reagent
usage. A full expected copper total is present only when every skill point is eligible
and every reagent is priced.

## Eligibility rules

The evaluator accounts for:

- exact profession and Forever build
- learning skill and unknown learning ranks
- available, unavailable, and unknown availability
- faction
- specialization spell
- profession branch
- recipe acquisition through the trainer-only constraint
- cooldowns
- known recipes and explicit recipe/reagent exclusions
- whether the recipe can still grant a skill-up

Known cooldown recipes are excluded unless cooldown use is explicitly allowed.
Faction-, specialization-, and branch-restricted recipes require matching player
context. Explicitly unavailable recipes are always excluded.

Unknown availability and unknown faction remain permissive by default because most of
the current Forever Leatherworking catalog still lacks those observations. Callers can
set `allowUnknownAvailability: false` or `allowUnknownFaction: false` for a strict,
verified-only calculation. Unknown learning ranks remain ineligible because there is
no safe skill point at which to introduce those recipes.

## API preparation

Route requests can now carry optional:

```text
faction
specialization spell IDs
profession branch ID
known recipe IDs
trainer-only preference
unknown-data strictness
cooldown permission
recipe and reagent exclusions
```

The API supplies the selected profession and dataset build to the optimizer, so a
recipe from another profession or build cannot enter a route accidentally.

## Verification

Deterministic tests cover:

- orange, yellow, and green per-skill costs
- range probability changes and reagent aggregation
- missing price behavior
- unavailable, early, unknown-rank, and gray recipes
- profession/build mismatch
- faction, specialization, profession branch, and cooldown constraints
- acquisition, known-recipe, recipe, and reagent filters
- strict versus permissive unknown-data policies
- optimizer and API integration

A local Leatherworking `1 → 300` craft-count request completes with 299 per-skill
steps after the optimizer is routed through the shared model.

Phase 3 remains intentionally separate: the current optimizer still chooses the best
candidate independently at each skill. The next phase replaces that greedy selection
with global route optimization and route reconstruction.
