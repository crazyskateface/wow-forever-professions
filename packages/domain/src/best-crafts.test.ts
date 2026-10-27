import { describe, expect, it } from "vitest";
import { recommendCrafts, type CraftEquipment, type CraftRecipe } from "./best-crafts.js";

const source = { product: "wow_classic_beta", build: "1.60.1.70450", locale: "enUS" };
const rogue = { classId: "rogue", roleId: "melee", level: 20, faction: "alliance" } as const;
function gear(id: string, level = 19, stats = [{ statId: 3, value: 10 }]): CraftEquipment {
  return { itemId: id, name: id, itemClassId: 4, itemSubClassId: 2, inventoryType: "INVTYPE_CHEST", clientData: { requiredLevel: level, stats, source } };
}
function recipe(id: string, output = gear(id), extra: Partial<CraftRecipe> = {}): CraftRecipe {
  return { id, outputs: [output], availability: "unknown", faction: "both", provenance: { source: "client-data", verification: { status: "unverified" } }, ...extra };
}
const winners = (result: ReturnType<typeof recommendCrafts>) => result.slots.map(({ best }) => best.recipe.id);

describe("best crafts", () => {
  it("includes level 19 by 20, retains earlier stronger crafts, and excludes later unlocks", () => {
    const recipes = [recipe("early"), recipe("newer", gear("newer", 20, [{ statId: 3, value: 5 }])), recipe("later", gear("later", 21, [{ statId: 3, value: 100 }]))];
    const result = recommendCrafts(recipes, rogue);
    expect(winners(result)).toEqual(["early"]);
    expect(result.slots[0]!.alternatives.map(({ recipe: entry }) => entry.id)).toEqual(["newer"]);
    expect(winners(recommendCrafts(recipes, { ...rogue, level: 30 }))).toEqual(["later"]);
  });

  it("keeps the 55 target separate from level 56–60 equipment", () => {
    const recipes = [recipe("55", gear("55", 55)), recipe("56", gear("56", 56, [{ statId: 3, value: 20 }]))];
    expect(winners(recommendCrafts(recipes, { ...rogue, level: 55 }))).toEqual(["55"]);
    expect(winners(recommendCrafts(recipes, { ...rogue, level: 60 }))).toEqual(["56"]);
  });

  it("changes the preferred craft for healing versus physical damage", () => {
    const recipes = [recipe("agility"), recipe("healing", gear("healing", 19, [{ statId: 41, value: 20 }, { statId: 5, value: 5 }]))];
    expect(winners(recommendCrafts(recipes, rogue))).toEqual(["agility"]);
    expect(winners(recommendCrafts(recipes, { ...rogue, classId: "druid", roleId: "healing" }))).toEqual(["healing"]);
  });

  it("respects armor proficiency and the level-40 mail transition", () => {
    const mail = { ...gear("mail", 20, [{ statId: 3, value: 30 }]), itemSubClassId: 3 };
    const cloak = { ...gear("cloak", 20, [{ statId: 45, value: 10 }]), inventoryType: "INVTYPE_CLOAK" };
    const recipes = [recipe("leather"), recipe("mail", mail), recipe("cloak", cloak)];
    expect(winners(recommendCrafts(recipes, { ...rogue, level: 60 }))).toEqual(["leather"]);
    expect(winners(recommendCrafts(recipes, { ...rogue, classId: "hunter", roleId: "ranged", level: 30 }))).toEqual(["leather"]);
    expect(winners(recommendCrafts(recipes, { ...rogue, classId: "hunter", roleId: "ranged", level: 40 }))).toEqual(["mail"]);
    expect(winners(recommendCrafts(recipes, { ...rogue, classId: "mage", roleId: "caster" }))).toEqual(["cloak"]);
  });

  it("excludes unavailable, rejected, fallback, sample and opposite-faction recipes", () => {
    const rejected = { source: "client-data", verification: { status: "rejected" } };
    const recipes = [
      recipe("unknown"), recipe("unavailable", gear("unavailable"), { availability: "unavailable" }),
      recipe("rejected", gear("rejected"), { provenance: rejected }),
      ...["classic-fallback", "fixture"].map((source) => recipe(source, gear(source), { provenance: { source, verification: { status: "unverified" } } })),
      recipe("horde", gear("horde"), { faction: "horde" }),
    ];
    const result = recommendCrafts(recipes, rogue);
    expect(winners(result)).toEqual(["unknown"]);
    expect(result.slots[0]!.alternatives).toEqual([]);
    expect(result.excludedEvidenceCount).toBe(4);
  });

  it("keeps missing or unsupported client stats out of recommendations", () => {
    const recipes = [
      recipe("missing", { ...gear("missing"), clientData: undefined }),
      recipe("no-stats", { ...gear("no-stats"), clientData: { source, requiredLevel: 1 } }),
      recipe("classic", { ...gear("classic"), clientData: { source: { ...source, build: "1.15.9.69722" }, requiredLevel: 1, stats: [{ statId: 3, value: 999 }] } }),
      recipe("unknown-type", { ...gear("unknown-type"), itemSubClassId: undefined }),
    ];
    const result = recommendCrafts(recipes, rogue);
    expect(result.slots).toEqual([]);
    expect(result.missingDataCount).toBe(4);
  });

  it("deduplicates output items and resolves ties independently of catalog order", () => {
    const recipes = [recipe("z", gear("same")), recipe("a", gear("same")), recipe("b"), recipe("c"), recipe("d")];
    const result = recommendCrafts(recipes, rogue);
    expect(result).toEqual(recommendCrafts([...recipes].reverse(), rogue));
    expect(winners(result)).toEqual(["a"]);
    expect(result.slots[0]!.alternatives.map(({ recipe: entry }) => entry.id)).toEqual(["b", "c"]);
  });

  it("normalizes robe/chest slots and can recommend known base armor for tanks", () => {
    const recipes = [recipe("robe", { ...gear("robe", 20, []), inventoryType: "INVTYPE_ROBE", clientData: { source, requiredLevel: 20, stats: [], armor: 100 } }), recipe("chest", { ...gear("chest", 20, []), clientData: { source, requiredLevel: 20, stats: [], armor: 200 } })];
    const result = recommendCrafts(recipes, { ...rogue, classId: "druid", roleId: "bear" });
    expect(result.slots).toHaveLength(1);
    expect(winners(result)).toEqual(["chest"]);
  });

  it("recognizes the pinned client's wrist inventory type", () => {
    const result = recommendCrafts([recipe("bracers", { ...gear("bracers"), inventoryType: "INVTYPE_WRIST" })], rogue);
    expect(result.slots.map(({ slot }) => slot)).toEqual(["Wrists"]);
  });
});
