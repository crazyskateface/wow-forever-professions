# Leveling route optimizer

This package owns the pure route-planning algorithm. It has no framework, database,
vendor, or AWS dependencies.

The optimizer evaluates every eligible recipe at every individual skill gain through
the shared domain cost model. A backward dynamic-programming pass tracks both skill
and the active recipe, allowing switch resistance and acquisition/specialization/
cooldown friction to influence the complete route. Adjacent selections of the same
recipe are grouped into segments while preserving the per-skill decisions for
explanation and debugging. Returned totals are the real unpenalized expectations;
practical friction affects selection only.

Supported objectives and constraints:

- minimum expected copper cost;
- minimum expected crafts;
- minimum expected material units;
- known-recipe filtering;
- trainer-only filtering;
- excluded recipes;
- excluded reagent items;
- faction, specialization, branch, availability, unknown-data, and cooldown rules;
- configurable switch and acquisition-friction policy.

The application identifies scarce reagent item IDs from the build-stamped Forever
client `ItemNameDescription` classification imported with the recipe catalog.
Scarcity is optimized lexicographically ahead of the selected cost, craft, or material
objective, so a complete route without scarce materials always wins. Scarce recipes
remain usable when they are the only way through a skill range and are hidden from
ordinary route alternatives. The optimizer does not own a list of scarce item names.

Missing prices never become zero. A cost route reports `missing-price-data`; a gap in available recipes reports `no-eligible-recipe` and identifies the blocked skill.

Run the focused tests with:

```text
pnpm --filter @forever-professions/optimizer test
```
