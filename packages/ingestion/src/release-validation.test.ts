import type { NormalizedBuild } from "@forever-professions/contracts";
import { describe, expect, it } from "vitest";
import {
  assertReleaseRowCounts,
  expectedReleaseRowCounts,
  persistedReleaseRowCounts,
} from "./release-validation.js";

function build(
  id: string,
  spellId: number,
  options: { readonly clientData?: boolean; readonly quality?: boolean } = {},
): NormalizedBuild {
  const item = {
    id: `item-${id}`,
    name: `Item ${id}`,
    ...(options.clientData
      ? {
          itemClassId: 7,
          itemSubClassId: 6,
          inventoryType: "INVTYPE_NON_EQUIP_IGNORE",
          clientData: {
            displayName: `Item ${id}`,
            ...(options.quality ? { qualityId: 2 } : {}),
            requiredLevel: 0,
            sellPriceCopper: 1,
            source: { product: "wow", build: id, locale: "enUS" },
          },
        }
      : {}),
  };
  return {
    build: { id, version: id },
    sources: [{ id: `source-${id}`, kind: "client-data", label: id }],
    professions: [{ id: "leatherworking", slug: "leatherworking", name: "Leatherworking" }],
    items: [item],
    recipes: [{ id: `recipe-${id}`, professionId: "leatherworking" }],
    recipeVersions: [
      { id: `recipe-${id}@${id}`, recipeId: `recipe-${id}`, buildId: id, name: `Recipe ${id}` },
    ],
    recipeMetadata: [
      {
        recipeVersionId: `recipe-${id}@${id}`,
        spellId,
        learnSkill: 1,
        acquisition: "trainer",
        faction: "both",
        specializationSpellId: null,
        cooldownSeconds: null,
        availability: "available",
      },
    ],
    reagents: [],
    outputs: [
      {
        recipeVersionId: `recipe-${id}@${id}`,
        itemId: item.id,
        minimumQuantity: 1,
        maximumQuantity: 1,
      },
    ],
    thresholds: [
      { recipeVersionId: `recipe-${id}@${id}`, orange: 1, yellow: 2, green: 3, gray: 4 },
    ],
    provenance: [
      {
        id: `recipe-${id}@${id}:provenance`,
        recipeVersionId: `recipe-${id}@${id}`,
        sourceId: `source-${id}`,
        verificationId: `recipe-${id}@${id}:verification`,
      },
    ],
    verifications: [
      { id: `recipe-${id}@${id}:verification`, status: "unverified" },
    ],
  };
}

describe("release row-count validation", () => {
  it("derives source and unchanged-inclusive comparison counts", () => {
    const base = build("base", 100);
    const target = build("target", 100, { clientData: true, quality: true });

    expect(
      expectedReleaseRowCounts(base, target, "CLASSIC_TO_FOREVER"),
    ).toEqual({
      baseRecipes: 1,
      targetRecipes: 1,
      recipeChanges: 1,
      targetClientItems: 1,
      targetQualityItems: 1,
    });
  });

  it("parses database counts and rejects incomplete persisted data", () => {
    const persisted = persistedReleaseRowCounts({
      base_recipes: "1",
      target_recipes: "1",
      recipe_changes: "0",
      target_client_items: "1",
      target_quality_items: "1",
    });

    expect(() =>
      assertReleaseRowCounts(
        {
          baseRecipes: 1,
          targetRecipes: 1,
          recipeChanges: 1,
          targetClientItems: 1,
          targetQualityItems: 1,
        },
        persisted,
      ),
    ).toThrow("recipeChanges: expected 1, found 0");
  });

  it("rejects invalid count values before certification", () => {
    expect(() =>
      persistedReleaseRowCounts({
        base_recipes: "not-a-count",
        target_recipes: 1,
        recipe_changes: 1,
        target_client_items: 1,
        target_quality_items: 1,
      }),
    ).toThrow("base_recipes");
  });
});
