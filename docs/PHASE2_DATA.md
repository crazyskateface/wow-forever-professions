# Phase 2 data foundation

Current-state note: this document records the original Phase 2 delivery. The schema
has since grown to 24 ingestion migrations and 17 ingestion tables, including recipe
metadata, deterministic build comparisons, field-level recipe changes,
build-scoped item-name-description classifications, tooltip attributes, and item
rarities. See `packages/ingestion/README.md`
and `docs/DEVELOPMENT.md` for the current workflow.

Phase 2 turns one mutable recipe list into an append-only sequence of build snapshots. A stable recipe identity can have many recipe versions, and every version keeps its thresholds, reagents, outputs, provenance, and verification state.

## Import flow

1. Validate the build envelope and its declared sources.
2. Hash the exact raw bytes and store them at `raw/<build-id>/<sha256>.json` in the retained, versioned raw-data bucket.
3. Normalize the payload into build, profession, item, recipe, recipe-version, reagent, output, source, threshold, provenance, and verification records.
4. Check parent records in the application layer, then insert table groups in batches below Aurora DSQL transaction limits.
5. Compare completed normalized builds and publish the Markdown diff as a separate review artifact.

Raw objects are content-addressed, so importing corrected bytes for the same game build creates another object instead of erasing evidence. The `wow_build` row records the exact object key and checksum used for a normalized snapshot.

## Database shape

The schema files under `packages/ingestion/sql` contain one DDL statement each and run in filename order. Index creation uses `CREATE INDEX ASYNC`. The schema intentionally contains no foreign keys; the writer must check parent existence before each dependent table group and must not delete build-specific records during a normal import.

The normalizer is pure and AWS-independent. The writer is backed by the official Aurora DSQL Node connector, which supplies IAM token management and whole-transaction OCC retries. All SQL values are bound parameters. Inserts are resumable and verify that existing keys still contain the expected immutable data. Raw uploads use the AWS SDK S3 client, a SHA-256 checksum, and `If-None-Match: *` to prevent replacement.

The `ForeverProfessionsData` development stack was deployed in `us-east-1` and validated on October 8, 2026. That live validation covered migrations 001–016. The harness applies every DDL file independently, invokes `CALL sys.wait_for_job` outside a transaction for asynchronous indexes, maps the scoped IAM ingestion role to `forever_professions_ingestion`, and imports the same fixture twice. The current command discovers and applies all 24 migrations, but migrations 017–024 still require the same live DSQL revalidation before production promotion.

The live run verifies IAM authentication, asynchronous index completion, the scoped application role, S3 conditional writes, DSQL-compatible transaction boundaries, and resumable imports. It does not inject an OCC conflict or establish production performance limits; those remain operational tests rather than blockers for the Phase 2 data foundation.

## Local PostgreSQL smoke test

Docker can exercise the relational part of the ingestion path without AWS:

```text
pnpm db:local:up
pnpm db:local:test
pnpm db:local:down
```

The test applies all schema files one statement at a time, translates only `CREATE INDEX ASYNC` to PostgreSQL's local `CREATE INDEX`, and imports the same two-recipe build twice through the shared ingestion and writer code. It confirms the raw content address is reused, every table group uses parameterized DSQL-sized transactions, immutable readback succeeds, row counts do not grow on retry, and application-layer references have no orphans. The database listens only on `127.0.0.1:55432`, uses temporary container storage, and is discarded when the container stops.

This verifies contracts, migration syntax shared with PostgreSQL, insert ordering, batching, constraints, and readback. It does not reproduce Aurora DSQL IAM authentication, asynchronous index jobs, optimistic-concurrency failures, distributed transaction behavior, service-side transaction enforcement, or performance.

## Live Aurora DSQL test and import

Authenticate with a short-lived IAM session and read `DataClusterEndpoint`, `RawDataBucketName`, and `IngestionRoleArn` from the `ForeverProfessionsData` CloudFormation outputs. Set them as `DSQL_ENDPOINT`, `RAW_DATA_BUCKET`, and `INGESTION_ROLE_ARN`, set `AWS_REGION=us-east-1`, and then run:

```text
pnpm db:dsql:test
```

The smoke command uses admin access only to apply schema and role grants. It assumes the scoped ingestion role before writing the raw object and normalized records.

To load a transformed client export into Aurora DSQL, run:

```text
pnpm data:import C:\path\to\forever-build.json
```

The input must declare at least one source with `kind: "client-data"`. The importer preserves its exact bytes before normalization. The repository now contains a real client-derived Leatherworking snapshot, but it remains explicitly unverified and should not be described as authoritative. The historical deployed validation record is a non-authoritative fixture unless an operator has separately imported the real snapshots.

## Infrastructure safety

The raw-data bucket is private, encrypted, versioned, SSL-only, and retained if the stack is removed. The ingestion role is limited to `dsql:DbConnect` on this cluster and `s3:PutObject` on the bucket's `raw/` prefix. S3 storage, requests, optional replication, and optional CloudTrail data events carry normal AWS charges, so enable observability features intentionally.

Aurora DSQL is declared with deletion protection and retention. The data stack also has CloudFormation termination protection enabled. The cluster is now a required shared dependency for the validated Phase 2 writer and Phase 3 pricing reader/writer; it is no longer hidden behind the original provisioning flag.
