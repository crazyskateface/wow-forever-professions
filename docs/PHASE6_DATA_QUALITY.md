# Phase 6 verification and data quality

Phase 6 makes the reliability of profession data part of the product instead of an implementation detail. A calculated answer can be mathematically correct while its recipe inputs are uncertain, so the interface must communicate both facts.

## First vertical slice

The initial Phase 6 slice builds on the versioned records established in Phase 2:

- Recipe API contracts carry a source kind, human-readable source label, structured verification status, and notes.
- The supported source kinds are `client-data`, `observed-in-game`, `classic-fallback`, `community-verified`, `manual-override`, and the development-only `fixture` kind.
- A pure domain classifier maps source and verification state to `verified`, `unverified`, `fallback`, or `rejected` quality. Rejected data takes precedence, and Classic fallback data is never described as authoritative even if its source record has been reviewed.
- The calculator shows a quality badge and an expanded source, verification, and build disclosure for the selected recipe.
- The route planner warns when available route inputs are not authoritative. Optimization remains available because the warning concerns input quality, not algorithm correctness.

The original two-recipe Leatherworking data under `data/fixtures` remains an illustrative fallback and is explicitly marked unverified. The client-data import is stored separately under `data/imports`; neither source is converted into verified Forever facts merely by being bundled.

## Existing storage foundation

Normalized builds already store sources, provenance links, and verification records independently. The ingestion path keeps them append-only with each recipe version. Phase 6 should continue using those records rather than inventing a second verification store.

## Client-data import and audit

The repository now includes a reproducible Leatherworking transform from LibProfessionDB v1.9.1 and LibItemDB v1.3.0 for Forever build `1.60.1.69977`. It supplies 603 recipes and 760 referenced items. The normalized SQL catalog now drives profession, recipe, optimizer, and shopping API paths when configured; the browser loads the complete profession contract from that API.

The generated quality report intentionally records unresolved facts instead of smoothing them over: all recipes are unverified, 90 recipes touch an unnamed item, 68 Vanilla-borrowed learning ranks are omitted, and 603 output quantities remain provisional. These records are useful client data, not authoritative Forever evidence.

The review transition rules are:

- `verified` requires a stable reviewer identity, an ISO review timestamp, and Forever-specific evidence supporting every product-visible field.
- `rejected` requires the same reviewer metadata plus notes identifying the conflicting evidence; rejected records are an audit error and must not enter product routes.
- `classic-fallback` remains non-authoritative even after review because its source does not establish Forever behavior.
- `unverified` may be served only with visible uncertainty and must not include reviewer metadata that implies completed review.

`pnpm data:audit <dataset.json> [report.md]` finds incomplete review metadata, rejected records, fallback sources, unverified records, missing item names, omitted borrowed ranks, and provisional outputs.

## Remaining work

- Supplement output quantities, acquisition sources, missing names, and uncertain mechanics with observed-in-game evidence.
- Decide whether to add field-level provenance. It is now justified for records where client-derived thresholds and reagents coexist with separately observed output quantities or acquisition sources; the current recipe-level model cannot distinguish those claims.
- Add build selection and change notices in Phase 7 rather than silently replacing the latest imported build.

A companion add-on remains deferred until the website is useful with trustworthy data and there is a demonstrated collection gap that an add-on can safely fill.
