import {
  getExpectedCraftsForSkillUp,
  getSkillUpProbability,
  type SkillThresholds,
} from "@forever-professions/domain";

export type RouteObjective = "cost" | "crafts" | "materials";

export type RecipeAcquisition =
  | "automatic"
  | "trainer"
  | "vendor"
  | "drop"
  | "quest"
  | "reputation"
  | "unknown";

export interface RouteReagent {
  readonly itemId: string;
  readonly quantity: number;
  readonly unitPriceCopper?: number;
}

export interface RouteRecipe {
  readonly id: string;
  readonly name: string;
  readonly learnSkill: number | null;
  readonly availability: "available" | "unavailable" | "unknown";
  readonly thresholds: SkillThresholds;
  readonly reagents: readonly RouteReagent[];
  readonly acquisition: RecipeAcquisition;
}

export interface RouteConstraints {
  readonly knownRecipeIds?: readonly string[];
  readonly trainerOnly?: boolean;
  readonly excludedRecipeIds?: readonly string[];
  readonly excludedItemIds?: readonly string[];
}

export interface OptimizeRouteInput {
  readonly startSkill: number;
  readonly targetSkill: number;
  readonly objective: RouteObjective;
  readonly recipes: readonly RouteRecipe[];
  readonly constraints?: RouteConstraints;
}

export interface RouteSkillStep {
  readonly skill: number;
  readonly recipeId: string;
  readonly recipeName: string;
  readonly skillUpProbability: number;
  readonly expectedCrafts: number;
  readonly expectedMaterials: number;
  readonly expectedCostCopper?: number;
}

export interface RouteSegment {
  readonly recipeId: string;
  readonly recipeName: string;
  readonly startSkill: number;
  readonly endSkill: number;
  readonly expectedSkillUps: number;
  readonly expectedCrafts: number;
  readonly expectedMaterials: number;
  readonly expectedCostCopper?: number;
}

export interface RouteTotals {
  readonly expectedSkillUps: number;
  readonly expectedCrafts: number;
  readonly expectedMaterials: number;
  readonly expectedCostCopper?: number;
}

interface RouteResultBase {
  readonly objective: RouteObjective;
  readonly startSkill: number;
  readonly targetSkill: number;
  readonly steps: readonly RouteSkillStep[];
  readonly segments: readonly RouteSegment[];
  readonly totals: RouteTotals;
}

export interface CompleteRouteResult extends RouteResultBase {
  readonly status: "complete";
}

export interface BlockedRouteResult extends RouteResultBase {
  readonly status: "blocked";
  readonly blockedAtSkill: number;
  readonly reason: "no-eligible-recipe" | "missing-price-data";
}

export type RouteOptimizationResult = CompleteRouteResult | BlockedRouteResult;

interface Candidate {
  readonly recipe: RouteRecipe;
  readonly step: RouteSkillStep;
  readonly score: number;
}

function assertSkillRange(startSkill: number, targetSkill: number): void {
  if (!Number.isInteger(startSkill) || startSkill < 0) {
    throw new RangeError("startSkill must be a non-negative integer.");
  }
  if (!Number.isInteger(targetSkill) || targetSkill < startSkill) {
    throw new RangeError("targetSkill must be an integer at least as large as startSkill.");
  }
}

