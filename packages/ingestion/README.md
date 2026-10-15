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

Both client-data import commands accept:

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

From the repository root, run `pnpm db:local:up`, `pnpm db:local:test`, and `pnpm db:local:down`. The smoke test uses bare `pg` only as a local transaction adapter. It imports the same two-recipe payload twice, confirms the second raw write is already present, verifies the normalized row counts are unchanged, and checks application-level references. Production Aurora DSQL code uses the official connector.

## Forever client-data conversion

The narrow Lua-literal converter reads generated Leatherworking, acquisition, teaching-item, source, hidden-recipe, item-name, and item-type tables from extracted LibProfessionDB and LibItemDB archives. It does not execute Lua. A versioned override file reapplies reviewed corrections after every conversion. When a WoW installation root is supplied, the same command also uses `wowdata` against one resolved client build to import generic `ItemSparse.ItemNameDescriptionID -> ItemNameDescription` labels, including Forever's `Scarce` gathering classification, plus item display names, equipment slots, armor, required levels, and vendor sell prices. Armor is deterministically derived from the pinned client's armor-total, quality, location, and shield tables. It resolves `Item.IconFileDataID`, falls back through `ItemModifiedAppearance` and `ItemAppearance.DefaultIconFileDataID` for Forever-only equipment, and exports local lossless WebP assets plus a build-stamped manifest. Install the extractor once with `npm install -g @follenfang/wowdata`. From the repository root:

```text
pnpm data:convert:professiondb <ProfessionDB-root> <ItemDB-root> data/imports/forever-1.60.1.69977-leatherworking.json Forever - data/imports/forever-leatherworking-overrides.json "C:\World of Warcraft" apps/web/public/icons/items
pnpm data:audit data/imports/forever-1.60.1.69977-leatherworking.json data/imports/forever-1.60.1.69977-leatherworking.quality.md
pnpm db:local:up
pnpm data:import:local data/imports/classic-era-1.15.9.69722-leatherworking.json
pnpm data:import:local data/imports/forever-1.60.1.69977-leatherworking.json --compare-against data/imports/classic-era-1.15.9.69722-leatherworking.json --comparison-type classic-forever
```

The full converter already performs client-data enrichment when the WoW installation root
is supplied. When the addon archives are unchanged and only the pinned client metadata needs
to be refreshed, run the narrower command before auditing and importing:

```text
pnpm data:enrich:client data/imports/forever-1.60.1.69977-leatherworking.json "C:\World of Warcraft"
```

The override file contains only reviewed field corrections and their provenance; reagents, outputs, names, and item types continue to come from the source archives, while item-name-description labels come from the pinned client build. The converter rejects duplicate, missing-source, or unmatched override records instead of silently dropping them. `WOW_CLIENT_ROOT` and `ITEM_ICON_OUTPUT_DIR` may be used instead of the final two positional arguments. `WOWDATA_PATH` can select a non-default extractor binary. Existing icons are reused only when their manifest records the same client asset build and FileDataID.

The current Leatherworking conversion finds seven item-name-description labels among
the 760 referenced items: Pristine Leather, Pristine Hide, and Pristine Scale are
`Scarce`; four Spiritcaller outputs are `Crafted`. These values are examples of the
generic import result, not a converter-maintained allowlist.

The local importer stores exact raw bytes under ignored `.local-data/`, applies the same 23 schema migrations, and writes through the production normalization and resumable writer. Build-scoped `recipe_metadata` rows preserve spell identity and route eligibility separately from thresholds, reagents, outputs, and provenance. Build-scoped `item_classification` and `item_client_data` rows preserve item labels and tooltip fields plus the exact product, build, and locale that supplied them. `SqlRecipeCatalogReader` reconstructs product contracts from those normalized rows and prefers the pinned client's display name when available, while `SqlRecipeChangeReader` serves precomputed comparison lists and summaries. The API selects them when `LOCAL_DATABASE_URL` is set; without that variable, local development retains the illustrative fixture fallback and reports recipe changes as unconfigured.

## Live AWS validation

The `ForeverProfessionsData` stack has been validated against a real Aurora DSQL cluster through migration 016. With a short-lived AWS profile active, set `AWS_REGION`, `DSQL_ENDPOINT`, `RAW_DATA_BUCKET`, and `INGESTION_ROLE_ARN` from the stack outputs and run `pnpm db:dsql:test` from the repository root. The command now applies all 23 migrations, waits for asynchronous indexes outside a transaction, configures the IAM-to-database-role mapping, assumes the scoped ingestion role, and imports its non-authoritative validation fixture twice. Migrations 017–023 still require live DSQL revalidation before a production deployment.

To ingest a transformed client export into Aurora DSQL, use `pnpm data:import <path-to-json>`. The file must satisfy the imported-build contract and contain at least one `client-data` source. The bundled LibProfessionDB-derived Leatherworking build is real client data, but it remains unverified rather than being misrepresented as authoritative.
