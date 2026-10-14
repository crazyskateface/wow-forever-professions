import { createHash } from "node:crypto";
import {
  recipeChangeSchema,
  recipeChangesResponseSchema,
  recipeChangesSummaryResponseSchema,
  type NormalizedBuild,
  type RecipeChange,
  type RecipeChangeCounts,
  type RecipeChangesResponse,
  type RecipeChangesSummaryResponse,
} from "@forever-professions/contracts";
import { createDsqlBatches, type DsqlBatchOptions } from "./batching.js";
import {
  compareRecipeBuilds,
  type RecipeBuildComparison,
  type RecipeChangeType,
  type RecipeComparisonType,
} from "./recipe-changes.js";
import type { SqlExecutor, TransactionRunner } from "./writer.js";

export interface RecipeChangeReadFilter {
  readonly comparisonType: RecipeComparisonType;
  readonly professionId?: string;
  readonly changeType?: RecipeChangeType;
  readonly search?: string;
}

export interface RecipeChangeSummaryFilter {
  readonly comparisonType: RecipeComparisonType;
  readonly professionId?: string;
}

export interface RecipeChangeReader {
  listChanges(filter: RecipeChangeReadFilter): Promise<RecipeChangesResponse | undefined>;
  getSummary(
    filter: RecipeChangeSummaryFilter,
  ): Promise<RecipeChangesSummaryResponse | undefined>;
}

export interface RecipeBuildComparisonWriteOptions extends DsqlBatchOptions {
  readonly createdAt?: string;
}

export interface RecipeBuildComparisonWriteResult {
  readonly comparisonId: string;
  readonly batches: number;
}

export interface GenerateAndStoreRecipeComparisonResult
  extends RecipeBuildComparisonWriteResult {
  readonly comparison: RecipeBuildComparison;
}

interface StoredChangeRow {
  readonly changeId: string;
  readonly comparisonId: string;
  readonly change: RecipeChange;
}

function stableId(prefix: string, parts: readonly unknown[]): string {
  const digest = createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  return `${prefix}-${digest}`;
}

export function createRecipeComparisonId(
  comparison: Pick<
    RecipeBuildComparison,
    "baseBuildId" | "targetBuildId" | "comparisonType"
  >,
): string {
  return stableId("comparison", [
    comparison.comparisonType,
    comparison.baseBuildId,
    comparison.targetBuildId,
  ]);
}

function createRecipeChangeId(
  comparisonId: string,
  change: Pick<RecipeChange, "identity">,
): string {
  return stableId("change", [
    comparisonId,
    change.identity.professionId,
    change.identity.spellId,
  ]);
}

async function assertExists(
  database: SqlExecutor,
  sql: string,
  values: readonly unknown[],
  message: string,
): Promise<void> {
  const result = await database.query(sql, values);
  if (result.rowCount !== 1) throw new Error(message);
}

function valuesMatch(
  actual: Readonly<Record<string, unknown>>,
  expected: Readonly<Record<string, unknown>>,
): boolean {
  return Object.entries(expected).every(([key, value]) => actual[key] === value);
}