function validateRecipes(recipes: readonly RouteRecipe[]): void {
  const ids = new Set<string>();
  for (const recipe of recipes) {
    if (recipe.id.length === 0 || recipe.name.length === 0) {
      throw new Error("Route recipes require non-empty IDs and names.");
    }
    if (ids.has(recipe.id)) throw new Error(`Duplicate route recipe ID: ${recipe.id}.`);
    ids.add(recipe.id);

    for (const reagent of recipe.reagents) {
      if (reagent.itemId.length === 0) {
        throw new Error(`Recipe ${recipe.id} has a reagent without an item ID.`);
      }
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
}

function eligibleRecipes(
  recipes: readonly RouteRecipe[],
  constraints: RouteConstraints,
): readonly RouteRecipe[] {
  const known =
    constraints.knownRecipeIds === undefined
      ? undefined
      : new Set(constraints.knownRecipeIds);
  const excludedRecipes = new Set(constraints.excludedRecipeIds ?? []);
  const excludedItems = new Set(constraints.excludedItemIds ?? []);

  return recipes.filter((recipe) => {
    if (recipe.availability === "unavailable") return false;
    if (known !== undefined && !known.has(recipe.id)) return false;
    if (constraints.trainerOnly === true && recipe.acquisition !== "trainer") {
      return false;
    }
    if (excludedRecipes.has(recipe.id)) return false;
    return recipe.reagents.every(({ itemId }) => !excludedItems.has(itemId));
  });
}

function createStep(recipe: RouteRecipe, skill: number): RouteSkillStep | undefined {
  if (recipe.learnSkill === null || skill < recipe.learnSkill) return undefined;
  const skillUpProbability = getSkillUpProbability(skill, recipe.thresholds);
  if (skillUpProbability === 0) return undefined;

  const expectedCrafts = getExpectedCraftsForSkillUp(skillUpProbability);
  const materialsPerCraft = recipe.reagents.reduce(
    (total, { quantity }) => total + quantity,
    0,
  );
  const allPricesAvailable = recipe.reagents.every(
    ({ unitPriceCopper }) => unitPriceCopper !== undefined,
  );
  const costPerCraft = allPricesAvailable
    ? recipe.reagents.reduce(
        (total, { quantity, unitPriceCopper }) =>
          total + quantity * unitPriceCopper!,
        0,
      )
    : undefined;

  return {
    skill,
    recipeId: recipe.id,
    recipeName: recipe.name,
    skillUpProbability,
    expectedCrafts,
    expectedMaterials: expectedCrafts * materialsPerCraft,
    ...(costPerCraft === undefined
      ? {}
      : { expectedCostCopper: expectedCrafts * costPerCraft }),
  };
}

function scoreFor(step: RouteSkillStep, objective: RouteObjective): number | undefined {
  if (objective === "crafts") return step.expectedCrafts;
  if (objective === "materials") return step.expectedMaterials;
  return step.expectedCostCopper;
}

function compareCandidates(left: Candidate, right: Candidate): number {
  return (
    left.score - right.score ||
    left.step.expectedCrafts - right.step.expectedCrafts ||
    left.recipe.id.localeCompare(right.recipe.id)
  );
}

function totalsFor(steps: readonly RouteSkillStep[]): RouteTotals {
  const allCostsAvailable = steps.every(
    ({ expectedCostCopper }) => expectedCostCopper !== undefined,
  );
  return {
    expectedSkillUps: steps.length,
    expectedCrafts: steps.reduce((total, step) => total + step.expectedCrafts, 0),
    expectedMaterials: steps.reduce(
      (total, step) => total + step.expectedMaterials,
      0,
    ),
    ...(allCostsAvailable
      ? {
          expectedCostCopper: steps.reduce(
            (total, step) => total + step.expectedCostCopper!,
            0,
          ),
        }
      : {}),
  };
}

function segmentsFor(steps: readonly RouteSkillStep[]): readonly RouteSegment[] {
  const segments: RouteSegment[] = [];
  for (const step of steps) {
    const previous = segments.at(-1);
    if (previous?.recipeId === step.recipeId && previous.endSkill === step.skill) {
      const { expectedCostCopper: previousCost, ...previousWithoutCost } = previous;
      const costAvailable =
        previousCost !== undefined && step.expectedCostCopper !== undefined;
      segments[segments.length - 1] = {
        ...previousWithoutCost,
        endSkill: step.skill + 1,
        expectedSkillUps: previous.expectedSkillUps + 1,
        expectedCrafts: previous.expectedCrafts + step.expectedCrafts,
        expectedMaterials: previous.expectedMaterials + step.expectedMaterials,
        ...(costAvailable
          ? {
              expectedCostCopper: previousCost + step.expectedCostCopper,
            }
          : {}),
      };
      continue;
    }

    segments.push({
      recipeId: step.recipeId,
      recipeName: step.recipeName,
      startSkill: step.skill,
      endSkill: step.skill + 1,
      expectedSkillUps: 1,
      expectedCrafts: step.expectedCrafts,
      expectedMaterials: step.expectedMaterials,
      ...(step.expectedCostCopper === undefined
        ? {}
        : { expectedCostCopper: step.expectedCostCopper }),
    });
  }
  return segments;
}

export function optimizeLevelingRoute(
  input: OptimizeRouteInput,
): RouteOptimizationResult {
  assertSkillRange(input.startSkill, input.targetSkill);
  validateRecipes(input.recipes);
  const constrainedRecipes = eligibleRecipes(input.recipes, input.constraints ?? {});
  const steps: RouteSkillStep[] = [];

  for (let skill = input.startSkill; skill < input.targetSkill; skill += 1) {
    const possibleSteps = constrainedRecipes
      .map((recipe) => ({ recipe, step: createStep(recipe, skill) }))
      .filter(
        (candidate): candidate is { recipe: RouteRecipe; step: RouteSkillStep } =>
          candidate.step !== undefined,
      );
    const candidates = possibleSteps
      .map(({ recipe, step }) => {
        const score = scoreFor(step, input.objective);
        return score === undefined ? undefined : { recipe, step, score };
      })
      .filter((candidate): candidate is Candidate => candidate !== undefined)
      .sort(compareCandidates);

    const selected = candidates[0];
    if (selected === undefined) {
      return {
        status: "blocked",
        objective: input.objective,
        startSkill: input.startSkill,
        targetSkill: input.targetSkill,
        blockedAtSkill: skill,
        reason:
          possibleSteps.length > 0 && input.objective === "cost"
            ? "missing-price-data"
            : "no-eligible-recipe",
        steps,
        segments: segmentsFor(steps),
        totals: totalsFor(steps),
      };
    }
    steps.push(selected.step);
  }

  return {
    status: "complete",
    objective: input.objective,
    startSkill: input.startSkill,
    targetSkill: input.targetSkill,
    steps,
    segments: segmentsFor(steps),
    totals: totalsFor(steps),
  };
}
