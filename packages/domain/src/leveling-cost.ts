import {
  getExpectedCraftsForSkillUp,
  getRecipeDifficulty,
  getSkillUpProbability,
  type RecipeDifficulty,
  type SkillThresholds,
} from "./skill-up.js";

export type LevelingRecipeAcquisition =
  | "automatic"
  | "trainer"
  | "vendor"
  | "quest"
  | "drop"
  | "reputation"
  | "unknown";

export type LevelingRecipeFaction = "alliance" | "horde" | "both" | "unknown";
export type PlayerFaction = "alliance" | "horde";
export type LevelingRecipeAvailability = "available" | "unavailable" | "unknown";

export interface LevelingRecipeReagent {
  readonly itemId: string;
  readonly quantity: number;
  readonly unitPriceCopper?: number;
}

export interface LevelingRecipe {
  readonly id: string;
  readonly professionId: string;
  readonly buildId: string;
  readonly learnSkill: number | null;
  readonly acquisition: LevelingRecipeAcquisition;
  readonly faction: LevelingRecipeFaction;
  readonly specializationSpellId: number | null;
  readonly professionBranchId?: string | null;
  readonly cooldownSeconds: number | null;
  readonly availability: LevelingRecipeAvailability;
  readonly thresholds: SkillThresholds;
  readonly reagents: readonly LevelingRecipeReagent[];
}

export interface RecipeEvaluationContext {
  readonly professionId: string;
  readonly buildId: string;
  readonly skill: number;
  readonly faction?: PlayerFaction;
  readonly specializationSpellIds?: readonly number[];
  readonly professionBranchId?: string;
  readonly knownRecipeIds?: readonly string[];
  readonly trainerOnly?: boolean;
  readonly excludedRecipeIds?: readonly string[];
  readonly excludedItemIds?: readonly string[];
  readonly allowUnknownAvailability?: boolean;
  readonly allowUnknownFaction?: boolean;
  readonly allowCooldowns?: boolean;
}

export type RecipeIneligibilityReason =
  | "profession-mismatch"
  | "build-mismatch"
  | "unavailable"
  | "unknown-availability"
  | "unknown-learn-skill"
  | "skill-too-low"
  | "faction-mismatch"
  | "unknown-faction"
  | "specialization-required"
  | "profession-branch-mismatch"
  | "cooldown-disallowed"
  | "recipe-not-known"
  | "non-trainer-recipe"
  | "recipe-excluded"
  | "reagent-excluded"
  | "no-skill-up";

export interface ExpectedReagentUsage {
  readonly itemId: string;
  readonly quantityPerCraft: number;
  readonly expectedQuantity: number;
  readonly unitPriceCopper?: number;
  readonly expectedCostCopper?: number;
}

interface RecipeSkillEvaluationBase {
  readonly recipeId: string;
  readonly skill: number;
}

export interface IneligibleRecipeSkillEvaluation extends RecipeSkillEvaluationBase {
  readonly status: "ineligible";
  readonly reasons: readonly RecipeIneligibilityReason[];
}

export interface EligibleRecipeSkillEvaluation extends RecipeSkillEvaluationBase {
  readonly status: "eligible";
  readonly difficulty: Exclude<RecipeDifficulty, "unavailable" | "gray">;
  readonly skillUpProbability: number;
  readonly expectedCrafts: number;
  readonly materialsPerCraft: number;
  readonly expectedMaterials: number;
  readonly expectedReagents: readonly ExpectedReagentUsage[];
  readonly missingPriceItemIds: readonly string[];
  readonly craftCostCopper?: number;
  readonly expectedCostCopper?: number;
}

export type RecipeSkillEvaluation =
  | IneligibleRecipeSkillEvaluation
  | EligibleRecipeSkillEvaluation;

export interface RecipeRangeEvaluationInput
  extends Omit<RecipeEvaluationContext, "skill"> {
  readonly recipe: LevelingRecipe;
  readonly startSkill: number;
  readonly targetSkill: number;
}

export interface RecipeRangeTotals {
  readonly eligibleSkillPoints: number;
  readonly expectedCrafts: number;
  readonly expectedMaterials: number;
  readonly expectedReagents: readonly Pick<
    ExpectedReagentUsage,
    "itemId" | "expectedQuantity"
  >[];
  readonly missingPriceItemIds: readonly string[];
  readonly expectedCostCopper?: number;
}

