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

Callers provide the shared build configuration's `maxBaseSkill`, and the optimizer
rejects targets above it. This does not exclude recipes whose later yellow, green, or
gray thresholds exceed the cap; those recipes remain candidates at usable skills
within the normal progression range.

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

Product callers select one of six named presets. `practical` balances expected
crafts, switches, acquisition friction, Scarce avoidance, evidence confidence, and
complete available price evidence. `trainer-friendly` strongly prefers supported
trainer paths. `cheapest`, `fewest-crafts`, and `fewest-materials` apply their named
supported-only objective without hidden friction weights. `experimental` minimizes
crafts while permitting clearly labeled unknown acquisition or availability.
Rejected evidence remains ineligible for every preset.
After Scarce and evidence priorities, Practical minimizes skill gains that rely on
recipes acquired outside automatic learning or trainers. Drop, vendor, quest, and
reputation patterns are fallbacks even when they require fewer crafts. This is a
full-route preference, not a hard exclusion: required gaps still use an eligible
pattern with a `trainer-fallback` explanation. Unknown acquisition stays unknown.
Other presets retain their own objectives. The web's catalog-wide eligibility
allowlist is not an owned-pattern inventory.

The default `practical` confidence policy treats unknown acquisition or availability
as a route-level last resort. After Scarce avoidance, the dynamic-programming score
minimizes skill decisions backed by unknown evidence before optimizing cost, crafts,
or materials. `supported-only` instead rejects unknown acquisition and availability;
if that evidence boundary prevents completion, the route reports
`unsupported-recipe-evidence` at the blocked skill. Rejected recipe evidence is never
eligible in any policy. The `experimental` confidence policy removes the unknown-data
preference only for the explicitly labeled Experimental preset.

Each returned segment and alternative carries structured evidence: confidence level,
risk reason codes, acquisition, availability, provenance source, and verification
status. Segments also include stable recommendation reason codes and product-ready
summaries. Alternatives include their primary loss reason and summary, and blocked
routes explain the constraint that stopped the selected preset. Consumers should
render these fields rather than reconstructing selection logic from recipe names or
UI assumptions.

The application identifies scarce reagent item IDs from the build-stamped Forever
client `ItemNameDescription` classification imported with the recipe catalog.
Scarcity is optimized lexicographically ahead of the selected cost, craft, or material
objective, so a complete route without scarce materials always wins. Scarce recipes
remain usable when they are the only way through a skill range and are hidden from
ordinary route alternatives. The optimizer does not own a list of scarce item names.

Missing prices never become zero. A cost route reports `missing-price-data`; a gap in
available recipes reports `no-eligible-recipe`; and a strict evidence boundary reports
`unsupported-recipe-evidence`. Every blocked result identifies the affected skill.

Run the focused tests with:

```text
pnpm --filter @forever-professions/optimizer test
```

## Guide validation

The package also owns pure route-comparison and Markdown-reporting logic. It compares
a complete generated route with a contiguous, source-attributed reference guide,
groups skill-level disagreements into ranges, aggregates reagent differences, and
surfaces evidence risks without modifying recipe data.

With the PostgreSQL-backed local API running, execute `pnpm guide:validate` from the
repository root. Reference inputs live under `data/guide-references/`; generated
build-stamped baselines and reports live under `data/guide-validation/`.