export async function writeRecipeBuildComparison(
  runner: TransactionRunner,
  comparison: RecipeBuildComparison,
  options: RecipeBuildComparisonWriteOptions = {},
): Promise<RecipeBuildComparisonWriteResult> {
  if (comparison.changes.length !== comparison.summary.total) {
    throw new Error(
      "Persisted recipe comparisons must include unchanged recipes so summaries remain reconstructable.",
    );
  }

  const comparisonId = createRecipeComparisonId(comparison);
  const createdAt = options.createdAt ?? new Date().toISOString();

  await runner.transaction(async (database) => {
    await assertExists(
      database,
      "SELECT 1 AS found FROM wow_build WHERE build_id = $1",
      [comparison.baseBuildId],
      `Missing base build ${comparison.baseBuildId}.`,
    );
    await assertExists(
      database,
      "SELECT 1 AS found FROM wow_build WHERE build_id = $1",
      [comparison.targetBuildId],
      `Missing target build ${comparison.targetBuildId}.`,
    );
    await database.query(
      "INSERT INTO recipe_comparison (comparison_id, base_build_id, target_build_id, comparison_type, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
      [
        comparisonId,
        comparison.baseBuildId,
        comparison.targetBuildId,
        comparison.comparisonType,
        createdAt,
      ],
    );
    const stored = await database.query(
      "SELECT comparison_id, base_build_id, target_build_id, comparison_type FROM recipe_comparison WHERE comparison_id = $1",
      [comparisonId],
    );
    const row = stored.rows[0];
    if (
      stored.rowCount !== 1 ||
      !row ||
      !valuesMatch(row, {
        comparison_id: comparisonId,
        base_build_id: comparison.baseBuildId,
        target_build_id: comparison.targetBuildId,
        comparison_type: comparison.comparisonType,
      })
    ) {
      throw new Error(`Recipe comparison ${comparisonId} conflicts with stored data.`);
    }
  });

  const rows: StoredChangeRow[] = comparison.changes.map((change) => ({
    comparisonId,
    changeId: createRecipeChangeId(comparisonId, change),
    change: recipeChangeSchema.parse(change),
  }));
  const batches = createDsqlBatches(rows, options);

  for (const batch of batches) {
    await runner.transaction(async (database) => {
      await assertExists(
        database,
        "SELECT 1 AS found FROM recipe_comparison WHERE comparison_id = $1",
        [comparisonId],
        `Missing recipe comparison ${comparisonId}.`,
      );
      const professionIds = [
        ...new Set(batch.map(({ change }) => change.identity.professionId)),
      ];
      for (const professionId of professionIds) {
        await assertExists(
          database,
          "SELECT 1 AS found FROM profession WHERE profession_id = $1",
          [professionId],
          `Missing profession ${professionId}.`,
        );
      }

      for (const { changeId, change } of batch) {
        const changedFields = JSON.stringify(change.changedFields);
        const baseSnapshot = change.base === undefined ? null : JSON.stringify(change.base);
        const targetSnapshot = change.target === undefined ? null : JSON.stringify(change.target);
        const values = [
          changeId,
          comparisonId,
          change.identity.professionId,
          change.identity.spellId,
          change.professionName,
          change.name,
          change.changeType,
          changedFields,
          baseSnapshot,
          targetSnapshot,
        ] as const;
        await database.query(
          "INSERT INTO recipe_change (change_id, comparison_id, profession_id, spell_id, profession_name, recipe_name, change_type, changed_fields, base_snapshot, target_snapshot) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT DO NOTHING",
          values,
        );
        const stored = await database.query(
          "SELECT change_id, comparison_id, profession_id, spell_id, profession_name, recipe_name, change_type, changed_fields, base_snapshot, target_snapshot FROM recipe_change WHERE change_id = $1",
          [changeId],
        );
        const row = stored.rows[0];
        if (
          stored.rowCount !== 1 ||
          !row ||
          !valuesMatch(row, {
            change_id: changeId,
            comparison_id: comparisonId,
            profession_id: change.identity.professionId,
            spell_id: change.identity.spellId,
            profession_name: change.professionName,
            recipe_name: change.name,
            change_type: change.changeType,
            changed_fields: changedFields,
            base_snapshot: baseSnapshot,
            target_snapshot: targetSnapshot,
          })
        ) {
          throw new Error(`Recipe change ${changeId} conflicts with stored data.`);
        }
      }
    });
  }

  return { comparisonId, batches: batches.length };
}

export async function generateAndStoreRecipeComparison(
  runner: TransactionRunner,
  baseBuild: NormalizedBuild,
  targetBuild: NormalizedBuild,
  options: RecipeBuildComparisonWriteOptions & {
    readonly comparisonType: RecipeComparisonType;
  },
): Promise<GenerateAndStoreRecipeComparisonResult> {
  const comparison = compareRecipeBuilds(baseBuild, targetBuild, {
    comparisonType: options.comparisonType,
    includeUnchanged: true,
  });
  const writeResult = await writeRecipeBuildComparison(runner, comparison, options);
  return { ...writeResult, comparison };
}

