# Versioned build ingestion

This package validates imported build datasets, preserves exact raw bytes, normalizes them into the relational records described by the roadmap, produces recipe-level build diffs and quality audits, writes resumable batches below Aurora DSQL transaction limits, and reads the normalized catalog back for the application.

## Ingestion order

1. Validate the imported payload with `importedBuildDatasetSchema`.
2. Compute the raw payload SHA-256 and derive its immutable S3 key with `createRawDatasetKey`.
3. Upload the unmodified payload before normalization. Never replace an existing object at the same key.
4. Normalize with `normalizeBuildDataset`.
5. Write normalized table groups in dependency order, checking referenced parents in application code.
6. Use `createDsqlBatches` for every table group and retry optimistic-concurrency failures at the transaction boundary.
7. Compare completed builds with `compareRecipeBuilds`; use the legacy `diffBuilds` adapter only when producing the existing Markdown review artifact with `renderBuildDiffMarkdown`.

## Recipe change comparisons

`compareRecipeBuilds(base, target, options)` is the canonical comparison entry point for
Forever Changes. Callers must select either `CLASSIC_TO_FOREVER` or
`FOREVER_BUILD_TO_BUILD`. Logical recipe identity is the combination of profession ID and
spell ID, so a row-ID or name change cannot incorrectly create a removed/new pair.

The result classifies every logical recipe as `NEW`, `UPDATED`, `REMOVED`, or `UNCHANGED`,
keeps unchanged recipes out of the returned change list by default, and still includes them
in global and profession summaries. Updated records contain deterministic, JSON-serializable
before/after values for each changed field. Base and target snapshots retain their source and
verification provenance so downstream APIs and UI do not need to reconstruct trust metadata.

Pass `compareAgainst` to `ingestBuildDataset` to generate and persist a complete comparison
after the target build is written. The writer stores unchanged logical recipes as well as
visible changes so summary counts can be reconstructed exactly. Comparison and change rows
use deterministic IDs, immutable idempotent inserts, DSQL-safe batches, JSON serialized as
`TEXT`, and application-layer checks for build, comparison, and profession references.

Both build import commands accept:

```text
<target.json> --compare-against <base.json> --comparison-type classic-forever
<target.json> --compare-against <previous.json> --comparison-type forever-build
```

## DSQL schema

The files in `sql/` are intentionally one DDL statement each. Apply them in filename order and wait for each asynchronous DDL operation to finish before continuing. Indexes use `CREATE INDEX ASYNC`; there are no foreign keys because referential integrity is enforced by the importer.

`createAuroraDsqlTransactionRunner` uses the official `@aws/aurora-dsql-node-postgres-connector`. The connector generates and refreshes IAM authentication tokens and retries complete transactions after optimistic-concurrency conflicts. The writer uses parameter binding for every value, application-level reference checks, conservative row/byte batches, and `ON CONFLICT DO NOTHING` followed by immutable-value readback. An interrupted import can therefore resume, while a changed value under an existing key fails instead of being silently accepted.

`S3RawDatasetStore` sends exact input bytes with a SHA-256 checksum and `If-None-Match: *`. An object already present at the content-addressed key is success; no import path overwrites it. Create the S3 client once per worker, set an explicit region, and scope the worker role to the raw prefix and required bucket operations. The retained bucket is private, encrypted, versioned, and SSL-only; stored bytes and S3 requests incur normal AWS charges.

`ingestBuildDataset` composes the raw store and transaction runner. It stores schema-valid raw input before semantic normalization, so a rejected dataset remains available for investigation.

## Local database test

From the repository root, run `pnpm db:local:up`, `pnpm db:local:test`, and `pnpm db:local:down`. The smoke test creates a temporary database inside the local PostgreSQL container and drops it afterward, so it never clears or replaces the application catalog. It uses bare `pg` only as a local transaction adapter, imports the same two-recipe payload twice, confirms the second raw write is already present, verifies the normalized row counts are unchanged, and checks application-level references. Production Aurora DSQL code uses the official connector.

## Forever client-data conversion

