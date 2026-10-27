import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";
import type { ImportedBuildDataset } from "@forever-professions/contracts";
import {
  applySqlMigrations,
  configureDsqlDatabaseRoles,
  createAuroraDsqlTransactionRunner,
  createS3RawDatasetStore,
  ingestBuildDataset,
  INGESTION_DATABASE_ROLE,
  loadSqlMigrations,
  type TransactionRunner,
} from "../src/index.js";

const roleArnPattern = /^arn:aws:iam::(\d{12}):role\/[A-Za-z0-9+=,.@_/-]{1,512}$/;
const requiredCatalogTables = [
  "wow_build",
  "profession",
  "item",
  "recipe",
  "data_source",
  "verification",
  "recipe_version",
  "recipe_threshold",
  "recipe_reagent",
  "recipe_output",
  "provenance",
  "recipe_metadata",
  "recipe_acquisition_detail",
  "recipe_source_kind",
  "recipe_comparison",
  "recipe_change",
  "item_classification",
  "item_client_data",
  "item_quality",
  "schema_migration",
] as const;

interface LiveDatabaseCounts {
  readonly tables: number;
  readonly indexes: number;
  readonly builds: number;
  readonly recipeVersions: number;
  readonly migrationRecords: number;
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
              teachingItemId: 9999,
              sourceKinds: ["trainer"],
              sourceDataOrigin: "forever",
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

async function verifyLiveDatabase(runner: TransactionRunner): Promise<LiveDatabaseCounts> {
  return runner.transaction(async (database) => {
    const tables = await database.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const present = new Set(tables.rows.map((row) => String(row.table_name)));
    const missing = requiredCatalogTables.filter((table) => !present.has(table));
    if (missing.length > 0) {
      throw new Error(`Live DSQL is missing required tables: ${missing.join(", ")}.`);
    }
    const counts = await database.query(
      "SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') AS tables, (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public') AS indexes, (SELECT COUNT(*) FROM wow_build WHERE build_id = $1) AS builds, (SELECT COUNT(*) FROM recipe_version WHERE build_id = $1) AS recipe_versions, (SELECT COUNT(*) FROM schema_migration WHERE migration_scope = 'catalog') AS migration_records",
      ["aws-dsql-validation-v1"],
    );
    const row = counts.rows[0];
    if (!row) throw new Error("Live DSQL verification returned no row counts.");

    return {
      tables: Number(row.tables),
      indexes: Number(row.indexes),
      builds: Number(row.builds),
      recipeVersions: Number(row.recipe_versions),
      migrationRecords: Number(row.migration_records),
    };
  });
}

async function main(): Promise<void> {
  const endpoint = requiredEnvironment("DSQL_ENDPOINT");
  const region = requiredEnvironment("AWS_REGION");
  const rawBucket = requiredEnvironment("RAW_DATA_BUCKET");
  const ingestionRoleArn = requiredEnvironment("INGESTION_ROLE_ARN");
  const migrationRoleArn = requiredEnvironment("MIGRATION_ROLE_ARN");
  const accountId = roleArnPattern.exec(ingestionRoleArn)?.[1];
  if (!accountId) throw new Error("Could not read the AWS account from INGESTION_ROLE_ARN.");
  if (!roleArnPattern.test(migrationRoleArn)) {
    throw new Error("MIGRATION_ROLE_ARN must be an IAM role ARN in the aws partition.");
  }

  const adminCredentials = fromTemporaryCredentials({
    clientConfig: { region },
    params: {
      RoleArn: migrationRoleArn,
      RoleSessionName: "ForeverProfessionsDsqlValidationAdmin",
    },
  });
  const admin = createAuroraDsqlTransactionRunner({
    host: endpoint,
    user: "admin",
    region,
    credentials: adminCredentials,
  });
  let migrationResult;
  try {
    migrationResult = await applySqlMigrations(admin, {
      dialect: "aurora-dsql",
      scope: "catalog",
      migrations: await loadSqlMigrations(new URL("../sql/", import.meta.url)),
    });
    await configureDsqlDatabaseRoles(admin, { ingestionRoleArn });
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
    user: INGESTION_DATABASE_ROLE,
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

    if (
      rows.tables < requiredCatalogTables.length ||
      rows.indexes < 7 ||
      rows.builds !== 1 ||
      rows.recipeVersions !== 1 ||
      rows.migrationRecords !== migrationResult.discovered
    ) {
      throw new Error(`Unexpected live DSQL row or schema counts: ${JSON.stringify(rows)}`);
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          migrations: migrationResult,
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
