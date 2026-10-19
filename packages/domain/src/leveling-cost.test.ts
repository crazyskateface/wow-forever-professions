import { describe, expect, it } from "vitest";
import {
  evaluateRecipeAtSkill,
  evaluateRecipeRange,
  type LevelingRecipe,
  type RecipeEvaluationContext,
} from "./index.js";

const recipe: LevelingRecipe = {
  id: "heavy-armor-kit",
  professionId: "leatherworking",
  buildId: "1.60.1.69977",
  learnSkill: 150,
  acquisition: "trainer",
  faction: "both",
  specializationSpellId: null,
  cooldownSeconds: null,
  availability: "available",
  thresholds: { orange: 150, yellow: 170, green: 180, gray: 190 },
  reagents: [
    { itemId: "heavy-leather", quantity: 5, unitPriceCopper: 20 },
    { itemId: "fine-thread", quantity: 1, unitPriceCopper: 5 },
  ],
};

const context: RecipeEvaluationContext = {
  professionId: "leatherworking",
  buildId: "1.60.1.69977",
  skill: 150,
};

describe("per-skill leveling cost", () => {
  it("calculates probability, crafts, reagent usage, and copper cost", () => {
    expect(evaluateRecipeAtSkill(recipe, context)).toEqual({
      status: "eligible",
      recipeId: "heavy-armor-kit",
      skill: 150,
      difficulty: "orange",
      skillUpProbability: 1,
      expectedCrafts: 1,
      materialsPerCraft: 6,
      expectedMaterials: 6,
      expectedReagents: [
        {
          itemId: "fine-thread",
          quantityPerCraft: 1,
          expectedQuantity: 1,
          unitPriceCopper: 5,
          expectedCostCopper: 5,
        },
        {
          itemId: "heavy-leather",
          quantityPerCraft: 5,
          expectedQuantity: 5,
          unitPriceCopper: 20,
          expectedCostCopper: 100,
        },
      ],
      missingPriceItemIds: [],
      craftCostCopper: 105,
      expectedCostCopper: 105,
    });
  });

  it("keeps missing prices explicit without making a usable recipe ineligible", () => {
    const result = evaluateRecipeAtSkill(
      {
        ...recipe,
        reagents: [
          { itemId: "heavy-leather", quantity: 5, unitPriceCopper: 20 },
          { itemId: "fine-thread", quantity: 1 },
        ],
      },
      context,
    );

    expect(result).toMatchObject({
      status: "eligible",
      missingPriceItemIds: ["fine-thread"],
    });
    expect(result).not.toHaveProperty("craftCostCopper");
    expect(result).not.toHaveProperty("expectedCostCopper");
  });
});

describe("recipe eligibility", () => {
  it("reports data, player, source, and exclusion constraints together", () => {
    const result = evaluateRecipeAtSkill(
      {
        ...recipe,
        professionId: "alchemy",
        buildId: "other-build",
        learnSkill: 175,
        availability: "unavailable",
        faction: "alliance",
        specializationSpellId: 10656,
        professionBranchId: "dragonscale",
        cooldownSeconds: 86_400,
        acquisition: "drop",
      },
      {
        ...context,
        faction: "horde",
        specializationSpellIds: [10658],
        professionBranchId: "tribal",
        knownRecipeIds: [],
        trainerOnly: true,
        excludedRecipeIds: [recipe.id],
        excludedItemIds: ["heavy-leather"],
      },
    );

    expect(result).toEqual({
      status: "ineligible",
      recipeId: recipe.id,
      skill: 150,
      reasons: [
        "profession-mismatch",
        "build-mismatch",
        "unavailable",
        "skill-too-low",
        "faction-mismatch",
        "specialization-required",
        "profession-branch-mismatch",
        "cooldown-disallowed",
        "recipe-not-known",
        "non-trainer-recipe",
        "recipe-excluded",
        "reagent-excluded",
      ],
    });
  });

  it("supports explicit strictness for unknown acquisition, availability, and faction", () => {
    expect(
      evaluateRecipeAtSkill(
        {
          ...recipe,
          acquisition: "unknown",
          availability: "unknown",
          faction: "unknown",
        },
        context,
      ).status,
    ).toBe("eligible");
    expect(
      evaluateRecipeAtSkill(
        {
          ...recipe,
          acquisition: "unknown",
          availability: "unknown",
          faction: "unknown",
        },
        {
          ...context,
          allowUnknownAcquisition: false,
          allowUnknownAvailability: false,
          allowUnknownFaction: false,
        },
      ),
    ).toMatchObject({
      status: "ineligible",
      reasons: [
        "unknown-acquisition",
        "unknown-availability",
        "unknown-faction",
      ],
    });
  });

  it("permits matching faction, specialization, branch, and cooldown inputs", () => {
    expect(
      evaluateRecipeAtSkill(
        {
          ...recipe,
          faction: "horde",
          specializationSpellId: 10656,
          professionBranchId: "dragonscale",
          cooldownSeconds: 86_400,
        },
        {
          ...context,
          faction: "horde",
          specializationSpellIds: [10656],
          professionBranchId: "dragonscale",
          allowCooldowns: true,
        },
      ).status,
    ).toBe("eligible");
  });

  it("separates unknown learning ranks, early use, and gray recipes", () => {
    expect(
      evaluateRecipeAtSkill({ ...recipe, learnSkill: null }, context),
    ).toMatchObject({ reasons: ["unknown-learn-skill"] });
    expect(
      evaluateRecipeAtSkill({ ...recipe, learnSkill: 151 }, context),
    ).toMatchObject({ reasons: ["skill-too-low"] });
    expect(
      evaluateRecipeAtSkill(recipe, { ...context, skill: 190 }),
    ).toMatchObject({ reasons: ["no-skill-up"] });
  });
});

describe("recipe range evaluation", () => {
  it("recalculates probability and usage at every skill point", () => {
    const result = evaluateRecipeRange({
      recipe,
      professionId: context.professionId,
      buildId: context.buildId,
      startSkill: 175,
      targetSkill: 182,
    });

    expect(result.status).toBe("complete");
    expect(
      result.evaluations.map((evaluation) =>
        evaluation.status === "eligible" ? evaluation.skillUpProbability : 0,
      ),
    ).toEqual([0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45]);
    const expectedCrafts = [0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45].reduce(
      (total, probability) => total + 1 / probability,
      0,
    );
    expect(result.totals.expectedCrafts).toBeCloseTo(expectedCrafts);
    expect(result.totals.expectedReagents).toEqual([
      { itemId: "fine-thread", expectedQuantity: expect.closeTo(expectedCrafts) },
      {
        itemId: "heavy-leather",
        expectedQuantity: expect.closeTo(expectedCrafts * 5),
      },
    ]);
    expect(result.totals.expectedCostCopper).toBeCloseTo(expectedCrafts * 105);
  });

  it("evaluates the whole range and identifies the first blocked skill", () => {
    const result = evaluateRecipeRange({
      recipe,
      professionId: context.professionId,
      buildId: context.buildId,
      startSkill: 188,
      targetSkill: 192,
    });

    expect(result).toMatchObject({
      status: "blocked",
      blockedAtSkill: 190,
      totals: { eligibleSkillPoints: 2 },
    });
    expect(result.evaluations).toHaveLength(4);
    expect(result.evaluations.slice(0, 2)).toEqual([
      expect.objectContaining({ status: "eligible" }),
      expect.objectContaining({ status: "eligible" }),
    ]);
    expect(result.totals).not.toHaveProperty("expectedCostCopper");
  });
});
