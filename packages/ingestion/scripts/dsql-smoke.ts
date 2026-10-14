import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";
import type { ImportedBuildDataset } from "@forever-professions/contracts";
import {
  createAuroraDsqlTransactionRunner,
  createS3RawDatasetStore,
  ingestBuildDataset,
  type ClosableTransactionRunner,
  type SqlQueryResult,
  type TransactionRunner,
} from "../src/index.js";

const databaseRole = "forever_professions_ingestion";
const roleArnPattern = /^arn:aws:iam::(\d{12}):role\/[A-Za-z0-9+=,.@_/-]{1,512}$/;

interface LiveDatabaseCounts {
  readonly tables: number;
  readonly indexes: number;
  readonly builds: number;
  readonly recipeVersions: number;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function validationDataset(): ImportedBuildDataset {
  return {
    build: { id: "aws-dsql-validation-v1", version: "validation-v1" },
    sources: [
      {
        id: "aws-validation-fixture-v1",
        kind: "fixture",
        label: "AWS DSQL validation fixture",
      },
    ],
    professions: [
      {
        id: "validation-profession",
        slug: "validation-profession",
        name: "Validation Profession",
        recipes: [
          {
            id: "validation-recipe",
            name: "Validation Recipe",
            metadata: {
              spellId: 1,
              learnSkill: 1,
              acquisition: "trainer",
              faction: "both",
              specializationSpellId: null,
              cooldownSeconds: null,
              availability: "available",
            },
            thresholds: { orange: 1, yellow: 2, green: 3, gray: 4 },
            reagents: [
              {
                item: { id: "validation-reagent", gameId: 1, name: "Validation Reagent" },
                quantity: 2,
              },
            ],
            outputs: [
              {
                item: { id: "validation-output", gameId: 2, name: "Validation Output" },
                minimumQuantity: 1,
                maximumQuantity: 1,
              },
            ],
            sourceId: "aws-validation-fixture-v1",
            verification: {
              status: "unverified",
              notes: "Infrastructure validation only; not authoritative game data.",
            },
          },
        ],
      },
    ],
  };
}

async function executeOne(
  runner: TransactionRunner,
  sql: string,
  values?: readonly unknown[],
): Promise<SqlQueryResult> {
  return runner.transaction((database) => database.query(sql, values));
}

async function applySchema(runner: ClosableTransactionRunner): Promise<number> {
  const sqlDirectory = fileURLToPath(new URL("../sql/", import.meta.url));
  const migrations = (await readdir(sqlDirectory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();

  for (const filename of migrations) {
    const sql = await readFile(new URL(`../sql/${filename}`, import.meta.url), "utf8");
    const result = await executeOne(runner, sql);
    const jobId = result.rows[0]?.job_id;
    if (typeof jobId === "string" && jobId.length > 0) {
      const wait = await runner.query("CALL sys.wait_for_job($1)", [jobId]);
      const completed = Object.values(wait.rows[0] ?? {}).find(
        (value): value is boolean => typeof value === "boolean",
      );
      if (completed === false) {
        throw new Error(`Asynchronous migration ${filename} did not complete successfully.`);
      }
    }
  }

  return migrations.length;
}

async function configureDatabaseRole(
  runner: TransactionRunner,
  ingestionRoleArn: string,
): Promise<void> {
  if (!roleArnPattern.test(ingestionRoleArn)) {
    throw new Error("INGESTION_ROLE_ARN must be an IAM role ARN in the aws partition.");
  }

  const role = await executeOne(
    runner,
    "SELECT 1 AS found FROM pg_roles WHERE rolname = $1",
    [databaseRole],
  );
  if (role.rowCount === 0) {
    await executeOne(runner, `CREATE ROLE ${databaseRole} WITH LOGIN`);
  }

  const mapping = await executeOne(
    runner,
    "SELECT 1 AS found FROM sys.iam_pg_role_mappings WHERE pg_role_name = $1 AND arn = $2",
    [databaseRole, ingestionRoleArn],
  );
  if (mapping.rowCount === 0) {
    await executeOne(runner, `AWS IAM GRANT ${databaseRole} TO '${ingestionRoleArn}'`);
  }

  await executeOne(
    runner,
    `GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO ${databaseRole}`,
  );
}

async function verifyLiveDatabase(runner: TransactionRunner): Promise<LiveDatabaseCounts> {
  return runner.transaction(async (database) => {
    const counts = await database.query(
      "SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') AS tables, (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public') AS indexes, (SELECT COUNT(*) FROM wow_build WHERE build_id = $1) AS builds, (SELECT COUNT(*) FROM recipe_version WHERE build_id = $1) AS recipe_versions",
      ["aws-dsql-validation-v1"],
    );
    const row = counts.rows[0];
    if (!row) throw new Error("Live DSQL verification returned no row counts.");

    return {
      tables: Number(row.tables),
      indexes: Number(row.indexes),
      builds: Number(row.builds),
      recipeVersions: Number(row.recipe_versions),
    };
  });
}

async function main(): Promise<void> {
  const endpoint = requiredEnvironment("DSQL_ENDPOINT");
  const region = requiredEnvironment("AWS_REGION");
  const rawBucket = requiredEnvironment("RAW_DATA_BUCKET");
  const ingestionRoleArn = requiredEnvironment("INGESTION_ROLE_ARN");
  const accountId = roleArnPattern.exec(ingestionRoleArn)?.[1];
  if (!accountId) throw new Error("Could not read the AWS account from INGESTION_ROLE_ARN.");

  const admin = createAuroraDsqlTransactionRunner({
    host: endpoint,
    user: "admin",
    region,
  });
  let migrationsApplied: number;
  try {
    migrationsApplied = await applySchema(admin);
    await configureDatabaseRole(admin, ingestionRoleArn);
  } finally {
    await admin.end();
  }

  const credentials = fromTemporaryCredentials({
    clientConfig: { region },
    params: {
      RoleArn: ingestionRoleArn,
      RoleSessionName: "ForeverProfessionsPhase2Validation",
    },
  });
  const writer = createAuroraDsqlTransactionRunner({
    host: endpoint,
    user: databaseRole,
    region,
    credentials,
  });
  const rawStore = createS3RawDatasetStore({
    bucket: rawBucket,
    region,
    credentials,
    expectedBucketOwner: accountId,
  });
  const rawBytes = new TextEncoder().encode(JSON.stringify(validationDataset()));

  try {
    const firstImport = await ingestBuildDataset({
      rawBytes,
      rawStore,
      transactionRunner: writer,
      importedAt: "2026-01-01T00:00:00.000Z",
    });
    const repeatedImport = await ingestBuildDataset({
      rawBytes,
      rawStore,
      transactionRunner: writer,
      importedAt: "2026-01-02T00:00:00.000Z",
    });
    const rows = await verifyLiveDatabase(writer);

    if (rows.tables !== 15 || rows.indexes < 7 || rows.builds !== 1 || rows.recipeVersions !== 1) {
      throw new Error(`Unexpected live DSQL row or schema counts: ${JSON.stringify(rows)}`);
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          migrationsApplied,
          rawObjectKey: firstImport.rawObjectKey,
          rawObjectStatuses: [firstImport.rawObjectStatus, repeatedImport.rawObjectStatus],
          rows,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await writer.end();
  }
}

await main();
