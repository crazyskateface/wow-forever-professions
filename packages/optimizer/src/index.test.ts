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

describe("global route optimization", () => {
  it("rejects the cheapest individual craft when its skill-up chance makes the route costlier", () => {
    const cheapCraft: RouteRecipe = {
      ...changingChanceRecipe,
      id: "cheap-craft",
      name: "Cheap Craft",
      thresholds: { orange: 0, yellow: 0, green: 0, gray: 5 },
      reagents: [{ itemId: "scrap", quantity: 1, unitPriceCopper: 2 }],
    };
    const reliableCraft: RouteRecipe = {
      ...changingChanceRecipe,
      id: "reliable-craft",
      name: "Reliable Craft",
      thresholds: { orange: 4, yellow: 6, green: 7, gray: 8 },
      reagents: [{ itemId: "leather", quantity: 1, unitPriceCopper: 10 }],
    };

    const result = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 4,
      targetSkill: 5,
      objective: "cost",
      recipes: [cheapCraft, reliableCraft],
    });

    expect(result.status).toBe("complete");
    expect(result.steps[0]).toMatchObject({
      recipeId: "reliable-craft",
      expectedCostCopper: 10,
    });
  });

  it("changes recipes as probability changes and reconstructs contiguous ranges", () => {
    const earlyRecipe: RouteRecipe = {
      ...changingChanceRecipe,
      id: "early",
      name: "Early Recipe",
      thresholds: { orange: 1, yellow: 2, green: 4, gray: 6 },
      reagents: [{ itemId: "light-leather", quantity: 1 }],
    };
    const laterRecipe: RouteRecipe = {
      ...changingChanceRecipe,
      id: "later",
      name: "Later Recipe",
      learnSkill: 3,
      thresholds: { orange: 3, yellow: 6, green: 7, gray: 8 },
      reagents: [{ itemId: "medium-leather", quantity: 1 }],
    };

    const result = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 1,
      targetSkill: 5,
      objective: "crafts",
      recipes: [earlyRecipe, laterRecipe],
    });

    expect(result.status).toBe("complete");
    expect(result.steps.map(({ skill, recipeId }) => ({ skill, recipeId }))).toEqual([
      { skill: 1, recipeId: "early" },
      { skill: 2, recipeId: "early" },
      { skill: 3, recipeId: "later" },
      { skill: 4, recipeId: "later" },
    ]);
    expect(result.segments).toMatchObject([
      { recipeId: "early", startSkill: 1, endSkill: 3 },
      { recipeId: "later", startSkill: 3, endSkill: 5 },
    ]);
    expect(result.steps.at(-1)?.skill).toBe(4);
    expect(
      result.segments.every(
        (segment, index) =>
          index === 0 || result.segments[index - 1]?.endSkill === segment.startSkill,
      ),
    ).toBe(true);
  });

  it("never chooses gray or explicitly unavailable recipes", () => {
    const usable: RouteRecipe = {
      ...changingChanceRecipe,
      id: "usable",
      thresholds: { orange: 4, yellow: 6, green: 7, gray: 8 },
      reagents: [{ itemId: "leather", quantity: 10 }],
    };
    const gray: RouteRecipe = {
      ...changingChanceRecipe,
      id: "gray",
      thresholds: { orange: 0, yellow: 0, green: 0, gray: 4 },
      reagents: [{ itemId: "scrap", quantity: 1 }],
    };
    const unavailable: RouteRecipe = {
      ...usable,
      id: "unavailable",
      availability: "unavailable",
      reagents: [{ itemId: "scrap", quantity: 1 }],
    };

    const result = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 4,
      targetSkill: 5,
      objective: "materials",
      recipes: [gray, unavailable, usable],
    });

    expect(result.steps.map(({ recipeId }) => recipeId)).toEqual(["usable"]);
  });

  it("reconstructs the optimal prefix before a later coverage gap", () => {
    const shortRecipe: RouteRecipe = {
      ...changingChanceRecipe,
      id: "short",
      thresholds: { orange: 1, yellow: 2, green: 3, gray: 4 },
    };

    const result = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 1,
      targetSkill: 6,
      objective: "crafts",
      recipes: [shortRecipe],
    });

    expect(result).toMatchObject({
      status: "blocked",
      blockedAtSkill: 4,
      reason: "no-eligible-recipe",
      steps: [{ skill: 1 }, { skill: 2 }, { skill: 3 }],
      segments: [{ startSkill: 1, endSkill: 4 }],
    });
  });
});
