import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { SqlExecutor, TransactionRunner } from "./writer.js";

const migrationFilenamePattern = /^\d{3}_[a-z0-9_]+\.sql$/;
const migrationScopePattern = /^[a-z][a-z0-9_-]{0,63}$/;
const migrationLedgerTable = "schema_migration";

export interface SqlMigration {
  readonly filename: string;
  readonly checksum: string;
  readonly sql: string;
}

export interface SqlMigrationRunner extends TransactionRunner, SqlExecutor {}

export interface ApplySqlMigrationsOptions {
  readonly dialect: "aurora-dsql" | "postgres";
  readonly scope: string;
  readonly migrations: readonly SqlMigration[];
  readonly appliedAt?: string;
}

export interface ApplySqlMigrationsResult {
  readonly scope: string;
  readonly discovered: number;
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
  readonly latest: string | null;
}

const migrationLedgerDdl = `CREATE TABLE IF NOT EXISTS ${migrationLedgerTable} (
  migration_scope VARCHAR(64) NOT NULL,
  migration_name VARCHAR(256) NOT NULL,
  checksum_sha256 VARCHAR(64) NOT NULL,
  applied_at TIMESTAMP NOT NULL,
  PRIMARY KEY (migration_scope, migration_name)
)`;

function normalizeSql(sql: string): string {
  return sql.replace(/\r\n?/g, "\n").trim();
}

function checksumSql(sql: string): string {
  return createHash("sha256").update(normalizeSql(sql), "utf8").digest("hex");
}

function assertSingleStatement(filename: string, sql: string): void {
  const statements = normalizeSql(sql)
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  if (statements.length !== 1) {
    throw new Error(`Migration ${filename} must contain exactly one SQL statement.`);
  }
}

export function defineSqlMigration(filename: string, sql: string): SqlMigration {
  if (!migrationFilenamePattern.test(filename)) {
    throw new Error(
      `Migration filename ${JSON.stringify(filename)} must match NNN_lowercase_name.sql.`,
    );
  }
  assertSingleStatement(filename, sql);
  const normalized = normalizeSql(sql);
  return { filename, checksum: checksumSql(normalized), sql: normalized };
}

export async function loadSqlMigrations(directory: URL): Promise<readonly SqlMigration[]> {
  const filenames = (await readdir(directory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
  const seenPrefixes = new Set<string>();
  const migrations: SqlMigration[] = [];

  for (const filename of filenames) {
    const prefix = filename.slice(0, 3);
    if (seenPrefixes.has(prefix)) {
      throw new Error(`Migration sequence ${prefix} is declared more than once.`);
    }
    seenPrefixes.add(prefix);
    migrations.push(defineSqlMigration(filename, await readFile(new URL(filename, directory), "utf8")));
  }

  return migrations;
}

async function executeOne(
  runner: TransactionRunner,
  sql: string,
  values?: readonly unknown[],
) {
  return runner.transaction((database) => database.query(sql, values));
}

async function waitForDdl(runner: SqlExecutor, filename: string, result: Awaited<ReturnType<typeof executeOne>>): Promise<void> {
  const jobId = result.rows[0]?.job_id;
  if (typeof jobId !== "string" || jobId.length === 0) return;

  const wait = await runner.query("CALL sys.wait_for_job($1)", [jobId]);
  const completed = Object.values(wait.rows[0] ?? {}).find(
    (value): value is boolean => typeof value === "boolean",
  );
  if (completed === false) {
    throw new Error(`Asynchronous migration ${filename} did not complete successfully.`);
  }
}

async function ensureMigrationLedger(runner: SqlMigrationRunner): Promise<void> {
  const present = await runner.query(
    "SELECT 1 AS found FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
    [migrationLedgerTable],
  );
  if (present.rowCount !== 0) return;

  const result = await executeOne(runner, migrationLedgerDdl);
  await waitForDdl(runner, migrationLedgerTable, result);
}

function sqlForDialect(migration: SqlMigration, dialect: ApplySqlMigrationsOptions["dialect"]): string {
  if (dialect === "aurora-dsql") return migration.sql;
  return migration.sql.replace(
    "CREATE INDEX ASYNC IF NOT EXISTS",
    "CREATE INDEX IF NOT EXISTS",
  );
}

function readAppliedRows(rows: readonly Record<string, unknown>[]): Map<string, string> {
  const applied = new Map<string, string>();
  for (const row of rows) {
    const migrationName = row.migration_name;
    const checksum = row.checksum_sha256;
    if (typeof migrationName !== "string" || typeof checksum !== "string") {
      throw new Error("The migration ledger contains an invalid record.");
    }
    applied.set(migrationName, checksum);
  }
  return applied;
}

async function recordAppliedMigration(
  runner: TransactionRunner,
  scope: string,
  migration: SqlMigration,
  appliedAt: string,
): Promise<void> {
  await runner.transaction(async (database) => {
    await database.query(
      `INSERT INTO ${migrationLedgerTable} (migration_scope, migration_name, checksum_sha256, applied_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [scope, migration.filename, migration.checksum, appliedAt],
    );
    const stored = await database.query(
      `SELECT checksum_sha256 FROM ${migrationLedgerTable} WHERE migration_scope = $1 AND migration_name = $2`,
      [scope, migration.filename],
    );
    if (stored.rowCount !== 1 || stored.rows[0]?.checksum_sha256 !== migration.checksum) {
      throw new Error(
        `Migration ${scope}/${migration.filename} conflicts with the recorded checksum.`,
      );
    }
  });
}

export async function applySqlMigrations(
  runner: SqlMigrationRunner,
  options: ApplySqlMigrationsOptions,
): Promise<ApplySqlMigrationsResult> {
  if (!migrationScopePattern.test(options.scope)) {
    throw new Error("Migration scope must be a lowercase identifier up to 64 characters.");
  }

  const migrationByName = new Map<string, SqlMigration>();
  for (const migration of options.migrations) {
    if (migrationByName.has(migration.filename)) {
      throw new Error(`Migration ${migration.filename} is declared more than once.`);
    }
    migrationByName.set(migration.filename, migration);
  }

  await ensureMigrationLedger(runner);
  const ledger = await runner.query(
    `SELECT migration_name, checksum_sha256 FROM ${migrationLedgerTable} WHERE migration_scope = $1 ORDER BY migration_name`,
    [options.scope],
  );
  const recorded = readAppliedRows(ledger.rows);

  for (const [filename, checksum] of recorded) {
    const migration = migrationByName.get(filename);
    if (!migration) {
      throw new Error(
        `Migration drift detected: recorded migration ${options.scope}/${filename} is missing locally.`,
      );
    }
    if (migration.checksum !== checksum) {
      throw new Error(
        `Migration drift detected: ${options.scope}/${filename} no longer matches its recorded checksum.`,
      );
    }
  }

  const applied: string[] = [];
  const skipped: string[] = [];
  const appliedAt = options.appliedAt ?? new Date().toISOString();
  for (const migration of options.migrations) {
    if (recorded.has(migration.filename)) {
      skipped.push(migration.filename);
      continue;
    }

    const result = await executeOne(
      runner,
      sqlForDialect(migration, options.dialect),
    );
    if (options.dialect === "aurora-dsql") {
      await waitForDdl(runner, migration.filename, result);
    }
    await recordAppliedMigration(runner, options.scope, migration, appliedAt);
    applied.push(migration.filename);
  }

  return {
    scope: options.scope,
    discovered: options.migrations.length,
    applied,
    skipped,
    latest: options.migrations.at(-1)?.filename ?? null,
  };
}
