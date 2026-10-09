import { describe, expect, it } from "vitest";
import {
  optimizeLevelingRoute,
  type RouteRecipe,
} from "./index.js";

const changingChanceRecipe: RouteRecipe = {
  id: "changing-chance",
  name: "Changing Chance",
  professionId: "leatherworking",
  buildId: "1.60.1.69977",
  learnSkill: 1,
  availability: "available",
  acquisition: "trainer",
  faction: "both",
  specializationSpellId: null,
  cooldownSeconds: null,
  thresholds: { orange: 1, yellow: 2, green: 4, gray: 6 },
  reagents: [{ itemId: "cloth", quantity: 2, unitPriceCopper: 10 }],
};

const routeDataset = {
  professionId: "leatherworking",
  buildId: "1.60.1.69977",
} as const;

describe("leveling route optimizer", () => {
  it("recalculates expected crafts and cost at every skill", () => {
    const result = optimizeLevelingRoute({
      ...routeDataset,
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
      ...changingChanceRecipe,
      id: "fast",
      name: "Fast",
      thresholds: { orange: 1, yellow: 5, green: 6, gray: 7 },
      reagents: [{ itemId: "expensive", quantity: 1, unitPriceCopper: 100 }],
    };
    const cheap: RouteRecipe = {
      ...changingChanceRecipe,
      id: "cheap",
      name: "Cheap",
      acquisition: "vendor",
      thresholds: { orange: 0, yellow: 0, green: 1, gray: 2 },
      reagents: [{ itemId: "cheap", quantity: 1, unitPriceCopper: 10 }],
    };

    expect(
      optimizeLevelingRoute({
        ...routeDataset,
        startSkill: 1,
        targetSkill: 2,
        objective: "crafts",
        recipes: [fast, cheap],
      }).segments[0]?.recipeId,
    ).toBe("fast");
    expect(
      optimizeLevelingRoute({
        ...routeDataset,
        startSkill: 1,
        targetSkill: 2,
        objective: "cost",
        recipes: [fast, cheap],
      }).segments[0]?.recipeId,
    ).toBe("cheap");
  });

  it("can minimize material units even when that requires more crafts", () => {
    const fast: RouteRecipe = {
      ...changingChanceRecipe,
      id: "material-heavy",
      name: "Material Heavy",
      thresholds: { orange: 1, yellow: 5, green: 6, gray: 7 },
      reagents: [{ itemId: "cloth", quantity: 5 }],
    };
    const lean: RouteRecipe = {
      ...changingChanceRecipe,
      id: "material-lean",
      name: "Material Lean",
      thresholds: { orange: 0, yellow: 0, green: 1, gray: 2 },
      reagents: [{ itemId: "thread", quantity: 1 }],
    };

    const result = optimizeLevelingRoute({
      ...routeDataset,
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
      ...routeDataset,
      startSkill: 2,
      targetSkill: 3,
      objective: "cost",
      recipes,
      constraints: { trainerOnly: true, knownRecipeIds: ["changing-chance"] },
    });
    expect(trainerOnly.segments[0]?.recipeId).toBe("changing-chance");

    const excluded = optimizeLevelingRoute({
      ...routeDataset,
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
        ...routeDataset,
        startSkill: 2,
        targetSkill: 3,
        objective: "cost",
        recipes: [noPrice],
      }),
    ).toMatchObject({ status: "blocked", reason: "missing-price-data" });

    expect(
      optimizeLevelingRoute({
        ...routeDataset,
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

  it("excludes recipes that are unavailable, not yet learnable, or lack a learning rank", () => {
    const eligible: RouteRecipe = {
      ...changingChanceRecipe,
      id: "eligible",
    };
    const result = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 2,
      targetSkill: 3,
      objective: "crafts",
      recipes: [
        { ...changingChanceRecipe, id: "unavailable", availability: "unavailable" },
        { ...changingChanceRecipe, id: "later", learnSkill: 3 },
        { ...changingChanceRecipe, id: "unknown-rank", learnSkill: null },
        eligible,
      ],
    });

    expect(result.segments[0]?.recipeId).toBe("eligible");
  });

  it("honors faction, specialization, branch, cooldown, profession, and build eligibility", () => {
    const generic: RouteRecipe = {
      ...changingChanceRecipe,
      id: "generic",
      reagents: [{ itemId: "cloth", quantity: 2 }],
    };
    const restricted: RouteRecipe = {
      ...changingChanceRecipe,
      id: "restricted",
      faction: "horde",
      specializationSpellId: 10656,
      professionBranchId: "dragonscale",
      cooldownSeconds: 86_400,
      reagents: [{ itemId: "leather", quantity: 1 }],
    };
    const wrongDatasetRecipes: RouteRecipe[] = [
      { ...restricted, id: "wrong-profession", professionId: "alchemy" },
      { ...restricted, id: "wrong-build", buildId: "other-build" },
    ];

    expect(
      optimizeLevelingRoute({
        ...routeDataset,
        startSkill: 2,
        targetSkill: 3,
        objective: "materials",
        recipes: [generic, restricted, ...wrongDatasetRecipes],
      }).segments[0]?.recipeId,
    ).toBe("generic");

    expect(
      optimizeLevelingRoute({
        ...routeDataset,
        startSkill: 2,
        targetSkill: 3,
        objective: "materials",
        recipes: [generic, restricted, ...wrongDatasetRecipes],
        constraints: {
          faction: "horde",
          specializationSpellIds: [10656],
          professionBranchId: "dragonscale",
          allowCooldowns: true,
        },
      }).segments[0]?.recipeId,
    ).toBe("restricted");
  });

  it("returns an empty complete route when no skill gain is requested", () => {
    expect(
      optimizeLevelingRoute({
        ...routeDataset,
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