export interface RecipeRangeEvaluation {
  readonly status: "complete" | "blocked";
  readonly recipeId: string;
  readonly startSkill: number;
  readonly targetSkill: number;
  readonly evaluations: readonly RecipeSkillEvaluation[];
  readonly blockedAtSkill?: number;
  readonly totals: RecipeRangeTotals;
}

function assertNonEmpty(value: string, field: string): void {
  if (value.length === 0) throw new Error(`${field} must not be empty.`);
}

function assertSkill(skill: number, field = "skill"): void {
  if (!Number.isInteger(skill) || skill < 0) {
    throw new RangeError(`${field} must be a non-negative integer.`);
  }
}

export function validateLevelingRecipe(recipe: LevelingRecipe): void {
  assertNonEmpty(recipe.id, "Recipe ID");
  assertNonEmpty(recipe.professionId, `Recipe ${recipe.id} profession ID`);
  assertNonEmpty(recipe.buildId, `Recipe ${recipe.id} build ID`);

  if (
    recipe.learnSkill !== null &&
    (!Number.isInteger(recipe.learnSkill) || recipe.learnSkill < 0)
  ) {
    throw new RangeError(`Recipe ${recipe.id} learnSkill must be null or non-negative.`);
  }
  if (
    recipe.specializationSpellId !== null &&
    (!Number.isSafeInteger(recipe.specializationSpellId) ||
      recipe.specializationSpellId <= 0)
  ) {
    throw new RangeError(
      `Recipe ${recipe.id} specializationSpellId must be null or positive.`,
    );
  }
  if (
    recipe.cooldownSeconds !== null &&
    (!Number.isSafeInteger(recipe.cooldownSeconds) || recipe.cooldownSeconds <= 0)
  ) {
    throw new RangeError(`Recipe ${recipe.id} cooldownSeconds must be null or positive.`);
  }
  if (recipe.professionBranchId === "") {
    throw new Error(`Recipe ${recipe.id} professionBranchId must not be empty.`);
  }

  getRecipeDifficulty(0, recipe.thresholds);
  for (const reagent of recipe.reagents) {
    assertNonEmpty(reagent.itemId, `Recipe ${recipe.id} reagent item ID`);
    if (!Number.isFinite(reagent.quantity) || reagent.quantity <= 0) {
      throw new RangeError(`Recipe ${recipe.id} reagent quantities must be positive.`);
    }
    if (
      reagent.unitPriceCopper !== undefined &&
      (!Number.isSafeInteger(reagent.unitPriceCopper) || reagent.unitPriceCopper <= 0)
    ) {
      throw new RangeError(
        `Recipe ${recipe.id} reagent prices must be positive integer copper values.`,
      );
    }
  }
}

function eligibilityReasons(
  recipe: LevelingRecipe,
  context: RecipeEvaluationContext,
): RecipeIneligibilityReason[] {
  const reasons: RecipeIneligibilityReason[] = [];
  if (recipe.professionId !== context.professionId) reasons.push("profession-mismatch");
  if (recipe.buildId !== context.buildId) reasons.push("build-mismatch");
  if (recipe.availability === "unavailable") reasons.push("unavailable");
  if (
    recipe.availability === "unknown" &&
    context.allowUnknownAvailability === false
  ) {
    reasons.push("unknown-availability");
  }
  if (recipe.learnSkill === null) reasons.push("unknown-learn-skill");
  else if (context.skill < recipe.learnSkill) reasons.push("skill-too-low");

  if (
    (recipe.faction === "alliance" || recipe.faction === "horde") &&
    recipe.faction !== context.faction
  ) {
    reasons.push("faction-mismatch");
  }
  if (recipe.faction === "unknown" && context.allowUnknownFaction === false) {
    reasons.push("unknown-faction");
  }
  if (
    recipe.specializationSpellId !== null &&
    !context.specializationSpellIds?.includes(recipe.specializationSpellId)
  ) {
    reasons.push("specialization-required");
  }
  if (
    recipe.professionBranchId !== undefined &&
    recipe.professionBranchId !== null &&
    recipe.professionBranchId !== context.professionBranchId
  ) {
    reasons.push("profession-branch-mismatch");
  }
  if (recipe.cooldownSeconds !== null && context.allowCooldowns !== true) {
    reasons.push("cooldown-disallowed");
  }
  if (
    context.knownRecipeIds !== undefined &&
    !context.knownRecipeIds.includes(recipe.id)
  ) {
    reasons.push("recipe-not-known");
  }
  if (context.trainerOnly === true && recipe.acquisition !== "trainer") {
    reasons.push("non-trainer-recipe");
  }
  if (context.excludedRecipeIds?.includes(recipe.id) === true) {
    reasons.push("recipe-excluded");
  }
  if (
    recipe.reagents.some(({ itemId }) => context.excludedItemIds?.includes(itemId))
  ) {
    reasons.push("reagent-excluded");
  }

  return reasons;
}