function requiredString(row: Readonly<Record<string, unknown>>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Recipe change row is missing string column ${key}.`);
  }
  return value;
}

function requiredNumber(row: Readonly<Record<string, unknown>>, key: string): number {
  const value = Number(row[key]);
  if (!Number.isInteger(value)) {
    throw new Error(`Recipe change row is missing integer column ${key}.`);
  }
  return value;
}

function optionalJson(row: Readonly<Record<string, unknown>>, key: string): unknown {
  const value = row[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`Recipe change column ${key} must be JSON text.`);
  return JSON.parse(value);
}

function isoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string") throw new Error("Recipe comparison created_at is invalid.");
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) throw new Error("Recipe comparison created_at is invalid.");
  return new Date(timestamp).toISOString();
}

function emptyCounts(): RecipeChangeCounts {
  return { new: 0, updated: 0, removed: 0, unchanged: 0, total: 0 };
}

export class SqlRecipeChangeReader implements RecipeChangeReader {
  constructor(private readonly database: SqlExecutor) {}

  private async latestComparison(comparisonType: RecipeComparisonType) {
    const result = await this.database.query(
      "SELECT comparison_id, base_build_id, target_build_id, comparison_type, created_at FROM recipe_comparison WHERE comparison_type = $1 ORDER BY created_at DESC, comparison_id DESC LIMIT 1",
      [comparisonType],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: requiredString(row, "comparison_id"),
      baseBuildId: requiredString(row, "base_build_id"),
      targetBuildId: requiredString(row, "target_build_id"),
      comparisonType: requiredString(row, "comparison_type"),
      createdAt: isoTimestamp(row.created_at),
    };
  }

  async listChanges(filter: RecipeChangeReadFilter): Promise<RecipeChangesResponse | undefined> {
    const comparison = await this.latestComparison(filter.comparisonType);
    if (!comparison) return undefined;
    const clauses = ["comparison_id = $1"];
    const values: unknown[] = [comparison.id];

    if (filter.professionId !== undefined) {
      values.push(filter.professionId);
      clauses.push(`profession_id = $${values.length}`);
    }
    if (filter.changeType !== undefined) {
      values.push(filter.changeType);
      clauses.push(`change_type = $${values.length}`);
    } else {
      clauses.push("change_type <> 'UNCHANGED'");
    }
    if (filter.search !== undefined) {
      values.push(filter.search);
      const placeholder = `$${values.length}`;
      clauses.push(
        `(POSITION(LOWER(${placeholder}) IN LOWER(recipe_name)) > 0 OR POSITION(LOWER(${placeholder}) IN LOWER(COALESCE(base_snapshot, ''))) > 0 OR POSITION(LOWER(${placeholder}) IN LOWER(COALESCE(target_snapshot, ''))) > 0)`,
      );
    }

    const result = await this.database.query(
      `SELECT profession_id, spell_id, profession_name, recipe_name, change_type, changed_fields, base_snapshot, target_snapshot FROM recipe_change WHERE ${clauses.join(" AND ")} ORDER BY profession_name, recipe_name, spell_id`,
      values,
    );
    const changes = result.rows.map((row) =>
      recipeChangeSchema.parse({
        identity: {
          professionId: requiredString(row, "profession_id"),
          spellId: requiredNumber(row, "spell_id"),
        },
        professionName: requiredString(row, "profession_name"),
        name: requiredString(row, "recipe_name"),
        changeType: requiredString(row, "change_type"),
        changedFields: optionalJson(row, "changed_fields"),
        ...(row.base_snapshot === null ? {} : { base: optionalJson(row, "base_snapshot") }),
        ...(row.target_snapshot === null
          ? {}
          : { target: optionalJson(row, "target_snapshot") }),
      }),
    );

    return recipeChangesResponseSchema.parse({ comparison, changes });
  }

  async getSummary(
    filter: RecipeChangeSummaryFilter,
  ): Promise<RecipeChangesSummaryResponse | undefined> {
    const comparison = await this.latestComparison(filter.comparisonType);
    if (!comparison) return undefined;
    const values: unknown[] = [comparison.id];
    let professionClause = "";
    if (filter.professionId !== undefined) {
      values.push(filter.professionId);
      professionClause = ` AND profession_id = $${values.length}`;
    }
    const result = await this.database.query(
      `SELECT change_type, COUNT(*) AS change_count, MIN(profession_name) AS profession_name FROM recipe_change WHERE comparison_id = $1${professionClause} GROUP BY change_type ORDER BY change_type`,
      values,
    );
    const summary = emptyCounts();
    let professionName: string | undefined;
    for (const row of result.rows) {
      const changeType = requiredString(row, "change_type") as RecipeChangeType;
      const count = requiredNumber(row, "change_count");
      summary.total += count;
      if (changeType === "NEW") summary.new += count;
      if (changeType === "UPDATED") summary.updated += count;
      if (changeType === "REMOVED") summary.removed += count;
      if (changeType === "UNCHANGED") summary.unchanged += count;
      if (filter.professionId !== undefined && row.profession_name !== null) {
        professionName = requiredString(row, "profession_name");
      }
    }

    return recipeChangesSummaryResponseSchema.parse({
      comparison,
      ...(filter.professionId === undefined ? {} : { professionId: filter.professionId }),
      ...(professionName === undefined ? {} : { professionName }),
      summary,
    });
  }
}
