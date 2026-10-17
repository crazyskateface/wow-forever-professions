import { Pool, type PoolClient } from "pg";
import { SqlRecipeCatalogReader, type RecipeCatalogReader } from "./catalog.js";
import type { SqlMigrationRunner } from "./migrations.js";
import { SqlRecipeChangeReader, type RecipeChangeReader } from "./recipe-change-store.js";
import type { SqlExecutor, SqlQueryResult } from "./writer.js";

export interface ClosableRecipeCatalogReader extends RecipeCatalogReader, RecipeChangeReader {
  end(): Promise<void>;
}

export interface PostgresRecipeCatalogOptions {
  readonly connectionString: string;
  readonly maxConnections?: number;
}

export interface ClosablePostgresTransactionRunner extends SqlMigrationRunner {
  end(): Promise<void>;
}

function queryExecutor(client: Pool | PoolClient): SqlExecutor {
  return {
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
}

export function createPostgresTransactionRunner(
  options: PostgresRecipeCatalogOptions,
): ClosablePostgresTransactionRunner {
  if (options.connectionString.trim().length === 0) {
    throw new Error("A PostgreSQL connection string is required.");
  }
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 3,
  });
  const direct = queryExecutor(pool);

  return {
    query: direct.query,
    transaction: async (work) => {
      const client = await pool.connect();
      await client.query("BEGIN");
      try {
        const result = await work(queryExecutor(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  };
}

export function createPostgresRecipeCatalogReader(
  options: PostgresRecipeCatalogOptions,
): ClosableRecipeCatalogReader {
  if (options.connectionString.trim().length === 0) {
    throw new Error("A PostgreSQL connection string is required.");
  }

  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 3,
  });
  const database = queryExecutor(pool);
  const catalog = new SqlRecipeCatalogReader(database);
  const changes = new SqlRecipeChangeReader(database);

  return {
    listProfessions: () => catalog.listProfessions(),
    getProfession: (professionId) => catalog.getProfession(professionId),
    getRecipe: (recipeId) => catalog.getRecipe(recipeId),
    listChanges: (filter) => changes.listChanges(filter),
    getSummary: (filter) => changes.getSummary(filter),
    end: () => pool.end(),
  };
}
