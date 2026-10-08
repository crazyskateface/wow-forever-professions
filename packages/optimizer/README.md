# Leveling route optimizer

This package owns the pure Phase 4 route-planning algorithm. It has no framework, database, vendor, or AWS dependencies.

The first slice selects the best recipe for every individual skill gain, recalculating skill-up probability, expected crafts, expected material count, and expected cost at the current skill. Adjacent selections of the same recipe are then grouped into route segments while preserving the per-skill steps for explanation and debugging.

Supported objectives and constraints:

- minimum expected copper cost;
- minimum expected crafts;
- minimum expected material units;
- known-recipe filtering;
- trainer-only filtering;
- excluded recipes;
- excluded reagent items.

Missing prices never become zero. A cost route reports `missing-price-data`; a gap in available recipes reports `no-eligible-recipe` and identifies the blocked skill.

Run the focused tests with:

```text
pnpm --filter @forever-professions/optimizer test
```
