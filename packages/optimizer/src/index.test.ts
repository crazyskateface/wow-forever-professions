import { describe, expect, it } from "vitest";
import {
  optimizeLevelingRoute,
  type RouteRecipe,
} from "./index.js";

const changingChanceRecipe: RouteRecipe = {
  id: "changing-chance",
  name: "Changing Chance",
  acquisition: "trainer",
  thresholds: { orange: 1, yellow: 2, green: 4, gray: 6 },
  reagents: [{ itemId: "cloth", quantity: 2, unitPriceCopper: 10 }],
};

describe("leveling route optimizer", () => {
  it("recalculates expected crafts and cost at every skill", () => {
    const result = optimizeLevelingRoute({
      startSkill: 2,
      targetSkill: 4,
      objective: "cost",
      recipes: [changingChanceRecipe],
    });

    expect(result.status).toBe("complete");
    expect(result.steps.map(({ skillUpProbability }) => skillUpProbability)).toEqual([
      1,
      0.75,
    ]);
    expect(result.totals.expectedCrafts).toBeCloseTo(1 + 1 / 0.75);
    expect(result.totals.expectedCostCopper).toBeCloseTo((1 + 1 / 0.75) * 20);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({ startSkill: 2, endSkill: 4 });
  });

  it("chooses different recipes for cost and craft-count objectives", () => {
    const fast: RouteRecipe = {
      id: "fast",
      name: "Fast",
      acquisition: "trainer",
      thresholds: { orange: 1, yellow: 5, green: 6, gray: 7 },
      reagents: [{ itemId: "expensive", quantity: 1, unitPriceCopper: 100 }],
    };
    const cheap: RouteRecipe = {
      id: "cheap",
      name: "Cheap",
      acquisition: "vendor",
      thresholds: { orange: 0, yellow: 0, green: 1, gray: 2 },
      reagents: [{ itemId: "cheap", quantity: 1, unitPriceCopper: 10 }],
    };

    expect(
      optimizeLevelingRoute({
        startSkill: 1,
        targetSkill: 2,
        objective: "crafts",
        recipes: [fast, cheap],
      }).segments[0]?.recipeId,
    ).toBe("fast");
    expect(
      optimizeLevelingRoute({
        startSkill: 1,
        targetSkill: 2,
        objective: "cost",
        recipes: [fast, cheap],
      }).segments[0]?.recipeId,
    ).toBe("cheap");
  });

  it("can minimize material units even when that requires more crafts", () => {
    const fast: RouteRecipe = {
      id: "material-heavy",
      name: "Material Heavy",
      acquisition: "trainer",
      thresholds: { orange: 1, yellow: 5, green: 6, gray: 7 },
      reagents: [{ itemId: "cloth", quantity: 5 }],
    };
    const lean: RouteRecipe = {
      id: "material-lean",
      name: "Material Lean",
      acquisition: "trainer",
      thresholds: { orange: 0, yellow: 0, green: 1, gray: 2 },
      reagents: [{ itemId: "thread", quantity: 1 }],
    };

    const result = optimizeLevelingRoute({
      startSkill: 1,
      targetSkill: 2,
      objective: "materials",
      recipes: [fast, lean],
    });
    expect(result.segments[0]?.recipeId).toBe("material-lean");
    expect(result.totals).toMatchObject({
      expectedCrafts: 2,
      expectedMaterials: 2,
    });
  });

  it("supports known-recipe, trainer-only, recipe, and reagent exclusions", () => {
    const recipes: RouteRecipe[] = [
      changingChanceRecipe,
      {
        ...changingChanceRecipe,
        id: "vendor-recipe",
        name: "Vendor Recipe",
        acquisition: "vendor",
        reagents: [{ itemId: "leather", quantity: 1, unitPriceCopper: 1 }],
      },
    ];

    const trainerOnly = optimizeLevelingRoute({
      startSkill: 2,
      targetSkill: 3,
      objective: "cost",
      recipes,
      constraints: { trainerOnly: true, knownRecipeIds: ["changing-chance"] },
    });
    expect(trainerOnly.segments[0]?.recipeId).toBe("changing-chance");

    const excluded = optimizeLevelingRoute({
      startSkill: 2,
      targetSkill: 3,
      objective: "cost",
      recipes,
      constraints: { excludedRecipeIds: ["vendor-recipe"], excludedItemIds: ["cloth"] },
    });
    expect(excluded).toMatchObject({
      status: "blocked",
      blockedAtSkill: 2,
      reason: "no-eligible-recipe",
    });
  });

  it("distinguishes a skill gap from missing cost data", () => {
    const noPrice: RouteRecipe = {
      ...changingChanceRecipe,
      id: "no-price",
      reagents: [{ itemId: "unknown", quantity: 1 }],
    };
    expect(
      optimizeLevelingRoute({
        startSkill: 2,
        targetSkill: 3,
        objective: "cost",
        recipes: [noPrice],
      }),
    ).toMatchObject({ status: "blocked", reason: "missing-price-data" });

    expect(
      optimizeLevelingRoute({
        startSkill: 7,
        targetSkill: 8,
        objective: "crafts",
        recipes: [changingChanceRecipe],
      }),
    ).toMatchObject({
      status: "blocked",
      blockedAtSkill: 7,
      reason: "no-eligible-recipe",
    });
  });

  it("returns an empty complete route when no skill gain is requested", () => {
    expect(
      optimizeLevelingRoute({
        startSkill: 100,
        targetSkill: 100,
        objective: "materials",
        recipes: [],
      }),
    ).toMatchObject({
      status: "complete",
      steps: [],
      segments: [],
      totals: {
        expectedSkillUps: 0,
        expectedCrafts: 0,
        expectedMaterials: 0,
        expectedCostCopper: 0,
      },
    });
  });
});
