# Phase 2 data foundation

Phase 2 turns one mutable recipe list into an append-only sequence of build snapshots. A stable recipe identity can have many recipe versions, and every version keeps its thresholds, reagents, outputs, provenance, and verification state.

## Import flow

1. Validate the build envelope and its declared sources.
2. Hash the exact raw bytes and store them at `raw/<build-id>/<sha256>.json` in the retained, versioned raw-data bucket.
3. Normalize the payload into build, profession, item, recipe, recipe-version, reagent, output, source, threshold, provenance, and verification records.
4. Compare the normalized build with its predecessor and publish the Markdown diff.
5. Check parent records in the application layer, then insert table groups in batches below Aurora DSQL transaction limits.

Raw objects are content-addressed, so importing corrected bytes for the same game build creates another object instead of erasing evidence. The `wow_build` row records the exact object key and checksum used for a normalized snapshot.

## Database shape

The schema files under `packages/ingestion/sql` contain one DDL statement each and run in filename order. Index creation uses `CREATE INDEX ASYNC`. The schema intentionally contains no foreign keys; the writer must check parent existence before each dependent table group and must not delete build-specific records during a normal import.

The current normalizer is pure and AWS-independent. The next slice will add a writer backed by the official Aurora DSQL Node connector, parameterized queries, transaction retries, and a raw S3 uploader. That slice requires `psql` 14 or newer for development-cluster schema validation.

## Local PostgreSQL smoke test

Docker can exercise the relational part of the ingestion path without AWS:

```text
pnpm db:local:up
pnpm db:local:test
pnpm db:local:down
```

The test applies all schema files one statement at a time, translates only `CREATE INDEX ASYNC` to PostgreSQL's local `CREATE INDEX`, normalizes a two-recipe build, writes every table group through parameterized queries and DSQL-sized transactions, then checks row counts and application-layer references. The database listens only on `127.0.0.1:55432`, uses temporary container storage, and is discarded when the container stops.

This verifies contracts, migration syntax shared with PostgreSQL, insert ordering, batching, constraints, and readback. It does not reproduce Aurora DSQL IAM authentication, asynchronous index jobs, optimistic-concurrency failures, distributed transaction behavior, service-side transaction enforcement, or performance.

## Infrastructure safety

The raw-data bucket is private, encrypted, versioned, SSL-only, and retained if the stack is removed. Aurora DSQL is declared with deletion protection and retention but is disabled by default. Enable it only by deploying with the `ProvisionDataCluster=true` CloudFormation parameter after reviewing the cost and development-cluster validation plan.
