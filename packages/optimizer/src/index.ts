import {
  evaluateRecipeAtSkill,
  validateLevelingRecipe,
  type LevelingRecipe,
  type PlayerFaction,
  type RecipeEvaluationContext,
} from "@forever-professions/domain";

export type RouteObjective = "cost" | "crafts" | "materials";

export interface RouteRecipe extends LevelingRecipe {
  readonly name: string;
}

export interface RouteConstraints {
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

export interface OptimizeRouteInput {
  readonly professionId: string;
  readonly buildId: string;
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
    validateLevelingRecipe(recipe);
  }
}

function evaluationContext(
  input: OptimizeRouteInput,
  skill: number,
): RecipeEvaluationContext {
  const constraints = input.constraints;
  return {
    professionId: input.professionId,
    buildId: input.buildId,
    skill,
    ...(constraints?.faction === undefined ? {} : { faction: constraints.faction }),
    ...(constraints?.specializationSpellIds === undefined
      ? {}
      : { specializationSpellIds: constraints.specializationSpellIds }),
    ...(constraints?.professionBranchId === undefined
      ? {}
      : { professionBranchId: constraints.professionBranchId }),
    ...(constraints?.knownRecipeIds === undefined
      ? {}
      : { knownRecipeIds: constraints.knownRecipeIds }),
    ...(constraints?.trainerOnly === undefined
      ? {}
      : { trainerOnly: constraints.trainerOnly }),
    ...(constraints?.excludedRecipeIds === undefined
      ? {}
      : { excludedRecipeIds: constraints.excludedRecipeIds }),
    ...(constraints?.excludedItemIds === undefined
      ? {}
      : { excludedItemIds: constraints.excludedItemIds }),
    ...(constraints?.allowUnknownAvailability === undefined
      ? {}
      : { allowUnknownAvailability: constraints.allowUnknownAvailability }),
    ...(constraints?.allowUnknownFaction === undefined
      ? {}
      : { allowUnknownFaction: constraints.allowUnknownFaction }),
    ...(constraints?.allowCooldowns === undefined
      ? {}
      : { allowCooldowns: constraints.allowCooldowns }),
  };
}

function createStep(
  recipe: RouteRecipe,
  input: OptimizeRouteInput,
  skill: number,
): RouteSkillStep | undefined {
  const evaluation = evaluateRecipeAtSkill(recipe, evaluationContext(input, skill));
  if (evaluation.status === "ineligible") return undefined;

  return {
    skill,
    recipeId: recipe.id,
    recipeName: recipe.name,
    skillUpProbability: evaluation.skillUpProbability,
    expectedCrafts: evaluation.expectedCrafts,
    expectedMaterials: evaluation.expectedMaterials,
    ...(evaluation.expectedCostCopper === undefined
      ? {}
      : { expectedCostCopper: evaluation.expectedCostCopper }),
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
  const steps: RouteSkillStep[] = [];

  for (let skill = input.startSkill; skill < input.targetSkill; skill += 1) {
    const possibleSteps = input.recipes
      .map((recipe) => ({ recipe, step: createStep(recipe, input, skill) }))
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
