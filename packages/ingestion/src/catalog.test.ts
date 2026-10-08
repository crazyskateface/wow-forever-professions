import { describe, expect, it } from "vitest";
import { SqlRecipeCatalogReader } from "./catalog.js";
import type { SqlExecutor, SqlQueryResult } from "./writer.js";

function result(rows: readonly Record<string, unknown>[]): SqlQueryResult {
  return { rowCount: rows.length, rows };
}

describe("SQL recipe catalog", () => {
  it("reconstructs a product recipe with provenance from normalized rows", async () => {
    const database: SqlExecutor = {
      async query(sql) {
        if (sql.startsWith("SELECT build_id")) return result([{ build_id: "1.60.1.69977" }]);
        if (sql.startsWith("SELECT profession_id, name")) {
          return result([{ profession_id: "leatherworking", name: "Leatherworking" }]);
        }
        if (sql.startsWith("SELECT r.recipe_id")) {
          expect(sql).toContain("v.status <> 'rejected'");
          return result([
            {
              recipe_id: "spell-3780",
              recipe_version_id: "spell-3780@1.60.1.69977",
              name: "Heavy Armor Kit",
              orange: 1,
              yellow: 73,
              green: 145,
              gray: 165,
              source_kind: "client-data",
              source_label: "LibProfessionDB v1.9.1",
              verification_status: "unverified",
              verified_at: null,
              verified_by: null,
              verification_notes: "Client-derived recipe structure.",
              provenance_notes: "Required skill omitted.",
            },
          ]);
        }
        if (sql.startsWith("SELECT rr.recipe_version_id")) {
          return result([
            {
              recipe_version_id: "spell-3780@1.60.1.69977",
              item_id: "item-4234",
              game_id: 4234,
              name: "Heavy Leather",
              quantity: 5,
            },
          ]);
        }
        if (sql.startsWith("SELECT ro.recipe_version_id")) {
          return result([
            {
              recipe_version_id: "spell-3780@1.60.1.69977",
              item_id: "item-4265",
              game_id: 4265,
              name: "Heavy Armor Kit",
              minimum_quantity: 1,
              maximum_quantity: 1,
            },
          ]);
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    };

    const profession = await new SqlRecipeCatalogReader(database).getProfession(
      "leatherworking",
    );
    expect(profession).toMatchObject({
      build: "1.60.1.69977",
      recipes: [
        {
          id: "spell-3780",
          provenance: {
            source: "client-data",
            verification: { status: "unverified" },
          },
        },
      ],
    });
  });
});
