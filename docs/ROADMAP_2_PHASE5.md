# Roadmap v2 Phase 5 — Guide-first UI

Status: implemented on October 10, 2026.

Subsequent UI additions through October 14 include the Forever Changes tab, shared
current-skill control, item icons, comparison badges, and skill-aware change filters.

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
- recipe name and crafted-item icon
- recipe acquisition source
- New/Updated comparison badge when applicable
- ordinary route alternatives

The left-rail footer summarizes total expected crafts and the number of stabilized
route steps. Loading, unavailable, empty-search, and blocked-route states are shown
in the rail instead of falling back to a misleading recipe ordering.

The separate route-planner workspace shows expected crafts, material units, expected
cost, and per-segment totals before generating the shopping plan.

Selecting a guide step opens that recipe in the existing calculator and moves its
skill control to the start of the selected segment. The right pane continues to show
the recipe thresholds, skill-up probability, expected crafts and cost, graph,
materials, outputs, and data-quality context so the recommendation can be inspected.

## All Recipes

**All recipes** remains the secondary rail tab. It keeps the virtualized complete
catalog, alphabetical search, difficulty indicator, reagent count, and skill range.
This view is independent of the optimized route and supports exploration and recipe
comparison.

Rows now use locally extracted item icons with native browser lazy loading and display
New/Updated badges from the active Classic Era → Forever comparison.

## Forever Changes integration

The third primary rail tab presents the stored build comparison directly; it does not
show a redundant comparison chooser. It includes status totals, search, profession and
item-type filters, expandable before/after fields, icons, and provenance. The same
current-skill slider position used by the guide drives availability tags and toggles
for recipes above the player's skill or with unknown learning requirements.

The guide and All Recipes reuse the comparison status map so New and Updated recipes
remain visible while the player is choosing what to craft, not only in the dedicated
history view.

## Planner integration

The existing route planner remains available from the workspace navigation and the
guide's blocked/error action. A manually submitted route replaces the guide rail with
the selected range, objective, recipe knowledge, and trainer-only constraints.
Current skill is now an immediate rail control for both the guide and Forever Changes;
target skill remains part of the route planner.

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

