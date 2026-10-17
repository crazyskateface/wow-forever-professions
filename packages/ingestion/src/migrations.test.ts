import { describe, expect, it } from "vitest";
import {
  applySqlMigrations,
  defineSqlMigration,
  type SqlMigrationRunner,
} from "./migrations.js";
import type { SqlExecutor, SqlQueryResult } from "./writer.js";

class MemoryMigrationRunner implements SqlMigrationRunner {
  ledgerExists = false;
  readonly ledger = new Map<string, string>();
  readonly ddl: string[] = [];

  async query(sql: string, values: readonly unknown[] = []): Promise<SqlQueryResult> {
    if (sql.includes("information_schema.tables")) {
      return { rowCount: this.ledgerExists ? 1 : 0, rows: this.ledgerExists ? [{ found: 1 }] : [] };
    }
    if (sql.startsWith("SELECT migration_name")) {
      const scope = String(values[0]);
      const rows = [...this.ledger]
        .filter(([key]) => key.startsWith(`${scope}/`))
        .map(([key, checksum_sha256]) => ({
          migration_name: key.slice(scope.length + 1),
          checksum_sha256,
        }));
      return { rowCount: rows.length, rows };
    }
    throw new Error(`Unexpected direct query: ${sql}`);
  }

  async transaction<T>(work: (database: SqlExecutor) => Promise<T>): Promise<T> {
    const database: SqlExecutor = {
      query: async (sql, values = []) => {
        if (sql.startsWith("CREATE TABLE IF NOT EXISTS schema_migration")) {
          this.ledgerExists = true;
          return { rowCount: null, rows: [] };
        }
        if (sql.startsWith("INSERT INTO schema_migration")) {
          const scope = String(values[0]);
          const filename = String(values[1]);
          const checksum = String(values[2]);
          const key = `${scope}/${filename}`;
          if (!this.ledger.has(key)) this.ledger.set(key, checksum);
          return { rowCount: 1, rows: [] };
        }
        if (sql.startsWith("SELECT checksum_sha256 FROM schema_migration")) {
          const key = `${String(values[0])}/${String(values[1])}`;
          const checksum = this.ledger.get(key);
          return checksum === undefined
            ? { rowCount: 0, rows: [] }
            : { rowCount: 1, rows: [{ checksum_sha256: checksum }] };
        }
        this.ddl.push(sql);
        return { rowCount: null, rows: [] };
      },
    };
    return work(database);
  }
}

const migrations = [
  defineSqlMigration("001_create_alpha.sql", "CREATE TABLE IF NOT EXISTS alpha (id INTEGER);\r\n"),
  defineSqlMigration("002_create_beta.sql", "CREATE TABLE IF NOT EXISTS beta (id INTEGER);\n"),
];

describe("applySqlMigrations", () => {
  it("records checksums and skips the complete set on a repeat run", async () => {
    const runner = new MemoryMigrationRunner();
    const first = await applySqlMigrations(runner, {
      dialect: "postgres",
      scope: "catalog",
      migrations,
      appliedAt: "2026-10-16T00:00:00.000Z",
    });
    const repeated = await applySqlMigrations(runner, {
      dialect: "postgres",
      scope: "catalog",
      migrations,
      appliedAt: "2026-10-16T01:00:00.000Z",
    });

    expect(first.applied).toEqual(["001_create_alpha.sql", "002_create_beta.sql"]);
    expect(repeated.applied).toEqual([]);
    expect(repeated.skipped).toEqual(["001_create_alpha.sql", "002_create_beta.sql"]);
    expect(runner.ddl).toHaveLength(2);
  });

  it("stops before new DDL when a recorded checksum has drifted", async () => {
    const runner = new MemoryMigrationRunner();
    runner.ledgerExists = true;
    runner.ledger.set("catalog/001_create_alpha.sql", "0".repeat(64));

    await expect(
      applySqlMigrations(runner, {
        dialect: "aurora-dsql",
        scope: "catalog",
        migrations,
      }),
    ).rejects.toThrow("no longer matches its recorded checksum");
    expect(runner.ddl).toEqual([]);
  });

  it("rejects a recorded migration that is missing locally", async () => {
    const runner = new MemoryMigrationRunner();
    runner.ledgerExists = true;
    runner.ledger.set("catalog/999_removed.sql", "0".repeat(64));

    await expect(
      applySqlMigrations(runner, {
        dialect: "aurora-dsql",
        scope: "catalog",
        migrations,
      }),
    ).rejects.toThrow("is missing locally");
  });
});
