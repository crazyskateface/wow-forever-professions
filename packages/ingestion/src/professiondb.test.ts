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

const recipeItemsLua = `lib:LoadRecipeItems({ [3780] = 9999 })`;

const borrowedSourcesLua = `
lib:LoadSources({ [3780] = { t = { 1234 } } })
lib:LoadBorrowed("sources", "Vanilla", {3780})
`;

const borrowedHiddenRecipesLua = `
lib:LoadHiddenRecipes({ [3780] = true })
lib:LoadBorrowed("hidden", "Vanilla", {3780})
`;

const itemCoreLua = `
lib:LoadCore(7, {
  [2321]="1\\0310\\031INVTYPE_NON_EQUIP_IGNORE\\03120\\031",
  [4234]="1\\0310\\031INVTYPE_NON_EQUIP_IGNORE\\03120\\031",
  [4265]="1\\0310\\031INVTYPE_NON_EQUIP_IGNORE\\03120\\031",
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
  it("keeps spells without crafted items without treating teaching items as outputs", () => {
    const converted = convertProfessionDbSnapshot({
      coreLua: coreLua.replace('["craftedItemId"] = 4265,', '["itemId"] = 9999,'),
      recipeNamesLua,
      itemNamesLua,
      recipeItemsLua,
      profession: { id: "enchanting", name: "Enchanting", skillLineId: 165 },
      professionDbVersion: "v1.9.1", itemDbVersion: "v1.6.0",
      sourceUrl: "https://example.com/source",
    });
    expect(converted.dataset.professions[0]!.recipes[0]).toMatchObject({ outputs: [], metadata: { teachingItemId: 9999 } });
    expect(converted.report.provisionalOutputQuantityRecipes).toBe(0);
  });
  it("converts client-backed recipe records and reports borrowed omissions", () => {
    const converted = convertProfessionDbSnapshot({
      coreLua,
      acquireMethodsLua,
      recipeItemsLua,
      sourcesLua: borrowedSourcesLua,
      hiddenRecipesLua: borrowedHiddenRecipesLua,
      recipeNamesLua,
      itemNamesLua,
      itemCoreLua: [itemCoreLua],
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
      teachingItemRecipes: 1,
      sourceKindRecipes: 1,
      borrowedSourceRecipes: 1,
      hiddenRecipeRecords: 1,
      classifiedItems: 3,
      specializationRecipes: 0,
      provisionalOutputQuantityRecipes: 1,
    });
    expect(converted.dataset.professions[0]?.recipes[0]).toMatchObject({
      id: "spell-3780",
      name: "Heavy Armor Kit",
      metadata: {
        spellId: 3780,
        learnSkill: null,
        borrowedLearnSkill: 150,
        acquisition: "automatic",
        teachingItemId: 9999,
        sourceKinds: ["trainer"],
        sourceDataOrigin: "classic-borrowed",
        hiddenStatus: true,
        hiddenDataOrigin: "classic-borrowed",
        orangeSkillKnown: false,
        faction: "unknown",
        specializationSpellId: null,
        cooldownSeconds: null,
        availability: "available",
      },
      thresholds: { orange: 1, yellow: 73, green: 145, gray: 165 },
      reagents: [
        {
          item: {
            gameId: 2321,
            name: "Fine Thread",
            itemClassId: 7,
            itemSubClassId: 0,
            inventoryType: "INVTYPE_NON_EQUIP_IGNORE",
          },
          quantity: 1,
        },
        {
          item: {
            gameId: 4234,
            name: "Heavy Leather",
            itemClassId: 7,
            itemSubClassId: 0,
            inventoryType: "INVTYPE_NON_EQUIP_IGNORE",
          },
          quantity: 5,
        },
      ],
      outputs: [
        { item: { gameId: 4265, name: "Heavy Armor Kit" }, minimumQuantity: 1 },
      ],
      verification: { status: "unverified" },
    });
    expect(
      converted.dataset.professions[0]?.recipes[0]?.provenanceNotes,
    ).toContain("borrowed from Vanilla and retained only as an unconfirmed fallback");
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

  it("uses canonical item names to keep shared item identities immutable", () => {
    const converted = convertProfessionDbSnapshot({
      coreLua,
      acquireMethodsLua,
      recipeNamesLua,
      itemNamesLua: 'lib:LoadNames({ [4265]="Heavy Armor Kit" })',
      profession: { id: "leatherworking", name: "Leatherworking", skillLineId: 165 },
      professionDbVersion: "v1.9.1",
      itemDbVersion: "v1.3.0",
      sourceUrl: "https://example.invalid/source",
      canonicalItemNames: new Map([
        [2321, "Fine Thread"],
        [4234, "Heavy Leather"],
      ]),
    });

    expect(converted.report.missingItemNames).toBe(0);
    expect(converted.dataset.professions[0]?.recipes[0]?.reagents).toMatchObject([
      { item: { gameId: 2321, name: "Fine Thread" } },
      { item: { gameId: 4234, name: "Heavy Leather" } },
    ]);
  });

  it("labels Vanilla snapshots as a Classic Era fallback", () => {
    const converted = convertProfessionDbSnapshot({
      coreLua: coreLua.replace("1.60.1.69977", "1.15.9.69722"),
      acquireMethodsLua,
      recipeNamesLua,
      itemNamesLua,
      profession: { id: "leatherworking", name: "Leatherworking", skillLineId: 165 },
      professionDbVersion: "v1.9.1",
      itemDbVersion: "v1.3.0",
      sourceUrl: "https://www.curseforge.com/wow/addons/libprofessiondb/files/9095167",
      gameVersion: "Vanilla",
    });

    expect(converted.dataset.build.id).toBe("1.15.9.69722");
    expect(converted.dataset.sources[0]).toMatchObject({
      id: "professiondb-v1.9.1-classic-era-1.15.9.69722",
      kind: "classic-fallback",
      label: "LibProfessionDB v1.9.1 + LibItemDB v1.3.0 (Classic Era)",
    });
    expect(converted.dataset.professions[0]?.recipes[0]?.provenanceNotes).toContain(
      "Classic Era client data",
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
      borrowedLearnSkill: null,
      acquisition: "unknown",
      teachingItemId: null,
      sourceKinds: [],
      sourceDataOrigin: "unknown",
      hiddenStatus: null,
      hiddenDataOrigin: "unknown",
      orangeSkillKnown: true,
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

  it("uses Forever source evidence without promoting borrowed source evidence", () => {
    const supportedCoreLua = coreLua.replace(
      'lib:LoadBorrowed("requiredSkill", "Vanilla", {3780})',
      "",
    );
    const converted = convertProfessionDbSnapshot({
      coreLua: supportedCoreLua,
      sourcesLua: 'lib:LoadSources({ [3780] = { t = { 1234 } } })',
      recipeNamesLua,
      itemNamesLua,
      profession: { id: "leatherworking", name: "Leatherworking", skillLineId: 165 },
      professionDbVersion: "v1.9.1",
      itemDbVersion: "v1.4.1",
      sourceUrl: "https://example.invalid/source",
    });

    expect(converted.dataset.professions[0]?.recipes[0]?.metadata).toMatchObject({
      acquisition: "trainer",
      availability: "available",
      sourceKinds: ["trainer"],
      sourceDataOrigin: "forever",
    });
  });
});