The narrow Lua-literal converter reads every registered crafting, secondary, and smelting profession plus acquisition, teaching-item, source, hidden-recipe, item-name, and item-type tables from extracted LibProfessionDB and LibItemDB archives. It does not execute Lua. A versioned override file reapplies reviewed corrections after every conversion. When a WoW installation root is supplied, the same command also uses `wowdata` against one resolved client build to import generic `ItemSparse.ItemNameDescriptionID -> ItemNameDescription` labels, including Forever's `Scarce` gathering classification, plus item display names, rarity IDs, equipment slots, armor, ordered item stats, required levels, and vendor sell prices. Armor is deterministically derived from the pinned client's armor-total, quality, location, and shield tables. Stat values combine `ItemSparse` allocations with the matching `RandPropPoints` level, quality, and inventory-slot budget; display text comes from the pinned client's localized `GlobalStrings` data. It resolves `Item.IconFileDataID`, falls back through `ItemModifiedAppearance` and `ItemAppearance.DefaultIconFileDataID` for Forever-only equipment, and exports local lossless WebP assets plus a build-stamped manifest. Install the extractor once with `npm install -g @follenfang/wowdata`. From the repository root:

```text
pnpm data:convert:professiondb <ProfessionDB-root> <ItemDB-root> data/imports/forever-1.60.1.69977-professions.json Forever - data/imports/forever-leatherworking-overrides.json "C:\World of Warcraft" apps/web/public/icons/items
pnpm data:audit data/imports/forever-1.60.1.69977-professions.json data/imports/forever-1.60.1.69977-professions.quality.md
pnpm db:local:up
pnpm data:import:local data/imports/classic-era-1.15.9.69722-professions.json
pnpm data:import:local data/imports/forever-1.60.1.69977-professions.json --compare-against data/imports/classic-era-1.15.9.69722-professions.json --comparison-type classic-forever
```

The local admin dashboard first runs `pnpm data:status:local <classic.json>
<forever.json>`. This checks the exact raw SHA-256 values in `wow_build`, verifies that
the Classic-to-Forever comparison exists, and compares every recorded catalog
migration checksum with the repository. A current catalog skips both imports. A
missing, outdated, or drifted catalog must be reset before
importing Classic and Forever in the order above; existing build rows are never
rewritten.

The full converter already performs client-data enrichment when the WoW installation root
is supplied. When the addon archives are unchanged and only the pinned client metadata needs
to be refreshed, run the narrower command before auditing and importing:

```text
pnpm data:enrich:client data/imports/forever-1.60.1.69977-professions.json "C:\World of Warcraft"
```

The override file contains only reviewed field corrections and their provenance; reagents, outputs, names, and item types continue to come from the source archives, while item-name-description labels come from the pinned client build. The converter rejects duplicate, missing-source, or unmatched override records instead of silently dropping them. `WOW_CLIENT_ROOT` and `ITEM_ICON_OUTPUT_DIR` may be used instead of the final two positional arguments. `WOWDATA_PATH` can select a non-default extractor binary. Existing icons are reused only when their manifest records the same client asset build and FileDataID.

The converter defaults to the versions pinned by the checked-in snapshot. Automated
source refreshes set `PROFESSION_DB_VERSION`, `ITEM_DB_VERSION`, and
`PROFESSION_DB_SOURCE_URL` so regenerated records retain the release actually used;
these values are provenance metadata, not credentials.

The historical Leatherworking-only conversion found seven item-name-description labels among
the 760 referenced items: Pristine Leather, Pristine Hide, and Pristine Scale are
`Scarce`; four Spiritcaller outputs are `Crafted`. These values are examples of the
generic import result, not a converter-maintained allowlist.

The local importer stores exact raw bytes under ignored `.local-data/`, applies the same 28 catalog schema migrations, and writes through the production normalization and resumable writer. Build-scoped `recipe_metadata` rows preserve spell identity and route eligibility separately from thresholds, reagents, outputs, and provenance. Additive `recipe_acquisition_detail` and `recipe_source_kind` rows preserve supported teaching-item and source-classification evidence without rewriting immutable metadata; a missing location remains unknown rather than being inferred. Build-scoped `item_classification`, `item_client_data`, `item_quality`, and `item_stat` rows preserve item labels, tooltip fields, rarity, and ordered stat lines plus the exact product, build, and locale that supplied each client record. Keeping additive facts in their own immutable tables lets an existing client-data snapshot gain newly supported fields without rewriting prior rows. `SqlRecipeCatalogReader` reconstructs product contracts from those normalized rows and prefers the pinned client's display name when available, while `SqlRecipeChangeReader` serves precomputed comparison lists and summaries. The API selects them when `LOCAL_DATABASE_URL` is set; without that variable, local development retains the illustrative fixture fallback and reports recipe changes as unconfigured.