export function evaluateRecipeAtSkill(
  recipe: LevelingRecipe,
  context: RecipeEvaluationContext,
): RecipeSkillEvaluation {
  validateLevelingRecipe(recipe);
  assertNonEmpty(context.professionId, "Evaluation profession ID");
  assertNonEmpty(context.buildId, "Evaluation build ID");
  assertSkill(context.skill);

  const reasons = eligibilityReasons(recipe, context);
  const difficulty = getRecipeDifficulty(context.skill, recipe.thresholds);
  const skillUpProbability = getSkillUpProbability(context.skill, recipe.thresholds);
  if (skillUpProbability === 0) reasons.push("no-skill-up");

  if (reasons.length > 0) {
    return {
      status: "ineligible",
      recipeId: recipe.id,
      skill: context.skill,
      reasons,
    };
  }

  if (difficulty === "unavailable" || difficulty === "gray") {
    throw new Error("A positive skill-up probability must have a usable difficulty.");
  }

  const expectedCrafts = getExpectedCraftsForSkillUp(skillUpProbability);
  const reagentsByItem = new Map<
    string,
    { quantityPerCraft: number; unitPriceCopper?: number; priceMissing: boolean }
  >();
  for (const reagent of recipe.reagents) {
    const current = reagentsByItem.get(reagent.itemId);
    const sameKnownPrice =
      current?.unitPriceCopper === undefined ||
      reagent.unitPriceCopper === undefined ||
      current.unitPriceCopper === reagent.unitPriceCopper;
    if (!sameKnownPrice) {
      throw new Error(
        `Recipe ${recipe.id} has conflicting prices for reagent ${reagent.itemId}.`,
      );
    }
    reagentsByItem.set(reagent.itemId, {
      quantityPerCraft: (current?.quantityPerCraft ?? 0) + reagent.quantity,
      ...(current?.unitPriceCopper !== undefined
        ? { unitPriceCopper: current.unitPriceCopper }
        : reagent.unitPriceCopper === undefined
          ? {}
          : { unitPriceCopper: reagent.unitPriceCopper }),
      priceMissing:
        (current?.priceMissing ?? false) || reagent.unitPriceCopper === undefined,
    });
  }

  const expectedReagents: ExpectedReagentUsage[] = [...reagentsByItem]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, reagent]) => {
      const expectedQuantity = reagent.quantityPerCraft * expectedCrafts;
      const price = reagent.priceMissing ? undefined : reagent.unitPriceCopper;
      return {
        itemId,
        quantityPerCraft: reagent.quantityPerCraft,
        expectedQuantity,
        ...(price === undefined
          ? {}
          : {
              unitPriceCopper: price,
              expectedCostCopper: expectedQuantity * price,
            }),
      };
    });
  const missingPriceItemIds = expectedReagents
    .filter(({ unitPriceCopper }) => unitPriceCopper === undefined)
    .map(({ itemId }) => itemId);
  const materialsPerCraft = expectedReagents.reduce(
    (total, reagent) => total + reagent.quantityPerCraft,
    0,
  );
  const craftCostCopper =
    missingPriceItemIds.length === 0
      ? expectedReagents.reduce(
          (total, reagent) =>
            total + reagent.quantityPerCraft * reagent.unitPriceCopper!,
          0,
        )
      : undefined;

  return {
    status: "eligible",
    recipeId: recipe.id,
    skill: context.skill,
    difficulty,
    skillUpProbability,
    expectedCrafts,
    materialsPerCraft,
    expectedMaterials: materialsPerCraft * expectedCrafts,
    expectedReagents,
    missingPriceItemIds,
    ...(craftCostCopper === undefined
      ? {}
      : {
          craftCostCopper,
          expectedCostCopper: craftCostCopper * expectedCrafts,
        }),
  };
}

