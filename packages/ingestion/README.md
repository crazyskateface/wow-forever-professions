# Versioned build ingestion

This package validates imported build datasets, preserves exact raw bytes, normalizes them into the relational records described by the roadmap, produces recipe-level build diffs and quality audits, writes resumable batches below Aurora DSQL transaction limits, and reads the normalized catalog back for the application.

## Ingestion order

1. Validate the imported payload with `importedBuildDatasetSchema`.
2. Compute the raw payload SHA-256 and derive its immutable S3 key with `createRawDatasetKey`.
3. Upload the unmodified payload before normalization. Never replace an existing object at the same key.
4. Normalize with `normalizeBuildDataset`.
5. Write normalized table groups in dependency order, checking referenced parents in application code.
6. Use `createDsqlBatches` for every table group and retry optimistic-concurrency failures at the transaction boundary.
7. Compare completed builds separately with `diffBuilds` and render a review artifact with `renderBuildDiffMarkdown`.

## DSQL schema

The files in `sql/` are intentionally one DDL statement each. Apply them in filename order and wait for each asynchronous DDL operation to finish before continuing. Indexes use `CREATE INDEX ASYNC`; there are no foreign keys because referential integrity is enforced by the importer.

`createAuroraDsqlTransactionRunner` uses the official `@aws/aurora-dsql-node-postgres-connector`. The connector generates and refreshes IAM authentication tokens and retries complete transactions after optimistic-concurrency conflicts. The writer uses parameter binding for every value, application-level reference checks, conservative row/byte batches, and `ON CONFLICT DO NOTHING` followed by immutable-value readback. An interrupted import can therefore resume, while a changed value under an existing key fails instead of being silently accepted.

`S3RawDatasetStore` sends exact input bytes with a SHA-256 checksum and `If-None-Match: *`. An object already present at the content-addressed key is success; no import path overwrites it. Create the S3 client once per worker, set an explicit region, and scope the worker role to the raw prefix and required bucket operations. The retained bucket is private, encrypted, versioned, and SSL-only; stored bytes and S3 requests incur normal AWS charges.

`ingestBuildDataset` composes the raw store and transaction runner. It stores schema-valid raw input before semantic normalization, so a rejected dataset remains available for investigation.

## Local database test

From the repository root, run `pnpm db:local:up`, `pnpm db:local:test`, and `pnpm db:local:down`. The smoke test uses bare `pg` only as a local transaction adapter. It imports the same two-recipe payload twice, confirms the second raw write is already present, verifies the normalized row counts are unchanged, and checks application-level references. Production Aurora DSQL code uses the official connector.

## Forever client-data conversion

The narrow Lua-literal converter reads generated Forever Leatherworking tables from extracted LibProfessionDB and LibItemDB archives. It does not execute Lua. From the repository root:

```text
pnpm data:convert:professiondb <ProfessionDB-root> <ItemDB-root> data/imports/forever-1.60.1.69977-leatherworking.json
pnpm data:audit data/imports/forever-1.60.1.69977-leatherworking.json data/imports/forever-1.60.1.69977-leatherworking.quality.md
pnpm db:local:up
pnpm data:import:local data/imports/forever-1.60.1.69977-leatherworking.json
```

The local importer stores exact raw bytes under ignored `.local-data/`, applies the same 16 schema migrations, and writes through the production normalization and resumable writer. `SqlRecipeCatalogReader` reconstructs product contracts from those normalized rows. The API selects it when `LOCAL_DATABASE_URL` is set; without that variable, local development retains the illustrative fixture fallback.

## Live AWS validation

The `ForeverProfessionsData` stack has been validated against a real Aurora DSQL cluster. With a short-lived AWS profile active, set `AWS_REGION`, `DSQL_ENDPOINT`, `RAW_DATA_BUCKET`, and `INGESTION_ROLE_ARN` from the stack outputs and run `pnpm db:dsql:test` from the repository root. The command applies all 16 migrations, waits for asynchronous indexes outside a transaction, configures the IAM-to-database-role mapping, assumes the scoped ingestion role, and imports its non-authoritative validation fixture twice.

To ingest a transformed client export into Aurora DSQL, use `pnpm data:import <path-to-json>`. The file must satisfy the imported-build contract and contain at least one `client-data` source. The bundled LibProfessionDB-derived Leatherworking build is real client data, but it remains unverified rather than being misrepresented as authoritative.
