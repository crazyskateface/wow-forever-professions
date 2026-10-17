import { describe, expect, it } from "vitest";
import { leatherworkingFixture } from "@forever-professions/fixtures";
import { FOREVER_BUILD_CONFIG } from "@forever-professions/domain";
import {
  getScarceLevelingReagentItemIds,
  optimizeFixtureRoute,
} from "./optimize-route.js";

describe("leveling route application policy", () => {
  const scarceClassification = {
    id: 14483,
    label: "Scarce",
    color: -7885825,
    source: {
      product: "wow_classic_beta",
      build: "1.60.1.70374",
      locale: "enUS",
    },
  } as const;

  it("rejects route targets above the current base profession cap", async () => {
    await expect(
      optimizeFixtureRoute(
        {
          professionId: leatherworkingFixture.id,
          startSkill: FOREVER_BUILD_CONFIG.maxBaseSkill,
          targetSkill: FOREVER_BUILD_CONFIG.maxBaseSkill + 1,
          objective: "crafts",
        },
        leatherworkingFixture,
      ),
    ).rejects.toThrow(/base profession cap/);
  });

  it("uses imported client classification and avoids scarce reagents when possible", async () => {
    const baseRecipe = leatherworkingFixture.recipes[0]!;
    const pristineRecipe = {
      ...baseRecipe,
      id: "pristine-recipe",
      name: "Pristine Recipe",
      reagents: [
        {
          itemId: "item-249427",
          gameItemId: 249427,
          name: "Rarely Gathered Leather",
          classification: scarceClassification,
          quantity: 1,
        },
      ],
    };
    const ordinaryRecipe = {
      ...baseRecipe,
      id: "ordinary-recipe",
      name: "Ordinary Recipe",
      reagents: [
        {
          itemId: "heavy-leather",
          gameItemId: 4234,
          name: "Heavy Leather",
          quantity: 20,
        },
      ],
    };
    const profession = {
      ...leatherworkingFixture,
      recipes: [pristineRecipe, ordinaryRecipe],
    };

    expect(getScarceLevelingReagentItemIds(profession)).toEqual([
      "item-249427",
    ]);

    const response = await optimizeFixtureRoute(
      {
        professionId: profession.id,
        startSkill: 150,
        targetSkill: 151,
        objective: "materials",
      },
      profession,
    );

    expect(response.result).toMatchObject({
      status: "complete",
      segments: [{ recipeId: "ordinary-recipe" }],
    });
  });

  it("does not infer scarcity from a hardcoded item name", () => {
    const baseRecipe = leatherworkingFixture.recipes[0]!;
    const profession = {
      ...leatherworkingFixture,
      recipes: [{
        ...baseRecipe,
        reagents: [{
          itemId: "item-249427",
          gameItemId: 249427,
          name: "Pristine Leather",
          quantity: 1,
        }],
      }],
    };

    expect(getScarceLevelingReagentItemIds(profession)).toEqual([]);
  });

  it("still uses a pristine-family recipe when it is the only eligible option", async () => {
    const baseRecipe = leatherworkingFixture.recipes[0]!;
    const profession = {
      ...leatherworkingFixture,
      recipes: [
        {
          ...baseRecipe,
          id: "pristine-recipe",
          name: "Pristine Recipe",
          reagents: [
            {
              itemId: "item-249429",
              gameItemId: 249429,
              name: "Pristine Scale",
              classification: scarceClassification,
              quantity: 2,
            },
          ],
        },
      ],
    };

    const response = await optimizeFixtureRoute(
      {
        professionId: profession.id,
        startSkill: 150,
        targetSkill: 151,
        objective: "materials",
      },
      profession,
    );

    expect(response.result).toMatchObject({
      status: "complete",
      segments: [{ recipeId: "pristine-recipe" }],
    });
  });
});
