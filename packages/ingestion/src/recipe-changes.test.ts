import type { ImportedBuildDataset, ImportedRecipe } from "@forever-professions/contracts";
import { describe, expect, it } from "vitest";
import { compareRecipeBuilds, normalizeBuildDataset } from "./index.js";

function recipe(
  id: string,
  spellId: number,
  name = id,
  overrides: Partial<ImportedRecipe> = {},
): ImportedRecipe {
  return {
    id,
    name,
    metadata: {
      spellId,
      learnSkill: 150,
      acquisition: "trainer",
      faction: "both",
      specializationSpellId: null,
      cooldownSeconds: null,
      availability: "available",
    },
    thresholds: { orange: 150, yellow: 170, green: 180, gray: 190 },
    reagents: [
      {
        item: { id: "heavy-leather", gameId: 4234, name: "Heavy Leather" },
        quantity: 5,
      },
    ],
    outputs: [
      {
        item: { id: `${id}-item`, name },
        minimumQuantity: 1,
        maximumQuantity: 1,
      },
    ],
    sourceId: "client",
    verification: { status: "verified" },
    ...overrides,
  };
}

function build(
  id: string,
  recipes: ImportedRecipe[],
  professionId = "leatherworking",
): ImportedBuildDataset {
  return {
    build: { id, version: id },
    sources: [{ id: "client", kind: "client-data", label: `Client ${id}` }],
    professions: [
      {
        id: professionId,
        slug: professionId,
        name: "Leatherworking",
        recipes,
      },
    ],
  };
}

