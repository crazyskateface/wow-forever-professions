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
              spell_id: 3780,
              learn_skill: null,
              acquisition: "unknown",
              faction: "unknown",
              specialization_spell_id: null,
              cooldown_seconds: null,
              availability: "unknown",
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
              client_display_name: "Heavy Leather",
              item_class_id: 7,
              item_subclass_id: 6,
              inventory_type: "INVTYPE_NON_EQUIP_IGNORE",
              client_equipment_slot: null,
              client_armor: null,
              client_required_level: 0,
              client_sell_price_copper: 15,
              client_source_product: "wow_classic_beta",
              client_source_build_id: "1.60.1.70374",
              client_source_locale: "enUS",
              classification_id: 14483,
              classification_label: "Scarce",
              classification_color: -7885825,
              classification_source_product: "wow_classic_beta",
              classification_source_build_id: "1.60.1.70374",
              classification_source_locale: "enUS",
            },
          ]);
        }
        if (sql.startsWith("SELECT ro.recipe_version_id")) {
          return result([
            {
              recipe_version_id: "spell-3780@1.60.1.69977",
              item_id: "item-2308",
              game_id: 2308,
              name: "Fine Leather Cloak",
              minimum_quantity: 1,
              maximum_quantity: 1,
              client_display_name: "Fine Leather Cloak",
              item_class_id: 4,
              item_subclass_id: 1,
              inventory_type: "INVTYPE_CLOAK",
              client_equipment_slot: "Back",
              client_armor: 14,
              client_required_level: 10,
              client_sell_price_copper: 267,
              client_source_product: "wow_classic_beta",
              client_source_build_id: "1.60.1.70374",
              client_source_locale: "enUS",
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
          spellId: 3780,
          buildId: "1.60.1.69977",
          learnSkill: null,
          availability: "unknown",
          reagents: [{
            itemId: "item-4234",
            itemClassId: 7,
            clientData: {
              displayName: "Heavy Leather",
              requiredLevel: 0,
              sellPriceCopper: 15,
              source: { build: "1.60.1.70374" },
            },
            classification: {
              id: 14483,
              label: "Scarce",
              source: { build: "1.60.1.70374" },
            },
          }],
          outputs: [{
            itemId: "item-2308",
            name: "Fine Leather Cloak",
            itemClassId: 4,
            itemSubClassId: 1,
            inventoryType: "INVTYPE_CLOAK",
            clientData: {
              displayName: "Fine Leather Cloak",
              equipmentSlot: "Back",
              armor: 14,
              requiredLevel: 10,
              sellPriceCopper: 267,
              source: { build: "1.60.1.70374" },
            },
          }],
          provenance: {
            source: "client-data",
            verification: { status: "unverified" },
          },
        },
      ],
    });
  });
});
