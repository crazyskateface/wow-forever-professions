import { describe, expect, it } from "vitest";
import { FOREVER_BUILD_CONFIG } from "@forever-professions/domain";
import {
  optimizeLevelingRoute,
  resolveRoutePreset,
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
  provenanceSource: "observed-in-game",
  verificationStatus: "verified",
  faction: "both",
  specializationSpellId: null,
  cooldownSeconds: null,
  thresholds: { orange: 1, yellow: 2, green: 4, gray: 6 },
  reagents: [{ itemId: "cloth", quantity: 2, unitPriceCopper: 10 }],
};

const routeDataset = {
  professionId: "leatherworking",
  buildId: "1.60.1.69977",
  maxBaseSkill: FOREVER_BUILD_CONFIG.maxBaseSkill,
} as const;

describe("leveling route optimizer", () => {
  it("requires 100% recommendations and clips alternatives at the inclusive 75% boundary", () => {
    const guaranteed: RouteRecipe = { ...changingChanceRecipe, id: "guaranteed", thresholds: { orange: 1, yellow: 20, green: 25, gray: 30 }, reagents: [{ itemId: "cloth", quantity: 3 }] };
    const yellow: RouteRecipe = { ...guaranteed, id: "yellow", thresholds: { orange: 1, yellow: 1, green: 9, gray: 17 }, reagents: [{ itemId: "cloth", quantity: 1 }] };
    const low: RouteRecipe = { ...yellow, id: "too-low", thresholds: { orange: 1, yellow: 1, green: 8, gray: 17 } };
    const result = optimizeLevelingRoute({ ...routeDataset, startSkill: 5, targetSkill: 7, objective: "crafts", preset: "practical", recipes: [yellow, guaranteed, low] });
    expect(result.status).toBe("complete");
    expect(result.objective).toBe("materials");
    expect(result.steps.every(step => step.recipeId === "guaranteed" && step.skillUpProbability === 1)).toBe(true);
    expect(result.segments[0]?.alternatives).toMatchObject([{ recipeId: "yellow", startSkill: 5, endSkill: 6, expectedCrafts: 1 / 0.75 }]);
    expect(result.segments.flatMap(s => s.alternatives).some(a => a.recipeId === "too-low")).toBe(false);
  });

  it("stops before any sub-100% recommendation, including a yellow 75% craft", () => {
    const result = optimizeLevelingRoute({ ...routeDataset, startSkill: 1, targetSkill: 5, objective: "crafts", preset: "practical", recipes: [changingChanceRecipe] });
    expect(result).toMatchObject({ status: "blocked", blockedAtSkill: 3, reason: "no-guaranteed-skill-up" });
    expect(result.steps.map(step => [step.skill, step.skillUpProbability])).toEqual([[1, 1], [2, 1]]);
  });

  it("chooses the fewest material units without switch penalties overriding the minimum", () => {
    const costly: RouteRecipe = { ...changingChanceRecipe, id: "a-costly", thresholds: { orange: 1, yellow: 20, green: 25, gray: 30 }, reagents: [{ itemId: "cloth", quantity: 100, unitPriceCopper: 1 }] };
    const lean: RouteRecipe = { ...costly, id: "z-lean", learnSkill: 2, thresholds: { orange: 2, yellow: 20, green: 25, gray: 30 }, reagents: [{ itemId: "cloth", quantity: 99 }] };
    const result = optimizeLevelingRoute({ ...routeDataset, startSkill: 1, targetSkill: 4, objective: "crafts", preset: "practical", recipes: [costly, lean] });
    expect(result.steps.map(step => step.recipeId)).toEqual(["a-costly", "z-lean", "z-lean"]);
    expect(result.totals.expectedMaterials).toBe(298);
    expect(result.totals.expectedCostCopper).toBeUndefined();
  });

  it.each(["drop", "vendor", "quest", "reputation"] as const)("Practical prefers accessible guaranteed trainer recipes over %s patterns", acquisition => {
    const trainer: RouteRecipe = { ...changingChanceRecipe, id: "trainer", reagents: [{ itemId: "cloth", quantity: 10 }], thresholds: { orange: 1, yellow: 10, green: 15, gray: 20 } };
    const pattern: RouteRecipe = { ...trainer, id: "pattern", acquisition, reagents: [{ itemId: "cloth", quantity: 1 }] };
    const input = { ...routeDataset, startSkill: 2, targetSkill: 6, objective: "crafts" as const, recipes: [pattern, trainer] };
    const practical = optimizeLevelingRoute({ ...input, preset: "practical" });
    expect(practical.status).toBe("complete");
    expect(practical.steps.every(step => step.recipeId === "trainer")).toBe(true);
    expect(practical.totals.expectedCrafts).toBe(4);
    expect(practical.segments[0]?.recommendation.reasons).toContain("trainer-preference");
    expect(practical.segments[0]?.alternatives.find(a => a.recipeId === "pattern")?.lossReason).toBe("trainer-preference");
    expect(optimizeLevelingRoute({ ...input, preset: "fewest-crafts" }).steps.every(step => step.recipeId === "pattern")).toBe(true);
    expect(optimizeLevelingRoute({ ...input, preset: "practical", recipes: [trainer, pattern] })).toEqual(practical);
  });

  it("uses an external pattern only for the gap that trainer recipes cannot cover", () => {
    const trainer: RouteRecipe = { ...changingChanceRecipe, id: "trainer", thresholds: { orange: 1, yellow: 2, green: 2, gray: 3 } };
    const pattern: RouteRecipe = { ...changingChanceRecipe, id: "pattern", acquisition: "drop", thresholds: { orange: 1, yellow: 10, green: 15, gray: 20 } };
    const result = optimizeLevelingRoute({ ...routeDataset, startSkill: 1, targetSkill: 6, objective: "crafts", preset: "practical", recipes: [pattern, trainer] });
    expect(result.status).toBe("complete");
    expect(result.segments.map(s => [s.recipeId, s.startSkill, s.endSkill])).toEqual([["trainer", 1, 2], ["pattern", 2, 6]]);
    expect(result.segments[1]?.recommendation.reasons).toContain("trainer-fallback");
    expect(result.segments[1]?.evidence.acquisition).toBe("drop");
  });

  it("preserves Scarce avoidance and evidence priority ahead of trainer access", () => {
    const trainer: RouteRecipe = { ...changingChanceRecipe, id: "trainer", reagents: [{ itemId: "scarce", quantity: 1 }] };
    const pattern: RouteRecipe = { ...changingChanceRecipe, id: "pattern", acquisition: "drop" };
    const input = { ...routeDataset, startSkill: 1, targetSkill: 2, objective: "crafts" as const, preset: "practical" as const, recipes: [trainer, pattern] };
    expect(optimizeLevelingRoute({ ...input, scarceItemIds: ["scarce"] }).steps[0]?.recipeId).toBe("pattern");
    expect(optimizeLevelingRoute({ ...input, recipes: [{ ...trainer, availability: "unknown" }, pattern] }).steps[0]?.recipeId).toBe("pattern");
  });

  it.each([
    ["practical", "materials", "practical"],
    ["trainer-friendly", "crafts", "supported-only"],
    ["cheapest", "cost", "supported-only"],
    ["fewest-crafts", "crafts", "supported-only"],
    ["fewest-materials", "materials", "supported-only"],
    ["experimental", "crafts", "experimental"],
  ] as const)(
    "resolves the %s preset into a stable optimizer policy",
    (preset, objective, confidencePolicy) => {
      expect(resolveRoutePreset(preset)).toMatchObject({
        preset,
        objective,
        confidencePolicy,
      });
      expect(optimizeLevelingRoute({
        ...routeDataset,
        startSkill: 1,
        targetSkill: 2,
        objective: "materials",
        preset,
        recipes: [changingChanceRecipe],
      })).toMatchObject({
        status: "complete",
        preset,
        objective,
        confidencePolicy,
      });
    },
  );

  it("uses complete price evidence as a deterministic Practical tie-breaker", () => {
    const expensive: RouteRecipe = {
      ...changingChanceRecipe,
      id: "a-expensive",
      name: "Expensive",
      reagents: [{ itemId: "expensive", quantity: 2, unitPriceCopper: 100 }],
    };
    const affordable: RouteRecipe = {
      ...changingChanceRecipe,
      id: "z-affordable",
      name: "Affordable",
      reagents: [{ itemId: "affordable", quantity: 2, unitPriceCopper: 10 }],
    };

    expect(optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 1,
      targetSkill: 2,
      objective: "materials",
      preset: "practical",
      recipes: [expensive, affordable],
    }).segments[0]?.recipeId).toBe("z-affordable");
  });

  it("rejects a normal leveling target above the configured base skill cap", () => {
    expect(() =>
      optimizeLevelingRoute({
        ...routeDataset,
        startSkill: 299,
        targetSkill: FOREVER_BUILD_CONFIG.maxBaseSkill + 1,
        objective: "crafts",
        recipes: [changingChanceRecipe],
      }),
    ).toThrow(/base profession cap/);
  });

  it("keeps recipes with above-cap fade thresholds usable below the cap", () => {
    const result = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 299,
      targetSkill: FOREVER_BUILD_CONFIG.maxBaseSkill,
      objective: "crafts",
      recipes: [{
        ...changingChanceRecipe,
        learnSkill: 280,
        thresholds: { orange: 280, yellow: 300, green: 320, gray: 340 },
      }],
    });

    expect(result).toMatchObject({
      status: "complete",
      steps: [{ skill: 299, skillUpProbability: 1 }],
      targetSkill: FOREVER_BUILD_CONFIG.maxBaseSkill,
    });
  });

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

  it("returns ranked alternatives with the exact sub-range each recipe can cover", () => {
    const primary: RouteRecipe = {
      ...changingChanceRecipe,
      id: "a-primary",
      name: "Primary",
      thresholds: { orange: 1, yellow: 5, green: 6, gray: 7 },
      reagents: [{ itemId: "leather", quantity: 4 }],
    };
    const laterConversion: RouteRecipe = {
      ...primary,
      id: "b-conversion",
      name: "Later Conversion",
      learnSkill: 2,
      acquisition: "vendor",
      thresholds: { orange: 2, yellow: 5, green: 6, gray: 7 },
      reagents: [{ itemId: "scraps", quantity: 1 }],
    };

    const result = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 1,
      targetSkill: 4,
      objective: "crafts",
      recipes: [primary, laterConversion],
    });

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]?.alternatives).toMatchObject([
      {
        recipeId: "b-conversion",
        startSkill: 2,
        endSkill: 4,
        expectedSkillUps: 2,
        expectedCrafts: 2,
        expectedMaterials: 2,
        lossReason: "shorter-coverage",
        lossSummary: expect.any(String),
      },
    ]);
    expect(result.segments[0]?.recommendation).toMatchObject({
      reasons: ["trainer-preference"],
      summary: expect.any(String),
    });
  });

  it("makes trainer preference and experimental evidence risk explicit", () => {
    const vendor: RouteRecipe = {
      ...changingChanceRecipe,
      id: "a-vendor",
      name: "Vendor Option",
      acquisition: "vendor",
    };
    const trainer: RouteRecipe = {
      ...changingChanceRecipe,
      id: "z-trainer",
      name: "Trainer Option",
    };
    const trainerRoute = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 1,
      targetSkill: 2,
      objective: "materials",
      preset: "trainer-friendly",
      recipes: [vendor, trainer],
    });
    expect(trainerRoute.segments[0]).toMatchObject({
      recipeId: "z-trainer",
      recommendation: { reasons: ["trainer-preference"] },
    });
    expect(trainerRoute.segments[0]?.alternatives[0]).toMatchObject({
      recipeId: "a-vendor",
      lossReason: "trainer-preference",
    });

    const unknown: RouteRecipe = {
      ...trainer,
      id: "a-unknown",
      name: "Unknown Option",
      acquisition: "unknown",
      availability: "unknown",
    };
    const experimental = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 1,
      targetSkill: 2,
      objective: "materials",
      preset: "experimental",
      recipes: [unknown, trainer],
    });
    expect(experimental.segments[0]).toMatchObject({
      recipeId: "a-unknown",
      evidence: { level: "unknown" },
      recommendation: {
        reasons: ["experimental-evidence-accepted"],
      },
    });
  });

  it("treats scarce reagents as a last resort and omits them from ordinary alternatives", () => {
    const primary: RouteRecipe = {
      ...changingChanceRecipe,
      id: "a-primary",
      name: "Primary",
      thresholds: { orange: 1, yellow: 5, green: 6, gray: 7 },
      reagents: [{ itemId: "ordinary-leather", quantity: 100 }],
    };
    const scarce: RouteRecipe = {
      ...primary,
      id: "b-scarce",
      name: "Scarce",
      reagents: [{ itemId: "pristine-leather", quantity: 1 }],
    };
    const ordinaryAlternative: RouteRecipe = {
      ...primary,
      id: "c-ordinary-alternative",
      name: "Ordinary Alternative",
      reagents: [{ itemId: "ordinary-hide", quantity: 2 }],
    };

    const avoidable = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 1,
      targetSkill: 2,
      objective: "materials",
      recipes: [primary, scarce, ordinaryAlternative],
      scarceItemIds: ["pristine-leather"],
    });
    expect(avoidable.segments[0]?.recipeId).toBe("c-ordinary-alternative");
    expect(
      avoidable.segments[0]?.alternatives.map(({ recipeId }) => recipeId),
    ).not.toContain("b-scarce");

    const necessary = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 1,
      targetSkill: 2,
      objective: "materials",
      recipes: [scarce],
      scarceItemIds: ["pristine-leather"],
    });
    expect(necessary).toMatchObject({
      status: "complete",
      segments: [{ recipeId: "b-scarce" }],
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
    const missingPrice = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 2,
      targetSkill: 3,
      objective: "cost",
      recipes: [noPrice],
    });
    expect(missingPrice).toMatchObject({
      status: "blocked",
      reason: "missing-price-data",
    });
    expect(missingPrice.totals.expectedCostCopper).toBeUndefined();

    expect(
      optimizeLevelingRoute({
        ...routeDataset,
        startSkill: 2,
        targetSkill: 3,
        objective: "crafts",
        preset: "cheapest",
        recipes: [
          noPrice,
          {
            ...noPrice,
            id: "unknown-evidence",
            acquisition: "unknown",
            availability: "unknown",
          },
        ],
      }),
    ).toMatchObject({
      status: "blocked",
      reason: "missing-price-data",
      explanation: expect.stringContaining("Missing prices were not treated as zero"),
    });

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

