# Forever Changes

Status: the core Classic Era → Forever comparison pipeline, API, and UI are
implemented. The same backend also supports Forever build → build comparisons; the
current browser experience intentionally shows the Forever-specific Classic baseline
without a comparison chooser.

## Product purpose

Forever Changes answers what Blizzard changed about a profession without maintaining
a parallel editorial list. It uses the same normalized build data that powers the
calculator and leveling optimizer.

The current primary navigation is:

```text
Leveling Guide | All Recipes | Forever Changes
```

## Current snapshot

The bundled Leatherworking comparison is:

```text
Classic Era 1.15.9.69722 → Forever 1.60.1.69977

289 New
227 Updated
  0 Removed
 87 Unchanged
603 total logical recipes
```

These are normalized logical recipes, not counts of abilities, recipe items, crafted
items, faction duplicates, or unused client records.

## End-to-end pipeline

```text
Classic baseline JSON        Forever target JSON
         |                           |
         +---- validate + normalize -+
                         |
             match (professionId, spellId)
                         |
            classify + field-level diff
                         |
        recipe_comparison + recipe_change
                         |
               read-only API responses
                         |
        Forever Changes UI + recipe badges
```

Comparison generation happens during target ingestion, not when a browser page loads:

```text
pnpm data:import:local data/imports/classic-era-1.15.9.69722-leatherworking.json
pnpm data:import:local data/imports/forever-1.60.1.69977-leatherworking.json --compare-against data/imports/classic-era-1.15.9.69722-leatherworking.json --comparison-type classic-forever
```

Use `--comparison-type forever-build` with a previous Forever snapshot. IDs and
outputs are deterministic, so rerunning the same comparison is idempotent.

## Identity and classifications

Recipe identity is:

```ts
{
  professionId,
  spellId,
}
```

Display names and internal row IDs do not determine identity.

Each logical recipe is classified as:

- `NEW`: only the target contains the identity;
- `UPDATED`: both contain it and at least one comparable field differs;
- `REMOVED`: only the baseline contains it; or
- `UNCHANGED`: both comparable snapshots are equal.

Unchanged rows are persisted so summary totals can be reconstructed exactly. The list
API and UI hide them by default.

## Compared fields

The engine currently compares:

- name;
- reagent item IDs/names and quantities;
- output item IDs/names and quantity ranges;
- orange, yellow, green, and gray thresholds;
- supported learning skill;
- acquisition category;
- faction;
- specialization spell ID;
- cooldown seconds; and
- availability.

Snapshots also retain teaching-item evidence, source kinds, hidden status, borrowed
learning rank, provenance, and verification details for display and interpretation.

Client item enrichment such as icons, item class/subclass, inventory type, and
`ItemNameDescription` labels is not treated as a gameplay recipe change. Adding an
icon or the `Scarce` label must not make an otherwise identical recipe appear Updated.

## Evidence-aware comparisons

The target value must have comparable evidence before an uncertain field creates an
update:

- `learnSkill: null` is unknown and does not overwrite a known Classic rank;
- `acquisition: unknown` does not create an acquisition change;
- `availability: unknown` does not create an availability change; and
- an orange value marked as an unanchored placeholder does not create a threshold
  change.

Borrowed Classic ranks and source kinds remain visible as fallback context but are not
promoted to Forever facts. Every snapshot carries its source and verification state.

## Persistence

`recipe_comparison` stores one deterministic comparison descriptor:

```text
base build
target build
comparison type
created timestamp
```

`recipe_change` stores one row per logical recipe:

```text
comparison ID
profession ID + spell ID
name + change type
JSON changed fields
JSON base snapshot
JSON target snapshot
```

Writes use DSQL-sized batches, parameter binding, application-level reference checks,
`ON CONFLICT DO NOTHING`, and immutable-value readback.

## API

List changes:

```http
GET /api/recipe-changes
    ?comparison=classic-forever
    &profession=leatherworking
    &changeType=updated
    &search=leather
```

Supported query values:

```text
comparison: classic-forever | forever-build
changeType: new | updated | removed | unchanged
profession: normalized profession ID
search: recipe name text
```

When `changeType` is omitted, Unchanged rows are excluded.

Read summary counts:

```http
GET /api/recipe-changes/summary
    ?comparison=classic-forever
    &profession=leatherworking
```

The summary includes all four statuses. Both endpoints select the latest stored
comparison of the requested type. They return `503` when comparison storage is not
configured and `404` when that comparison type has not been imported.

## UI behavior

The Forever Changes tab currently provides:

- New/Updated/Removed/Unchanged summary buttons;
- All Changes plus individual status filters;
- global search across recipe name, spell ID, changed field names, source labels,
  reagents, and outputs;
- profession filtering;
- item-type filters for Gear, Armor Kits, Bags & Storage, Materials, and Other;
- the same current-skill slider position used by the Leveling Guide;
- toggles for recipes above current skill and recipes with unknown learning ranks;
- availability tags such as `Requires skill 225`, `Skill requirement unknown`, and
  `Unavailable in Forever`;
- lazy-loaded crafted-item icons with initials fallback;
- expandable field-by-field Classic/previous versus Forever/current values; and
- before/after provenance labels.

Item-type grouping prefers structured LibItemDB class metadata and uses conservative
name matching only when structured type data is absent.

The UI has no comparison chooser because the tab's current job is specifically to
show Forever changes. Backend support for `forever-build` remains available for a
future patch-history view.

## Integration with other views

The client fetches Changed and Unchanged records to build a complete spell-identity
status map. Non-Unchanged badges are displayed in:

- Leveling Guide steps; and
- All Recipes rows.

Selecting a guide or recipe row still opens the existing calculator. Forever Changes
cards are currently comparison-focused and do not yet deep-link directly to the
calculator.

## Tests

Deterministic coverage includes:

- New, Updated, Removed, and Unchanged classification;
- reagent, output, quantity, threshold, learning, and eligibility differences;
- duplicate spell-identity rejection;
- evidence-aware suppression of unknown target facts;
- item-enrichment changes not becoming gameplay updates;
- deterministic IDs and serialized field differences;
- immutable comparison persistence and summary reconstruction;
- API filters, validation, and unconfigured states; and
- frontend contract parsing through shared Zod schemas.

## Remaining work

- Add a dedicated previous-Forever-build history experience when multiple Forever
  snapshots are available.
- Add a direct “View recipe” action from a change card.
- Add crafted-item stat comparisons once trustworthy versioned item-stat data exists.
- Replace remaining display-only item-type name heuristics as more structured item
  metadata becomes available.
- Continue improving Forever-specific acquisition, availability, output quantity, and
  verification evidence; the accuracy of a change is bounded by its source data.
- Revalidate migrations 017–022 against live Aurora DSQL before production promotion.

## Product rule

Do not maintain a separate hand-authored database of “Forever changes.” Fix or enrich
the canonical build snapshots, regenerate the deterministic comparison, and let the
same evidence flow into the guide, recipe browser, calculator, and change UI.