describe("recipe build comparisons", () => {
  it("classifies logical recipes and omits unchanged records by default", () => {
    const base = normalizeBuildDataset(
      build("classic-era", [recipe("same", 1), recipe("removed", 2)]),
    );
    const target = normalizeBuildDataset(
      build("forever-current", [recipe("same", 1), recipe("new", 3)]),
    );

    const comparison = compareRecipeBuilds(base, target, {
      comparisonType: "CLASSIC_TO_FOREVER",
    });

    expect(comparison.summary).toEqual({
      new: 1,
      updated: 0,
      removed: 1,
      unchanged: 1,
      total: 3,
    });
    expect(comparison.changes.map(({ changeType, identity }) => [changeType, identity.spellId])).toEqual([
      ["REMOVED", 2],
      ["NEW", 3],
    ]);
    expect(comparison.professionSummaries[0]).toMatchObject({
      professionId: "leatherworking",
      new: 1,
      removed: 1,
      unchanged: 1,
    });
  });

  it("uses profession and spell ID as identity instead of name or internal recipe ID", () => {
    const base = normalizeBuildDataset(build("classic-era", [recipe("old-row-id", 3780, "Armor Kit")]));
    const target = normalizeBuildDataset(
      build("forever-current", [
        recipe("new-row-id", 3780, "Armor Kit", {
          outputs: [
            {
              item: { id: "old-row-id-item", name: "Armor Kit" },
              minimumQuantity: 1,
              maximumQuantity: 1,
            },
          ],
        }),
      ]),
    );

    const comparison = compareRecipeBuilds(base, target, {
      comparisonType: "CLASSIC_TO_FOREVER",
      includeUnchanged: true,
    });

    expect(comparison.changes).toHaveLength(1);
    expect(comparison.changes[0]).toMatchObject({
      changeType: "UNCHANGED",
      identity: { professionId: "leatherworking", spellId: 3780 },
      base: { recipeId: "old-row-id" },
      target: { recipeId: "new-row-id" },
    });
  });

  it("does not treat item classification enrichment as a gameplay recipe change", () => {
    const baseRecipe = recipe("armor-kit", 3780, "Heavy Armor Kit");
    const targetRecipe = recipe("armor-kit", 3780, "Heavy Armor Kit", {
      reagents: [
        {
          item: {
            id: "heavy-leather",
            gameId: 4234,
            name: "Heavy Leather",
            itemClassId: 7,
            itemSubClassId: 6,
            inventoryType: "0",
          },
          quantity: 5,
        },
      ],
      outputs: [
        {
          item: {
            id: "armor-kit-item",
            name: "Heavy Armor Kit",
            itemClassId: 0,
            itemSubClassId: 8,
            inventoryType: "0",
          },
          minimumQuantity: 1,
          maximumQuantity: 1,
        },
      ],
    });
    const comparison = compareRecipeBuilds(
      normalizeBuildDataset(build("classic-era", [baseRecipe])),
      normalizeBuildDataset(build("forever-current", [targetRecipe])),
      { comparisonType: "CLASSIC_TO_FOREVER", includeUnchanged: true },
    );

    expect(comparison.summary).toMatchObject({ updated: 0, unchanged: 1 });
    expect(comparison.changes[0]?.changeType).toBe("UNCHANGED");
    expect(comparison.changes[0]?.target?.outputs[0]).toMatchObject({
      itemClassId: 0,
      itemSubClassId: 8,
    });
  });

  it("does not present missing target evidence as a confirmed gameplay change", () => {
    const baseRecipe = recipe("armor-kit", 3780, "Heavy Armor Kit");
    const targetRecipe = recipe("armor-kit", 3780, "Heavy Armor Kit", {
      metadata: {
        spellId: 3780,
        learnSkill: null,
        borrowedLearnSkill: 150,
        acquisition: "unknown",
        sourceKinds: ["trainer"],
        sourceDataOrigin: "classic-borrowed",
        orangeSkillKnown: false,
        faction: "both",
        specializationSpellId: null,
        cooldownSeconds: null,
        availability: "unknown",
      },
      thresholds: { orange: 1, yellow: 170, green: 180, gray: 190 },
    });
    const comparison = compareRecipeBuilds(
      normalizeBuildDataset(build("classic-era", [baseRecipe])),
      normalizeBuildDataset(build("forever-current", [targetRecipe])),
      { comparisonType: "CLASSIC_TO_FOREVER", includeUnchanged: true },
    );

    expect(comparison.summary).toMatchObject({ updated: 0, unchanged: 1 });
    expect(comparison.changes[0]?.changedFields).toEqual({});
    expect(comparison.changes[0]?.target).toMatchObject({
      learnSkill: null,
      borrowedLearnSkill: 150,
      orangeSkillKnown: false,
    });
  });

  it("records deterministic field-level before and after values with provenance", () => {
    const baseRecipe = recipe("armor-kit", 3780, "Heavy Armor Kit");
    const targetRecipe = recipe("armor-kit-forever", 3780, "Heavy Armor Kit", {
      metadata: {
        spellId: 3780,
        learnSkill: 145,
        acquisition: "vendor",
        faction: "alliance",
        specializationSpellId: 10656,
        cooldownSeconds: 3_600,
        availability: "available",
      },
      thresholds: { orange: 145, yellow: 165, green: 175, gray: 185 },
      reagents: [
        {
          item: { id: "heavy-leather", gameId: 4234, name: "Heavy Leather" },
          quantity: 4,
        },
        {
          item: { id: "cured-heavy-hide", gameId: 4236, name: "Cured Heavy Hide" },
          quantity: 1,
        },
      ],
      outputs: [
        {
          item: { id: "forever-armor-kit", gameId: 99001, name: "Forever Armor Kit" },
          minimumQuantity: 1,
          maximumQuantity: 2,
        },
      ],
      provenanceNotes: "Observed on the Forever beta realm.",
    });
    const comparison = compareRecipeBuilds(
      normalizeBuildDataset(build("classic-era", [baseRecipe])),
      normalizeBuildDataset(build("forever-current", [targetRecipe])),
      { comparisonType: "CLASSIC_TO_FOREVER" },
    );
    const change = comparison.changes[0];

    expect(change?.changeType).toBe("UPDATED");
    expect(Object.keys(change?.changedFields ?? {})).toEqual([
      "reagents",
      "outputs",
      "orangeSkill",
      "yellowSkill",
      "greenSkill",
      "graySkill",
      "learnSkill",
      "acquisition",
      "faction",
      "specializationSpellId",
      "cooldownSeconds",
    ]);
    expect(change?.changedFields.reagents).toMatchObject({
      before: [{ itemId: "heavy-leather", quantity: 5 }],
      after: [
        { itemId: "cured-heavy-hide", quantity: 1 },
        { itemId: "heavy-leather", quantity: 4 },
      ],
    });
    expect(change?.changedFields.learnSkill).toEqual({ before: 150, after: 145 });
    expect(change?.target?.provenance).toMatchObject({
      source: "client-data",
      verificationStatus: "verified",
      notes: "Observed on the Forever beta realm.",
    });
    expect(JSON.parse(JSON.stringify(change?.changedFields))).toEqual(change?.changedFields);
  });

  it("sorts results deterministically and retains the requested build comparison mode", () => {
    const base = normalizeBuildDataset(build("1.60.1.70314", []));
    const target = normalizeBuildDataset(
      build("1.60.1.70361", [recipe("later", 200), recipe("earlier", 100)]),
    );

    const comparison = compareRecipeBuilds(base, target, {
      comparisonType: "FOREVER_BUILD_TO_BUILD",
    });

    expect(comparison.comparisonType).toBe("FOREVER_BUILD_TO_BUILD");
    expect(comparison.changes.map(({ identity }) => identity.spellId)).toEqual([100, 200]);
  });
});