describe("human-friendly route policy", () => {
  it("keeps the current recipe when a switch saves less than the configured threshold", () => {
    const steady: RouteRecipe = {
      ...changingChanceRecipe,
      id: "steady",
      name: "Steady Recipe",
      thresholds: { orange: 1, yellow: 5, green: 6, gray: 7 },
      reagents: [{ itemId: "leather", quantity: 100 }],
    };
    const slightlyCheaper: RouteRecipe = {
      ...steady,
      id: "slightly-cheaper",
      name: "Slightly Cheaper Recipe",
      learnSkill: 2,
      thresholds: { orange: 2, yellow: 5, green: 6, gray: 7 },
      reagents: [{ itemId: "leather", quantity: 95 }],
    };

    const stable = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 1,
      targetSkill: 3,
      objective: "materials",
      recipes: [steady, slightlyCheaper],
    });
    const noResistance = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 1,
      targetSkill: 3,
      objective: "materials",
      recipes: [steady, slightlyCheaper],
      policy: { switchPenaltyRatio: 0 },
    });

    expect(stable.steps.map(({ recipeId }) => recipeId)).toEqual([
      "steady",
      "steady",
    ]);
    expect(stable.segments).toHaveLength(1);
    expect(noResistance.steps.map(({ recipeId }) => recipeId)).toEqual([
      "steady",
      "slightly-cheaper",
    ]);
    expect(noResistance.segments).toHaveLength(2);
  });

  it("still switches when the route savings exceed the stability penalty", () => {
    const steady: RouteRecipe = {
      ...changingChanceRecipe,
      id: "steady",
      thresholds: { orange: 1, yellow: 5, green: 6, gray: 7 },
      reagents: [{ itemId: "leather", quantity: 100 }],
    };
    const meaningfullyCheaper: RouteRecipe = {
      ...steady,
      id: "meaningfully-cheaper",
      learnSkill: 2,
      thresholds: { orange: 2, yellow: 5, green: 6, gray: 7 },
      reagents: [{ itemId: "leather", quantity: 80 }],
    };

    const result = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 1,
      targetSkill: 3,
      objective: "materials",
      recipes: [steady, meaningfullyCheaper],
    });

    expect(result.steps.map(({ recipeId }) => recipeId)).toEqual([
      "steady",
      "meaningfully-cheaper",
    ]);
  });

  it("applies configurable recipe-source acquisition friction", () => {
    const trainerRecipe: RouteRecipe = {
      ...changingChanceRecipe,
      id: "trainer-recipe",
      reagents: [{ itemId: "leather", quantity: 100 }],
    };
    const dropRecipe: RouteRecipe = {
      ...trainerRecipe,
      id: "drop-recipe",
      acquisition: "drop",
      reagents: [{ itemId: "leather", quantity: 90 }],
    };

    const practical = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 2,
      targetSkill: 3,
      objective: "materials",
      recipes: [trainerRecipe, dropRecipe],
    });
    const ignoreAcquisition = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 2,
      targetSkill: 3,
      objective: "materials",
      recipes: [trainerRecipe, dropRecipe],
      policy: { acquisitionPenaltyRatios: { drop: 0 } },
    });

    expect(practical.steps[0]?.recipeId).toBe("trainer-recipe");
    expect(ignoreAcquisition.steps[0]?.recipeId).toBe("drop-recipe");
  });

  it("uses unknown acquisition or availability only when a supported route is unavailable", () => {
    const supported: RouteRecipe = {
      ...changingChanceRecipe,
      id: "supported",
      reagents: [{ itemId: "leather", quantity: 100 }],
    };
    const unknown: RouteRecipe = {
      ...supported,
      id: "unknown",
      acquisition: "unknown",
      availability: "unknown",
      provenanceSource: "client-data",
      verificationStatus: "unverified",
      reagents: [{ itemId: "leather", quantity: 1 }],
    };

    const supportedRoute = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 2,
      targetSkill: 3,
      objective: "materials",
      recipes: [unknown, supported],
    });
    expect(supportedRoute).toMatchObject({
      status: "complete",
      confidencePolicy: "practical",
      segments: [{
        recipeId: "supported",
        evidence: {
          level: "verified",
          reasons: [],
          acquisition: "trainer",
          availability: "available",
        },
      }],
    });

    const fallbackRoute = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 2,
      targetSkill: 3,
      objective: "materials",
      preset: "practical",
      recipes: [{ ...unknown, provenanceSource: "classic-fallback" }],
    });
    expect(fallbackRoute).toMatchObject({
      status: "complete",
      confidencePolicy: "practical",
      segments: [{
        recipeId: "unknown",
        evidence: {
          level: "unknown",
          reasons: [
            "unknown-acquisition",
            "unknown-availability",
            "classic-fallback",
          ],
        },
        recommendation: {
          reasons: ["practical-evidence-fallback"],
        },
      }],
    });
  });

  it("blocks supported-only routes instead of relaxing unknown evidence", () => {
    const result = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 2,
      targetSkill: 3,
      objective: "materials",
      confidencePolicy: "supported-only",
      recipes: [{
        ...changingChanceRecipe,
        acquisition: "unknown",
        availability: "unknown",
      }],
    });

    expect(result).toMatchObject({
      status: "blocked",
      confidencePolicy: "supported-only",
      blockedAtSkill: 2,
      reason: "unsupported-recipe-evidence",
      explanation: expect.stringContaining("supported acquisition or availability"),
      steps: [],
      segments: [],
    });
  });

  it("never routes through rejected recipe evidence", () => {
    const result = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 2,
      targetSkill: 3,
      objective: "materials",
      recipes: [{
        ...changingChanceRecipe,
        verificationStatus: "rejected",
      }],
    });

    expect(result).toMatchObject({
      status: "blocked",
      blockedAtSkill: 2,
      reason: "no-eligible-recipe",
    });
  });

  it("accounts for specialization and cooldown friction when they are allowed", () => {
    const generic: RouteRecipe = {
      ...changingChanceRecipe,
      id: "generic",
      reagents: [{ itemId: "leather", quantity: 100 }],
    };
    const gated: RouteRecipe = {
      ...generic,
      id: "gated",
      specializationSpellId: 10656,
      cooldownSeconds: 86_400,
      reagents: [{ itemId: "leather", quantity: 80 }],
    };
    const constraints = {
      specializationSpellIds: [10656],
      allowCooldowns: true,
    } as const;

    const practical = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 2,
      targetSkill: 3,
      objective: "materials",
      recipes: [generic, gated],
      constraints,
    });
    const ignoreGatingFriction = optimizeLevelingRoute({
      ...routeDataset,
      startSkill: 2,
      targetSkill: 3,
      objective: "materials",
      recipes: [generic, gated],
      constraints,
      policy: { specializationPenaltyRatio: 0, cooldownPenaltyRatio: 0 },
    });

    expect(practical.steps[0]?.recipeId).toBe("generic");
    expect(ignoreGatingFriction.steps[0]?.recipeId).toBe("gated");
  });

  it("rejects invalid penalty ratios", () => {
    expect(() =>
      optimizeLevelingRoute({
        ...routeDataset,
        startSkill: 1,
        targetSkill: 2,
        objective: "crafts",
        recipes: [changingChanceRecipe],
        policy: { switchPenaltyRatio: 1.01 },
      }),
    ).toThrow("switchPenaltyRatio");
  });
});
