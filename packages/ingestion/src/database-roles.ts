import type { SqlQueryResult, TransactionRunner } from "./writer.js";

export const INGESTION_DATABASE_ROLE = "forever_professions_ingestion";
export const APPLICATION_READER_DATABASE_ROLE =
  "forever_professions_application_reader";
export const PRICING_WRITER_DATABASE_ROLE =
  "forever_professions_pricing_writer";

const roleArnPattern = /^arn:aws:iam::\d{12}:role\/[A-Za-z0-9+=,.@_/-]{1,512}$/;

const catalogTables = [
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
  "recipe_comparison",
  "recipe_change",
  "item_classification",
  "item_client_data",
  "item_quality",
] as const;

const pricingTables = ["auction_market", "auction_price_current"] as const;

export interface DsqlDatabaseRoleOptions {
  readonly ingestionRoleArn?: string;
  readonly applicationReaderRoleArn?: string;
  readonly pricingWriterRoleArn?: string;
}

export interface DsqlDatabaseRoleResult {
  readonly configured: readonly string[];
  readonly mappings: Readonly<Record<string, string>>;
  readonly verifiedPrivileges: Readonly<Record<string, number>>;
}

async function executeOne(
  runner: TransactionRunner,
  sql: string,
  values?: readonly unknown[],
): Promise<SqlQueryResult> {
  return runner.transaction((database) => database.query(sql, values));
}

async function ensureDatabaseRole(
  runner: TransactionRunner,
  databaseRole: string,
): Promise<void> {
  const role = await executeOne(
    runner,
    "SELECT 1 AS found FROM pg_roles WHERE rolname = $1",
    [databaseRole],
  );
  if (role.rowCount === 0) {
    await executeOne(runner, `CREATE ROLE ${databaseRole} WITH LOGIN`);
  }
}

async function ensureRoleMapping(
  runner: TransactionRunner,
  databaseRole: string,
  roleArn: string,
): Promise<void> {
  if (!roleArnPattern.test(roleArn)) {
    throw new Error(`IAM role ARN for ${databaseRole} is invalid.`);
  }
  const mapping = await executeOne(
    runner,
    "SELECT 1 AS found FROM sys.iam_pg_role_mappings WHERE pg_role_name = $1 AND arn = $2",
    [databaseRole, roleArn],
  );
  if (mapping.rowCount === 0) {
    await executeOne(runner, `AWS IAM GRANT ${databaseRole} TO '${roleArn}'`);
  }
}

async function configureRole(
  runner: TransactionRunner,
  databaseRole: string,
  roleArn: string,
  grantStatements: readonly string[],
): Promise<void> {
  await ensureDatabaseRole(runner, databaseRole);
  await ensureRoleMapping(runner, databaseRole, roleArn);
  for (const sql of grantStatements) await executeOne(runner, sql);
}

async function verifyRole(
  runner: TransactionRunner,
  databaseRole: string,
  roleArn: string,
  requiredPrivileges: readonly Readonly<{ table: string; privilege: string }>[],
): Promise<number> {
  const mapping = await executeOne(
    runner,
    "SELECT 1 AS found FROM sys.iam_pg_role_mappings WHERE pg_role_name = $1 AND arn = $2",
    [databaseRole, roleArn],
  );
  if (mapping.rowCount !== 1) {
    throw new Error(`IAM mapping verification failed for ${databaseRole}.`);
  }

  const grants = await executeOne(
    runner,
    "SELECT table_name, privilege_type FROM information_schema.table_privileges WHERE table_schema = 'public' AND grantee = $1",
    [databaseRole],
  );
  const available = new Set(
    grants.rows.map(
      (row) => `${String(row.table_name)}:${String(row.privilege_type).toUpperCase()}`,
    ),
  );
  const missing = requiredPrivileges.filter(
    ({ table, privilege }) => !available.has(`${table}:${privilege}`),
  );
  if (missing.length > 0) {
    throw new Error(
      `Privilege verification failed for ${databaseRole}: ${missing.map(({ table, privilege }) => `${table}:${privilege}`).join(", ")}.`,
    );
  }
  return requiredPrivileges.length;
}

export async function configureDsqlDatabaseRoles(
  runner: TransactionRunner,
  options: DsqlDatabaseRoleOptions,
): Promise<DsqlDatabaseRoleResult> {
  const configured: string[] = [];
  const mappings: Record<string, string> = {};
  const verifiedPrivileges: Record<string, number> = {};

  if (options.ingestionRoleArn !== undefined) {
    await configureRole(
      runner,
      INGESTION_DATABASE_ROLE,
      options.ingestionRoleArn,
      [
        `GRANT SELECT, INSERT ON ${catalogTables.join(", ")} TO ${INGESTION_DATABASE_ROLE}`,
        `GRANT SELECT ON schema_migration TO ${INGESTION_DATABASE_ROLE}`,
      ],
    );
    configured.push(INGESTION_DATABASE_ROLE);
    mappings[INGESTION_DATABASE_ROLE] = options.ingestionRoleArn;
    verifiedPrivileges[INGESTION_DATABASE_ROLE] = await verifyRole(
      runner,
      INGESTION_DATABASE_ROLE,
      options.ingestionRoleArn,
      [
        ...catalogTables.flatMap((table) => [
          { table, privilege: "SELECT" },
          { table, privilege: "INSERT" },
        ]),
        { table: "schema_migration", privilege: "SELECT" },
      ],
    );
  }

  if (options.applicationReaderRoleArn !== undefined) {
    await configureRole(
      runner,
      APPLICATION_READER_DATABASE_ROLE,
      options.applicationReaderRoleArn,
      [
        `GRANT SELECT ON ${[...catalogTables, ...pricingTables].join(", ")} TO ${APPLICATION_READER_DATABASE_ROLE}`,
      ],
    );
    configured.push(APPLICATION_READER_DATABASE_ROLE);
    mappings[APPLICATION_READER_DATABASE_ROLE] = options.applicationReaderRoleArn;
    verifiedPrivileges[APPLICATION_READER_DATABASE_ROLE] = await verifyRole(
      runner,
      APPLICATION_READER_DATABASE_ROLE,
      options.applicationReaderRoleArn,
      [...catalogTables, ...pricingTables].map((table) => ({
        table,
        privilege: "SELECT",
      })),
    );
  }

  if (options.pricingWriterRoleArn !== undefined) {
    await configureRole(
      runner,
      PRICING_WRITER_DATABASE_ROLE,
      options.pricingWriterRoleArn,
      [
        `GRANT SELECT ON item TO ${PRICING_WRITER_DATABASE_ROLE}`,
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ${pricingTables.join(", ")} TO ${PRICING_WRITER_DATABASE_ROLE}`,
      ],
    );
    configured.push(PRICING_WRITER_DATABASE_ROLE);
    mappings[PRICING_WRITER_DATABASE_ROLE] = options.pricingWriterRoleArn;
    verifiedPrivileges[PRICING_WRITER_DATABASE_ROLE] = await verifyRole(
      runner,
      PRICING_WRITER_DATABASE_ROLE,
      options.pricingWriterRoleArn,
      [
        { table: "item", privilege: "SELECT" },
        ...pricingTables.flatMap((table) =>
          ["SELECT", "INSERT", "UPDATE", "DELETE"].map((privilege) => ({
            table,
            privilege,
          })),
        ),
      ],
    );
  }

  return { configured, mappings, verifiedPrivileges };
}
