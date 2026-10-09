import { describe, expect, it } from "vitest";
import { convertProfessionDbSnapshot } from "./professiondb.js";

const coreLua = `
-- build 1.60.1.69977 - 1 recipes
lib:LoadCore(165, {
  [3780] = {
    ["craftedItemId"] = 4265,
    ["difficulty"] = { 1, 73, 145, 165 },
    ["reagents"] = { [2321] = 1, [4234] = 5 },
    ["requiredSkill"] = 150,
  },
})
lib:LoadBorrowed("requiredSkill", "Vanilla", {3780})
`;

const recipeNamesLua = `
lib:LoadNames(165, {
  [3780] = { ["name"] = "Heavy Armor Kit" },
})
`;

const acquireMethodsLua = `
lib:LoadAcquireMethods({
  [3780] = 1,
})
`;

const itemNamesLua = `
lib:LoadNames({
  [2321]="Fine Thread",
  [4234]="Heavy Leather",
  [4265]="Heavy Armor Kit",
})
`;

describe("ProfessionDB conversion", () => {
  it("converts client-backed recipe records and reports borrowed omissions", () => {
    const converted = convertProfessionDbSnapshot({
      coreLua,
      acquireMethodsLua,
      recipeNamesLua,
      itemNamesLua,
      profession: { id: "leatherworking", name: "Leatherworking", skillLineId: 165 },
      professionDbVersion: "v1.9.1",
      itemDbVersion: "v1.3.0",
      sourceUrl: "https://www.curseforge.com/wow/addons/libprofessiondb/files/9095167",
    });

    expect(converted.report).toEqual({
      buildId: "1.60.1.69977",
      recipes: 1,
      items: 3,
      missingItemNames: 0,
      knownLearnSkillRecipes: 0,
      borrowedRequiredSkillRecipes: 1,
      automaticRecipes: 1,
      specializationRecipes: 0,
      provisionalOutputQuantityRecipes: 1,
    });
    expect(converted.dataset.professions[0]?.recipes[0]).toMatchObject({
      id: "spell-3780",
      name: "Heavy Armor Kit",
      metadata: {
        spellId: 3780,
        learnSkill: null,
        acquisition: "automatic",
        faction: "unknown",
        specializationSpellId: null,
        cooldownSeconds: null,
        availability: "available",
      },
      thresholds: { orange: 1, yellow: 73, green: 145, gray: 165 },
      reagents: [
        { item: { gameId: 2321, name: "Fine Thread" }, quantity: 1 },
        { item: { gameId: 4234, name: "Heavy Leather" }, quantity: 5 },
      ],
      outputs: [
        { item: { gameId: 4265, name: "Heavy Armor Kit" }, minimumQuantity: 1 },
      ],
      verification: { status: "unverified" },
    });
    expect(
      converted.dataset.professions[0]?.recipes[0]?.provenanceNotes,
    ).toContain("required skill was deliberately not imported");
  });

  it("keeps incomplete item-name evidence explicit", () => {
    const converted = convertProfessionDbSnapshot({
      coreLua,
      acquireMethodsLua,
      recipeNamesLua,
      itemNamesLua: 'lib:LoadNames({ [4265]="Heavy Armor Kit" })',
      profession: { id: "leatherworking", name: "Leatherworking", skillLineId: 165 },
      professionDbVersion: "v1.9.1",
      itemDbVersion: "v1.3.0",
      sourceUrl: "https://example.invalid/source",
    });

    expect(converted.report.missingItemNames).toBe(2);
    expect(converted.dataset.professions[0]?.recipes[0]?.reagents[0]?.item.name).toBe(
      "Unknown item #2321",
    );
  });

  it("imports supported learning ranks and specialization gates", () => {
    const supportedCoreLua = coreLua
      .replace(
        '["requiredSkill"] = 150,',
        '["requiredSkill"] = 150,\n    ["requiredSpec"] = 10656,',
      )
      .replace('lib:LoadBorrowed("requiredSkill", "Vanilla", {3780})', "");
    const converted = convertProfessionDbSnapshot({
      coreLua: supportedCoreLua,
      recipeNamesLua,
      itemNamesLua,
      profession: { id: "leatherworking", name: "Leatherworking", skillLineId: 165 },
      professionDbVersion: "v1.9.1",
      itemDbVersion: "v1.3.0",
      sourceUrl: "https://example.invalid/source",
    });

    expect(converted.dataset.professions[0]?.recipes[0]?.metadata).toEqual({
      spellId: 3780,
      learnSkill: 150,
      acquisition: "unknown",
      faction: "unknown",
      specializationSpellId: 10656,
      cooldownSeconds: null,
      availability: "unknown",
    });
    expect(converted.report).toMatchObject({
      knownLearnSkillRecipes: 1,
      borrowedRequiredSkillRecipes: 0,
      automaticRecipes: 0,
      specializationRecipes: 1,
    });
  });
});
