# Roadmap v2 Phase 5 — Guide-first UI

Status: implemented on October 10, 2026.

## Primary experience

The application now opens with **Leveling guide** selected in the profession rail.
After the canonical catalog loads, the client automatically requests a practical
Leatherworking route from skill `1` through `300`, using the Phase 4 optimizer and
all recipes in the loaded catalog.

Craft count is the default objective for this first guide because the local dataset
does not yet include a complete live market snapshot. The optimizer still returns
the same cost fields used by future auction-house pricing; the guide explicitly says
when an estimate is unavailable rather than presenting a fabricated price.

## Guide entries

Each compressed route segment is rendered as a guide step with:

- skill range
- recipe name
- expected crafts
- primary material quantities for the whole segment
- estimated cost, when available
- recipe acquisition source

The left-rail footer summarizes total expected crafts and the number of stabilized
route steps. Loading, unavailable, empty-search, and blocked-route states are shown
in the rail instead of falling back to a misleading recipe ordering.

Selecting a guide step opens that recipe in the existing calculator and moves its
skill control to the start of the selected segment. The right pane continues to show
the recipe thresholds, skill-up probability, expected crafts and cost, graph,
materials, outputs, and data-quality context so the recommendation can be inspected.

## All Recipes

**All recipes** remains the secondary rail tab. It keeps the virtualized complete
catalog, alphabetical search, difficulty indicator, reagent count, and skill range.
This view is independent of the optimized route and supports exploration and recipe
comparison.

## Planner integration

The existing route planner remains available from the right-side navigation and the
guide's **Adjust** action. A manually submitted route replaces the guide rail with
the selected range, objective, recipe knowledge, and trainer-only constraints.
Phase 6 will promote current and target skill to immediate top-level guide controls.

## Local verification

The Docker PostgreSQL service was brought to a healthy state and the canonical
Forever `1.60.1.69977` Leatherworking import restored:

```text
recipes:       603
items:         760
provenance:    603
```

Through the running Vite proxy, the catalog returned all 603 recipes and the live
optimizer generated a complete `1 → 300` route with 13 segments and approximately
`300.342` expected crafts.

The previously reported Vite `./leveling-cost.js` resolution overlay came from the
old development-server state. A clean production build succeeds, and the restarted
development server resolves both the domain index and the leveling-cost module.

