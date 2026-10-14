# Roadmap v2 Phase 1 — Canonical Forever recipe data

Status: in progress; last updated October 14, 2026. For current setup and operational
rules, use `README.md` and `docs/DEVELOPMENT.md`.

## Reorientation audit

The existing implementation already has most of the boundaries the guide-first product needs. The work should evolve them rather than start over.

| Area | Decision | Reason |
| --- | --- | --- |
| Versioned ingestion and immutable raw archives | KEEP | Builds, checksums, recipe versions, provenance, and verification are already separate records. |
| Skill-up probability math | KEEP | It is deterministic, tested domain code and already evaluates probability at one skill point. |
| Price-provider abstraction and normalized observations | KEEP | Route code does not need to call a live provider in the request path. |
| Reagent graph and shopping planner | KEEP | They already support route aggregation and guarded recursive crafting. |
| Canonical recipe contract | ADAPT | It previously omitted learning rank, availability, faction, specialization, cooldown, and an explicit spell ID. |
| Current optimizer | REPLACE IN PHASE 3 | It makes a greedy per-skill choice. Roadmap v2 requires a global path algorithm and later switch resistance. |
| Left-rail “Leveling guide” list | REPLACE IN PHASE 5 | It is currently a recipe ordering, not a generated route. |
| Calculator and complete recipe browser | ADAPT | They remain valuable as route-step detail and the secondary All Recipes view. |
| Live market routing and character/addon inputs | DEFER | Canonical route eligibility and deterministic optimization come first. |

The dependency direction remains:

```text
Recipe data → profession math → route optimizer → guide presentation
```

## First canonical-data slice

The imported and product recipe contracts now carry:

```text
spell ID
Forever build ID
learning skill (nullable when unsupported)
acquisition method
faction eligibility
specialization spell ID
cooldown seconds
availability
reagents and outputs
skill thresholds
provenance and verification
```

These facts are stored in a build-scoped `recipe_metadata` record. A later build can therefore change eligibility without overwriting the earlier build.

The LibProfessionDB converter reads `requiredSkill`, `requiredSpec`, `AcquireMethods.lua`, `RecipeItems.lua`, `Sources.lua`, and `HiddenRecipes.lua` from the exact v1.9.1 archive. It deliberately does not promote Vanilla-borrowed learning ranks or source records to Forever facts; those values are retained as explicitly labeled fallback evidence. LibItemDB v1.4.1 supplies structured item class, subclass, and inventory-type data. Reviewed corrections are reapplied through a versioned override file. When a local Forever client is supplied, `wowdata` pins one installed build, imports generic `ItemSparse.ItemNameDescriptionID → ItemNameDescription` labels, and extracts item icons with source-build metadata.

The optimizer boundary now rejects recipes that are explicitly unavailable, not yet learnable, or have no supported learning rank. Unknown availability remains usable with a visible data-quality warning; otherwise almost the whole catalog would be silently discarded before Forever source observations exist.

## Leatherworking baseline

For Forever build `1.60.1.69977`:

- 603 recipes and 760 referenced items are imported.
- 484 recipes have a supported Forever learning rank.
- 119 learning ranks remain unknown; 68 of those retain a Vanilla-borrowed fallback that is not treated as Forever data.
- 14 recipes have a known acquisition and availability state after automatic-client facts and reviewed overrides.
- 589 acquisition and availability states remain unknown; 225 recipes still expose separately labeled source-kind evidence.
- 457 recipes identify a teaching item and 513 outputs carry structured LibItemDB item-type metadata.
- Seven referenced items carry installed-client item-name-description labels from build `1.60.1.70374`: three `Scarce` reagents and four `Crafted` outputs. These are imported labels, not name-based heuristics.
- 60 recipes carry a specialization requirement.
- 90 recipes reference at least one item whose English name is absent from the matching item snapshot.
- Output quantity remains provisional for 595 recipes after eight reviewed overrides.
- The supported learning-rank subset provides uninterrupted candidate coverage for every skill point from 1 through 299.
- 13 recipes are already gray when learned; they are valid catalog entries but are explicitly classified as non-leveling recipes.
- All 760 referenced items have locally extracted WebP icons in the current manifest; list and change views lazy-load non-hero images.

Uninterrupted skill coverage proves that the known-rank subset can support a `1 → 300` optimizer experiment. It does not yet prove that the resulting route is obtainable or trustworthy: acquisition, faction, cooldown, output quantity, and overall Forever verification remain open.

## Trust rules

- Presence in client data does not prove that a recipe is obtainable.
- A borrowed Classic value is never silently labeled as Forever data.
- A missing learning rank is not inferred from the orange threshold.
- A recipe with unknown eligibility remains visibly uncertain.
- An explicitly unavailable recipe cannot enter a leveling route.
- Every route candidate must be associated with the selected build.

## Next Phase 1 work

1. Collect or import Forever-specific trainer, vendor, quest, drop, faction, and cooldown evidence.
2. Resolve the 119 unknown learning ranks, starting with recipes that are competitive in a preliminary route.
3. Resolve missing item names and output quantities used by likely route candidates.
4. Add field-level provenance when one recipe combines client-backed craft facts with observed eligibility facts.
5. Re-run the audit and require zero `1 → 300` coverage gaps before Phase 2 cost-model work is considered stable.

The generated report in `data/imports/forever-1.60.1.69977-leatherworking.quality.md` is the machine-produced baseline for this work.
