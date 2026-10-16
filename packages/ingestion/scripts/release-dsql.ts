import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";
import {
  auditImportedBuildDataset,
  createAuroraDsqlTransactionRunner,
  createRawDatasetKey,
  createS3RawDatasetStore,
  INGESTION_DATABASE_ROLE,
  parseBuildImportScriptArguments,
  parseRawDatasetBytes,
} from "../src/index.js";

const roleArnPattern = /^arn:aws:iam::(\d{12}):role\/[A-Za-z0-9+=,.@_/-]{1,512}$/;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function isoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  throw new Error("The database returned an invalid import timestamp.");
}

async function main(): Promise<void> {
  const { inputPath, compareAgainst } = parseBuildImportScriptArguments(
    process.argv.slice(2),
  );
  if (compareAgainst === undefined) {
    throw new Error(
      "A data release requires --compare-against and --comparison-type.",
    );
  }

  const endpoint = requiredEnvironment("DSQL_ENDPOINT");
  const region = requiredEnvironment("AWS_REGION");
  const rawBucket = requiredEnvironment("RAW_DATA_BUCKET");
  const ingestionRoleArn = requiredEnvironment("INGESTION_ROLE_ARN");
  const accountId = roleArnPattern.exec(ingestionRoleArn)?.[1];
  if (!accountId) {
    throw new Error("INGESTION_ROLE_ARN must be an IAM role ARN in the aws partition.");
  }

  const invocationDirectory = process.env.INIT_CWD
    ? resolve(process.env.INIT_CWD)
    : process.cwd();
  const targetPath = resolve(invocationDirectory, inputPath);
  const basePath = resolve(invocationDirectory, compareAgainst.path);
  const [targetBytes, baseBytes] = await Promise.all([
    readFile(targetPath),
    readFile(basePath),
  ]);
  const target = parseRawDatasetBytes(targetBytes);
  const base = parseRawDatasetBytes(baseBytes);
  const targetSha256 = sha256(targetBytes);
  const baseSha256 = sha256(baseBytes);
  const targetAudit = auditImportedBuildDataset(target);
  const baseAudit = auditImportedBuildDataset(base);
  const blockingFindings = [baseAudit, targetAudit].flatMap((report) =>
    report.findings.filter(({ severity }) => severity === "error"),
  );
  if (blockingFindings.length > 0) {
    throw new Error(
      `Data release audit failed: ${blockingFindings.map(({ code }) => code).join(", ")}.`,
    );
  }

  const credentials = fromTemporaryCredentials({
    clientConfig: { region },
    params: {
      RoleArn: ingestionRoleArn,
      RoleSessionName: "ForeverProfessionsDataRelease",
    },
  });
  const runner = createAuroraDsqlTransactionRunner({
    host: endpoint,
    user: INGESTION_DATABASE_ROLE,
    region,
    credentials,
    maxConnections: 2,
  });
  const store = createS3RawDatasetStore({
    bucket: rawBucket,
    region,
    credentials,
    expectedBucketOwner: accountId,
  });

  try {
    const builds = await runner.query(
      "SELECT build_id, imported_at, raw_object_key, raw_sha256 FROM wow_build WHERE build_id = $1 OR build_id = $2 ORDER BY build_id",
      [base.build.id, target.build.id],
    );
    if (builds.rowCount !== 2) {
      throw new Error("Both release builds must be imported before creating a release record.");
    }
    const buildById = new Map(
      builds.rows.map((row) => [String(row.build_id), row] as const),
    );
    for (const source of [
      { dataset: base, checksum: baseSha256 },
      { dataset: target, checksum: targetSha256 },
    ]) {
      const stored = buildById.get(source.dataset.build.id);
      if (
        stored?.raw_sha256 !== source.checksum ||
        stored.raw_object_key !==
          createRawDatasetKey(source.dataset.build.id, source.checksum)
      ) {
        throw new Error(
          `Stored build ${source.dataset.build.id} does not match its exact source snapshot.`,
        );
      }
    }

    const migrationRows = await runner.query(
      "SELECT migration_scope, migration_name, checksum_sha256 FROM schema_migration ORDER BY migration_scope, migration_name",
    );
    const migrations = migrationRows.rows.map((row) => ({
      scope: String(row.migration_scope),
      name: String(row.migration_name),
      sha256: String(row.checksum_sha256),
    }));
    const comparisonRows = await runner.query(
      "SELECT comparison_id, created_at FROM recipe_comparison WHERE base_build_id = $1 AND target_build_id = $2 AND comparison_type = $3",
      [base.build.id, target.build.id, compareAgainst.comparisonType],
    );
    const comparison = comparisonRows.rows[0];
    if (comparisonRows.rowCount !== 1 || comparison === undefined) {
      throw new Error("The requested build comparison has not been generated.");
    }

    const counts = await runner.query(
      "SELECT (SELECT COUNT(*) FROM recipe_version WHERE build_id = $1) AS base_recipes, (SELECT COUNT(*) FROM recipe_version WHERE build_id = $2) AS target_recipes, (SELECT COUNT(*) FROM recipe_change WHERE comparison_id = $3) AS recipe_changes, (SELECT COUNT(*) FROM item_client_data WHERE recipe_build_id = $2) AS target_client_items, (SELECT COUNT(*) FROM item_quality WHERE recipe_build_id = $2) AS target_quality_items",
      [base.build.id, target.build.id, comparison.comparison_id],
    );
    const countRow = counts.rows[0];
    if (countRow === undefined) throw new Error("Could not read release row counts.");

    const auditDocument = {
      schemaVersion: 1,
      status: "passed",
      blockingFindings: 0,
      reports: { base: baseAudit, target: targetAudit },
    } as const;
    const auditBytes = jsonBytes(auditDocument);
    const auditSha256 = sha256(auditBytes);
    const releaseIdentity = {
      baseBuildId: base.build.id,
      baseSha256,
      targetBuildId: target.build.id,
      targetSha256,
      comparisonType: compareAgainst.comparisonType,
      auditSha256,
      migrations,
    };
    const releaseId = sha256(JSON.stringify(releaseIdentity)).slice(0, 32);
    const releasePrefix =
      `releases/data/${base.build.id}--${target.build.id}/${releaseId}`;
    const auditObjectKey = `${releasePrefix}/audit.json`;
    const manifestObjectKey = `${releasePrefix}/manifest.json`;
    const manifestDocument = {
      schemaVersion: 1,
      releaseId,
      sources: [
        {
          role: "base",
          file: relative(invocationDirectory, basePath).replaceAll("\\", "/"),
          buildId: base.build.id,
          sha256: baseSha256,
          rawObjectKey: createRawDatasetKey(base.build.id, baseSha256),
          importedAt: isoTimestamp(buildById.get(base.build.id)?.imported_at),
        },
        {
          role: "target",
          file: relative(invocationDirectory, targetPath).replaceAll("\\", "/"),
          buildId: target.build.id,
          sha256: targetSha256,
          rawObjectKey: createRawDatasetKey(target.build.id, targetSha256),
          importedAt: isoTimestamp(buildById.get(target.build.id)?.imported_at),
        },
      ],
      migrations,
      comparison: {
        id: String(comparison.comparison_id),
        type: compareAgainst.comparisonType,
        createdAt: isoTimestamp(comparison.created_at),
      },
      rowCounts: {
        baseRecipes: Number(countRow.base_recipes),
        targetRecipes: Number(countRow.target_recipes),
        recipeChanges: Number(countRow.recipe_changes),
        targetClientItems: Number(countRow.target_client_items),
        targetQualityItems: Number(countRow.target_quality_items),
      },
      audit: { status: "passed", sha256: auditSha256, objectKey: auditObjectKey },
    } as const;
    const manifestBytes = jsonBytes(manifestDocument);
    const [auditStatus, manifestStatus] = await Promise.all([
      store.putIfAbsent({
        key: auditObjectKey,
        body: auditBytes,
        sha256: auditSha256,
      }),
      store.putIfAbsent({
        key: manifestObjectKey,
        body: manifestBytes,
        sha256: sha256(manifestBytes),
      }),
    ]);

    process.stdout.write(
      `${JSON.stringify(
        {
          releaseId,
          auditObjectKey,
          auditObjectStatus: auditStatus,
          manifestObjectKey,
          manifestObjectStatus: manifestStatus,
          rowCounts: manifestDocument.rowCounts,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await runner.end();
  }
}

await main();
