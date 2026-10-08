# Versioned build ingestion

This package is the first Phase 2 data slice. It validates imported build datasets, normalizes them into the relational records described by the roadmap, produces recipe-level build diffs, and splits writes below Aurora DSQL transaction limits.

## Ingestion order

1. Validate the imported payload with `importedBuildDatasetSchema`.
2. Compute the raw payload SHA-256 and derive its immutable S3 key with `createRawDatasetKey`.
3. Upload the unmodified payload before normalization. Never replace an existing object at the same key.
4. Normalize with `normalizeBuildDataset`.
5. Compare with the preceding build using `diffBuilds` and save `renderBuildDiffMarkdown` output as a build artifact.
6. Write normalized table groups in dependency order, checking referenced parents in application code.
7. Use `createDsqlBatches` for every table group and retry optimistic-concurrency failures at the transaction boundary.

## DSQL schema

The files in `sql/` are intentionally one DDL statement each. Apply them in filename order and wait for each asynchronous DDL operation to finish before continuing. Indexes use `CREATE INDEX ASYNC`; there are no foreign keys because referential integrity is enforced by the importer.

The live writer is not part of this first slice. Before adding it, install the official `@aws/aurora-dsql-node-postgres-connector`, use parameter binding for every value, and validate the schema on a development cluster with `psql` 14 or newer.

## Local database test

From the repository root, run `pnpm db:local:up`, `pnpm db:local:test`, and `pnpm db:local:down`. The smoke test uses bare `pg` only for the local PostgreSQL container; production Aurora DSQL code must use the official connector.