## Live AWS validation

The staging `ForeverProfessionsData` stack was validated through the first 24 catalog migrations and all three pricing migrations on October 16, 2026. Migrations 025–028 add imported item-stat storage, its build lookup index, acquisition details, and source kinds and still require live staging validation. `pnpm db:migrate:dsql` assumes the stack's short-lived migration role, creates the migration ledger, verifies every recorded checksum before applying new DDL, and waits for asynchronous jobs outside transactions. Its immediate replay skipped all 27 migrations recorded at that time.

Read `DSQL_ENDPOINT`, `RAW_DATA_BUCKET`, `INGESTION_ROLE_ARN`,
`MIGRATION_ROLE_ARN`, and `PRICING_WRITER_ROLE_ARN` from the data-stack outputs;
read `APPLICATION_READER_ROLE_ARN` from the application stack's
`ApiFunctionRoleArn`. Set `AWS_REGION` and a short-lived base identity that may assume
the output roles. The live order is:

```text
pnpm db:migrate:dsql
pnpm db:roles:dsql
pnpm data:import <base.json>
pnpm data:import <target.json> --compare-against <base.json> --comparison-type classic-forever
pnpm data:release:dsql <target.json> --compare-against <base.json> --comparison-type classic-forever
```

Use `pnpm db:roles:dsql` after migrations to idempotently map and verify the ingestion, application-reader, and pricing-writer roles. To ingest any schema-valid build snapshot into Aurora DSQL, use `pnpm data:import <path-to-json>`; this supports the Classic fallback baseline as well as client-data targets. After importing both builds and their comparison, `pnpm data:release:dsql <target> --compare-against <base> --comparison-type classic-forever` verifies source hashes and compares live recipe, client-data, rarity, item-stat, and per-change-type counts with the normalized snapshots and a freshly generated comparison. `UNCHANGED` rows are part of that gate. Any missing or extra persisted row blocks publication before the command stores its immutable machine audit and deterministic data-release manifest.

The bundled LibProfessionDB-derived Leatherworking build is real client data, but it remains unverified rather than being misrepresented as authoritative. The staging Phase 3 proof produced release `c45372dc8b6264dec83d1275d5691ed0`; the prior release audit records 314 Classic recipes, 603 Forever recipes, 603 comparison rows, and 630 target items with client data and quality. A new release audit after migrations 025–026 must also account for the 1,174 imported target item-stat rows.

## Complete profession snapshots

Conversion now bundles Alchemy, Blacksmithing, Enchanting, Engineering,
Leatherworking, Tailoring, Cooking, First Aid, Fishing, and Mining. Both the Forever
and Vanilla tables are required. The source lock, admin refresh/sync jobs, and import
commands use `*-professions.json`. Previous `*-leatherworking.json` files remain
historical references. Do not import both variants of the same build into one database.

Set `WOW_CLIENT_PRODUCT=wowf` for the installed Forever client. The default is `wowf`; set `wow_classic_beta` explicitly for the older beta client.
Only these explicit Forever products are accepted.
The extractor resolves a build once, pins all subsequent reads, and retains the actual
product/build/locale on every enriched record. Current full snapshots use client
build `1.60.1.70630` for both item metadata and all 2,720 generated item icons.

Spells without `craftedItemId` retain an empty output array, including enchantments
and training records. The converter never substitutes `itemId` (a teaching item).
Missing learning ranks, native acquisition facts, and output stack sizes remain
explicit. The generated audits report route coverage separately for every profession.

Icon manifests now serialize as compact schema v2 (`icons` maps item IDs to FileDataIDs;
paths are deterministically `/icons/items/<id>.webp`). The reader still accepts v1.
This removes repeated URL strings so complete profession assets fit the existing
80 KB manifest budget without increasing web performance thresholds.
