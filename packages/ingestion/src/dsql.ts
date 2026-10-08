import {
  AuroraDSQLPool,
  type AuroraDSQLPoolConfig,
  type OCCRetryConfig,
} from "@aws/aurora-dsql-node-postgres-connector";
import type { SqlExecutor, SqlQueryResult, TransactionRunner } from "./writer.js";

export interface AuroraDsqlTransactionRunnerOptions {
  readonly host: string;
  readonly user: string;
  readonly database?: string;
  readonly region?: string;
  readonly maxConnections?: number;
  readonly idleTimeoutMilliseconds?: number;
  readonly retry?: Partial<OCCRetryConfig>;
  readonly credentials?: AuroraDSQLPoolConfig["customCredentialsProvider"];
}

export interface ClosableTransactionRunner extends TransactionRunner, SqlExecutor {
  end(): Promise<void>;
}

export function createAuroraDsqlTransactionRunner(
  options: AuroraDsqlTransactionRunnerOptions,
): ClosableTransactionRunner {
  if (options.host.trim().length === 0) throw new Error("A DSQL cluster host is required.");
  if (options.user.trim().length === 0) throw new Error("A DSQL database user is required.");

  const pool = new AuroraDSQLPool({
    host: options.host,
    user: options.user,
    database: options.database ?? "postgres",
    max: options.maxConnections ?? 3,
    idleTimeoutMillis: options.idleTimeoutMilliseconds ?? 60_000,
    retry: options.retry ?? { maxRetries: 5 },
    ...(options.region === undefined ? {} : { region: options.region }),
    ...(options.credentials === undefined
      ? {}
      : { customCredentialsProvider: options.credentials }),
  });

  return {
    query: async (sql, values): Promise<SqlQueryResult> => {
      const result =
        values === undefined
          ? await pool.query(sql)
          : await pool.query(sql, [...values]);
      return {
        rowCount: result.rowCount,
        rows: result.rows as readonly Record<string, unknown>[],
      };
    },
    transaction: (work) =>
      pool.transaction(async (client) => {
        const database: SqlExecutor = {
          query: async (sql, values): Promise<SqlQueryResult> => {
            const result =
              values === undefined
                ? await client.query(sql)
                : await client.query(sql, [...values]);
            return {
              rowCount: result.rowCount,
              rows: result.rows as readonly Record<string, unknown>[],
            };
          },
        };
        return work(database);
      }),
    end: () => pool.end(),
  };
}
