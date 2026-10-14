import { describe, expect, it } from "vitest";
import {
  SqlRecipeChangeReader,
  writeRecipeBuildComparison,
  type RecipeBuildComparison,
  type SqlExecutor,
  type SqlQueryResult,
  type TransactionRunner,
} from "./index.js";

function result(rows: readonly Record<string, unknown>[]): SqlQueryResult {
  return { rowCount: rows.length, rows };
}

function comparison(): RecipeBuildComparison {
  return {
    baseBuildId: "classic-era",
    targetBuildId: "forever-current",
    comparisonType: "CLASSIC_TO_FOREVER",
    summary: { new: 0, updated: 0, removed: 0, unchanged: 1, total: 1 },
    professionSummaries: [
      {
        professionId: "leatherworking",
        professionName: "Leatherworking",
        new: 0,
        updated: 0,
        removed: 0,
        unchanged: 1,
        total: 1,
      },
    ],
    changes: [
      {
        identity: { professionId: "leatherworking", spellId: 3780 },
        professionName: "Leatherworking",
        name: "Heavy Armor Kit",
        changeType: "UNCHANGED",
        changedFields: {},
      },
    ],
  };
}

describe("recipe comparison persistence", () => {
  it("writes a complete comparison idempotently with bound values", async () => {
    let storedComparison: Record<string, unknown> | undefined;
    let storedChange: Record<string, unknown> | undefined;
    const queries: { sql: string; values: readonly unknown[] }[] = [];
    const database: SqlExecutor = {
      async query(sql, values = []) {
        queries.push({ sql, values });
        if (sql.startsWith("SELECT 1 AS found FROM wow_build")) return result([{ found: 1 }]);
        if (sql.startsWith("SELECT 1 AS found FROM recipe_comparison")) {
          return result([{ found: 1 }]);
        }
        if (sql.startsWith("SELECT 1 AS found FROM profession")) return result([{ found: 1 }]);
        if (sql.startsWith("INSERT INTO recipe_comparison")) {
          storedComparison ??= {
            comparison_id: values[0],
            base_build_id: values[1],
            target_build_id: values[2],
            comparison_type: values[3],
          };
          return result([]);
        }
        if (sql.startsWith("SELECT comparison_id, base_build_id")) {
          return result(storedComparison ? [storedComparison] : []);
        }
        if (sql.startsWith("INSERT INTO recipe_change")) {
          storedChange ??= {
            change_id: values[0],
            comparison_id: values[1],
            profession_id: values[2],
            spell_id: values[3],
            profession_name: values[4],
            recipe_name: values[5],
            change_type: values[6],
            changed_fields: values[7],
            base_snapshot: values[8],
            target_snapshot: values[9],
          };
          return result([]);
        }
        if (sql.startsWith("SELECT change_id, comparison_id")) {
          return result(storedChange ? [storedChange] : []);
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    };
    const runner: TransactionRunner = { transaction: (work) => work(database) };

    const first = await writeRecipeBuildComparison(runner, comparison(), {
      createdAt: "2026-10-12T12:00:00.000Z",
      maximumRows: 1,
    });
    const repeated = await writeRecipeBuildComparison(runner, comparison(), {
      createdAt: "2026-10-13T12:00:00.000Z",
      maximumRows: 1,
    });

    expect(repeated).toEqual(first);
    expect(first.batches).toBe(1);
    expect(first.comparisonId).toMatch(/^comparison-[a-f0-9]{64}$/);
    expect(queries.find(({ sql }) => sql.startsWith("INSERT INTO recipe_comparison"))?.sql)
      .not.toContain("classic-era");
    expect(storedChange).toMatchObject({
      profession_id: "leatherworking",
      spell_id: 3780,
      change_type: "UNCHANGED",
      changed_fields: "{}",
    });
  });

  it("rejects persistence when unchanged rows were omitted", async () => {
    const incomplete = comparison();
    await expect(
      writeRecipeBuildComparison(
        { transaction: async () => undefined },
        { ...incomplete, changes: [] },
      ),
    ).rejects.toThrow("include unchanged recipes");
  });
});

describe("SQL recipe change reader", () => {
  it("reads the latest comparison with bound filters and excludes unchanged by default", async () => {
    const queries: { sql: string; values: readonly unknown[] }[] = [];
    const database: SqlExecutor = {
      async query(sql, values = []) {
        queries.push({ sql, values });
        if (sql.startsWith("SELECT comparison_id")) {
          return result([
            {
              comparison_id: "comparison-test",
              base_build_id: "classic-era",
              target_build_id: "forever-current",
              comparison_type: "CLASSIC_TO_FOREVER",
              created_at: new Date("2026-10-12T12:00:00.000Z"),
            },
          ]);
        }
        if (sql.startsWith("SELECT profession_id")) {
          return result([
            {
              profession_id: "leatherworking",
              spell_id: 3780,
              profession_name: "Leatherworking",
              recipe_name: "Heavy Armor Kit",
              change_type: "UPDATED",
              changed_fields: JSON.stringify({
                learnSkill: { before: 150, after: 145 },
              }),
              base_snapshot: null,
              target_snapshot: null,
            },
          ]);
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    };

    const response = await new SqlRecipeChangeReader(database).listChanges({
      comparisonType: "CLASSIC_TO_FOREVER",
      professionId: "leatherworking",
      search: "armor kit",
    });

    expect(response).toMatchObject({
      comparison: { id: "comparison-test", comparisonType: "CLASSIC_TO_FOREVER" },
      changes: [{ changeType: "UPDATED", name: "Heavy Armor Kit" }],
    });
    const changeQuery = queries.find(({ sql }) => sql.startsWith("SELECT profession_id"));
    expect(changeQuery?.sql).toContain("change_type <> 'UNCHANGED'");
    expect(changeQuery?.sql).toContain("POSITION(LOWER($3)");
    expect(changeQuery?.values).toEqual([
      "comparison-test",
      "leatherworking",
      "armor kit",
    ]);
  });

  it("reconstructs stored summary counts", async () => {
    const database: SqlExecutor = {
      async query(sql) {
        if (sql.startsWith("SELECT comparison_id")) {
          return result([
            {
              comparison_id: "comparison-test",
              base_build_id: "classic-era",
              target_build_id: "forever-current",
              comparison_type: "CLASSIC_TO_FOREVER",
              created_at: "2026-10-12 12:00:00+00",
            },
          ]);
        }
        if (sql.startsWith("SELECT change_type")) {
          return result([
            { change_type: "NEW", change_count: "2", profession_name: "Leatherworking" },
            { change_type: "UPDATED", change_count: "1", profession_name: "Leatherworking" },
            { change_type: "UNCHANGED", change_count: "5", profession_name: "Leatherworking" },
          ]);
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    };

    const response = await new SqlRecipeChangeReader(database).getSummary({
      comparisonType: "CLASSIC_TO_FOREVER",
      professionId: "leatherworking",
    });

    expect(response).toMatchObject({
      professionId: "leatherworking",
      professionName: "Leatherworking",
      summary: { new: 2, updated: 1, removed: 0, unchanged: 5, total: 8 },
    });
  });
});