export function evaluateRecipeRange(
  input: RecipeRangeEvaluationInput,
): RecipeRangeEvaluation {
  assertSkill(input.startSkill, "startSkill");
  assertSkill(input.targetSkill, "targetSkill");
  if (input.targetSkill < input.startSkill) {
    throw new RangeError("targetSkill must be at least startSkill.");
  }

  const evaluations: RecipeSkillEvaluation[] = [];
  for (let skill = input.startSkill; skill < input.targetSkill; skill += 1) {
    evaluations.push(
      evaluateRecipeAtSkill(input.recipe, {
        professionId: input.professionId,
        buildId: input.buildId,
        skill,
        ...(input.faction === undefined ? {} : { faction: input.faction }),
        ...(input.specializationSpellIds === undefined
          ? {}
          : { specializationSpellIds: input.specializationSpellIds }),
        ...(input.professionBranchId === undefined
          ? {}
          : { professionBranchId: input.professionBranchId }),
        ...(input.knownRecipeIds === undefined
          ? {}
          : { knownRecipeIds: input.knownRecipeIds }),
        ...(input.trainerOnly === undefined
          ? {}
          : { trainerOnly: input.trainerOnly }),
        ...(input.excludedRecipeIds === undefined
          ? {}
          : { excludedRecipeIds: input.excludedRecipeIds }),
        ...(input.excludedItemIds === undefined
          ? {}
          : { excludedItemIds: input.excludedItemIds }),
        ...(input.allowUnknownAvailability === undefined
          ? {}
          : { allowUnknownAvailability: input.allowUnknownAvailability }),
        ...(input.allowUnknownFaction === undefined
          ? {}
          : { allowUnknownFaction: input.allowUnknownFaction }),
        ...(input.allowCooldowns === undefined
          ? {}
          : { allowCooldowns: input.allowCooldowns }),
      }),
    );
  }

  const eligible = evaluations.filter(
    (evaluation): evaluation is EligibleRecipeSkillEvaluation =>
      evaluation.status === "eligible",
  );
  const blockedAtSkill = evaluations.find(
    (evaluation) => evaluation.status === "ineligible",
  )?.skill;
  const reagentTotals = new Map<string, number>();
  for (const evaluation of eligible) {
    for (const reagent of evaluation.expectedReagents) {
      reagentTotals.set(
        reagent.itemId,
        (reagentTotals.get(reagent.itemId) ?? 0) + reagent.expectedQuantity,
      );
    }
  }
  const missingPriceItemIds = [
    ...new Set(eligible.flatMap((evaluation) => evaluation.missingPriceItemIds)),
  ].sort();
  const complete = blockedAtSkill === undefined;
  const allCostsAvailable =
    complete && eligible.every(({ expectedCostCopper }) => expectedCostCopper !== undefined);

  return {
    status: complete ? "complete" : "blocked",
    recipeId: input.recipe.id,
    startSkill: input.startSkill,
    targetSkill: input.targetSkill,
    evaluations,
    ...(blockedAtSkill === undefined ? {} : { blockedAtSkill }),
    totals: {
      eligibleSkillPoints: eligible.length,
      expectedCrafts: eligible.reduce(
        (total, evaluation) => total + evaluation.expectedCrafts,
        0,
      ),
      expectedMaterials: eligible.reduce(
        (total, evaluation) => total + evaluation.expectedMaterials,
        0,
      ),
      expectedReagents: [...reagentTotals]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([itemId, expectedQuantity]) => ({ itemId, expectedQuantity })),
      missingPriceItemIds,
      ...(allCostsAvailable
        ? {
            expectedCostCopper: eligible.reduce(
              (total, evaluation) => total + evaluation.expectedCostCopper!,
              0,
            ),
          }
        : {}),
    },
  };
}
