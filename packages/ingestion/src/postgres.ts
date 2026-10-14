import { Pool } from "pg";
import { SqlRecipeCatalogReader, type RecipeCatalogReader } from "./catalog.js";
import { SqlRecipeChangeReader, type RecipeChangeReader } from "./recipe-change-store.js";
import type { SqlExecutor, SqlQueryResult } from "./writer.js";

export interface ClosableRecipeCatalogReader extends RecipeCatalogReader, RecipeChangeReader {
  end(): Promise<void>;
}

export interface PostgresRecipeCatalogOptions {
  readonly connectionString: string;
  readonly maxConnections?: number;
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
  const database: SqlExecutor = {
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
  };
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
