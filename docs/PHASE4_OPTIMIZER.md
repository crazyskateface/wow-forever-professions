# Phase 4 leveling route optimizer

Current-state note: this document describes the first optimizer delivery. The current
engine is the later Roadmap v2 stateful dynamic-programming implementation with
switch/acquisition friction and client-defined Scarce-material avoidance. See
`docs/ROADMAP_2_PHASE3.md`, `docs/ROADMAP_2_PHASE4.md`, and
`packages/optimizer/README.md`.

## Delivered architecture

The optimizer begins as a pure shared package. For each requested skill point it:

1. filters recipes using known-recipe, trainer-only, recipe-exclusion, and reagent-exclusion constraints;
2. calculates the skill-up probability at the current skill;
3. derives expected crafts, material units, and copper cost for that one skill gain;
4. selects the lowest-score recipe for the requested objective;
5. repeats at the next skill and groups adjacent selections into route segments.

This per-skill model is important. A recipe that starts yellow or green becomes less efficient as skill rises, so multiplying one initial craft estimate across an entire range would understate the route.

The result retains stable recipe IDs on every step and segment. The application uses those IDs to open the selected recipe and starting skill in the existing calculator without putting navigation concerns into the optimizer.

Shared Zod contracts validate the route boundary. `POST /api/routes/optimize` adapts fixture recipes and already-stored auction observations into pure optimizer inputs; it never calls an auction vendor. Cost routes use the current market's minimum buyout when present and otherwise its median. Missing observations remain missing rather than becoming zero.

The route-planner UI supports starting and target skill, cost/crafts/material objectives, known-recipe selection, trainer-only filtering, explicit blocker messages, totals, grouped segments, price attribution, and calculator links.

## Current boundaries

- Copper prices must be positive integers when present.
- Missing prices block only the cost objective; craft-count and material-count routes can still be calculated.
- A blocked route identifies the exact skill and distinguishes missing price data from a recipe-coverage gap.
- Recipe acquisition is explicit so trainer-only routes do not infer acquisition from recipe names or source text.
- Fixture recipes remain illustrative and unverified for Forever. The algorithm tests use synthetic mechanics rather than inventing authoritative game data.
- Current fixture acquisition is `unknown`, so a trainer-only route honestly reports a coverage gap until an authoritative source supplies that metadata.

## Manual verification

Start the local API, then request a route directly:

```text
pnpm dev:api
pnpm api:optimize -- 150 180 cost
```

The command accepts `startSkill`, `targetSkill`, `objective`, and an optional base URL. Objectives are `cost`, `crafts`, and `materials`.

The full smoke suite includes the optimizer POST request:

```text
pnpm api:smoke
```

## Phase result

Phase 4 is complete for the fixture-backed route-planning product path: pure optimization, per-skill probability changes, three objectives, constraints, shared contracts, a stored-price-backed API, manual testing, UI controls, blocker states, grouped route segments, and calculator links.

The AWS path was validated on October 8, 2026. A live 150→180 cost route used current stored AH Ledger observations, returned a complete grouped segment through API Gateway and CloudFront, and preserved provider attribution. Browser preflight returned HTTP 204 with POST and `content-type` allowed. The public calculator bundle was rebuilt, uploaded, and invalidated at CloudFront.

Expanding route coverage is now a data-quality task. New recipes and acquisition metadata must come from verified Forever sources; the optimizer will continue surfacing coverage gaps until then.
