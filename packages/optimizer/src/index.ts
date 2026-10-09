import {
  evaluateRecipeAtSkill,
  validateLevelingRecipe,
  type LevelingRecipeAcquisition,
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

export type AcquisitionPenaltyRatios = Readonly<
  Partial<Record<LevelingRecipeAcquisition, number | undefined>>
>;

export interface RouteOptimizationPolicy {
  readonly switchPenaltyRatio?: number | undefined;
  readonly acquisitionPenaltyRatios?: AcquisitionPenaltyRatios | undefined;
  readonly specializationPenaltyRatio?: number | undefined;
  readonly cooldownPenaltyRatio?: number | undefined;
}

export interface ResolvedRouteOptimizationPolicy {
  readonly switchPenaltyRatio: number;
  readonly acquisitionPenaltyRatios: Readonly<
    Record<LevelingRecipeAcquisition, number>
  >;
  readonly specializationPenaltyRatio: number;
  readonly cooldownPenaltyRatio: number;
}

export const DEFAULT_ROUTE_OPTIMIZATION_POLICY: ResolvedRouteOptimizationPolicy = {
  switchPenaltyRatio: 0.075,
  acquisitionPenaltyRatios: {
    automatic: 0,
    trainer: 0,
    vendor: 0.05,
    quest: 0.1,
    drop: 0.2,
    reputation: 0.2,
    unknown: 0.1,
  },
  specializationPenaltyRatio: 0.1,
  cooldownPenaltyRatio: 0.25,
};

const RECIPE_ACQUISITIONS = [
  "automatic",
  "trainer",
  "vendor",
  "quest",
  "drop",
  "reputation",
  "unknown",
] as const satisfies readonly LevelingRecipeAcquisition[];

export interface OptimizeRouteInput {
  readonly professionId: string;
  readonly buildId: string;
  readonly startSkill: number;
  readonly targetSkill: number;
  readonly objective: RouteObjective;
  readonly recipes: readonly RouteRecipe[];
  readonly constraints?: RouteConstraints;
  readonly policy?: RouteOptimizationPolicy;
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
  readonly stepScore: number;
}

interface PathCandidate extends Candidate {
  readonly totalScore: number;
  readonly changesRecipe: boolean;
}

const NO_ACTIVE_RECIPE: unique symbol = Symbol("no-active-recipe");
type ActiveRecipeState = string | typeof NO_ACTIVE_RECIPE;

interface EvaluatedSkill {
  readonly skill: number;
  readonly possibleSteps: readonly RouteSkillStep[];
  readonly candidates: readonly Candidate[];
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

function assertPenaltyRatio(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${field} must be between 0 and 1.`);
  }
}

function resolvePolicy(
  policy: RouteOptimizationPolicy | undefined,
): ResolvedRouteOptimizationPolicy {
  const acquisitionPenaltyRatios: Record<LevelingRecipeAcquisition, number> = {
    ...DEFAULT_ROUTE_OPTIMIZATION_POLICY.acquisitionPenaltyRatios,
  };
  for (const acquisition of RECIPE_ACQUISITIONS) {
    const configured = policy?.acquisitionPenaltyRatios?.[acquisition];
    if (configured !== undefined) acquisitionPenaltyRatios[acquisition] = configured;
  }
  const resolved: ResolvedRouteOptimizationPolicy = {
    switchPenaltyRatio:
      policy?.switchPenaltyRatio ??
      DEFAULT_ROUTE_OPTIMIZATION_POLICY.switchPenaltyRatio,
    acquisitionPenaltyRatios,
    specializationPenaltyRatio:
      policy?.specializationPenaltyRatio ??
      DEFAULT_ROUTE_OPTIMIZATION_POLICY.specializationPenaltyRatio,
    cooldownPenaltyRatio:
      policy?.cooldownPenaltyRatio ??
      DEFAULT_ROUTE_OPTIMIZATION_POLICY.cooldownPenaltyRatio,
  };

  assertPenaltyRatio(resolved.switchPenaltyRatio, "switchPenaltyRatio");
  assertPenaltyRatio(
    resolved.specializationPenaltyRatio,
    "specializationPenaltyRatio",
  );
  assertPenaltyRatio(resolved.cooldownPenaltyRatio, "cooldownPenaltyRatio");
  for (const [acquisition, ratio] of Object.entries(
    resolved.acquisitionPenaltyRatios,
  )) {
    assertPenaltyRatio(ratio, `acquisitionPenaltyRatios.${acquisition}`);
  }
  return resolved;
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

function comparePathCandidates(left: PathCandidate, right: PathCandidate): number {
  return (
    left.totalScore - right.totalScore ||
    Number(left.changesRecipe) - Number(right.changesRecipe) ||
    left.step.expectedCrafts - right.step.expectedCrafts ||
    left.recipe.id.localeCompare(right.recipe.id)
  );
}

function acquisitionFrictionRatio(
  recipe: RouteRecipe,
  policy: ResolvedRouteOptimizationPolicy,
): number {
  return (
    policy.acquisitionPenaltyRatios[recipe.acquisition] +
    (recipe.specializationSpellId === null
      ? 0
      : policy.specializationPenaltyRatio) +
    (recipe.cooldownSeconds === null ? 0 : policy.cooldownPenaltyRatio)
  );
}

function pathCandidate(
  candidate: Candidate,
  futureScore: number,
  penaltyRatio: number,
  changesRecipe: boolean,
): PathCandidate {
  return {
    ...candidate,
    totalScore: candidate.stepScore * (1 + penaltyRatio) + futureScore,
    changesRecipe,
  };
}

function evaluateSkill(input: OptimizeRouteInput, skill: number): EvaluatedSkill {
  const possible = input.recipes
    .map((recipe) => ({ recipe, step: createStep(recipe, input, skill) }))
    .filter(
      (candidate): candidate is { recipe: RouteRecipe; step: RouteSkillStep } =>
        candidate.step !== undefined,
    );

  return {
    skill,
    possibleSteps: possible.map(({ step }) => step),
    candidates: possible.flatMap(({ recipe, step }) => {
      const stepScore = scoreFor(step, input.objective);
      return stepScore === undefined ? [] : [{ recipe, step, stepScore }];
    }),
  };
}

function reconstructOptimalSteps(
  input: OptimizeRouteInput,
  evaluatedSkills: readonly EvaluatedSkill[],
  effectiveTargetSkill: number,
  policy: ResolvedRouteOptimizationPolicy,
): readonly RouteSkillStep[] {
  const activeRecipeIds = [
    ...new Set(
      evaluatedSkills
        .slice(0, effectiveTargetSkill - input.startSkill)
        .flatMap(({ candidates }) => candidates.map(({ recipe }) => recipe.id)),
    ),
  ];
  const routeStates: readonly ActiveRecipeState[] = [
    NO_ACTIVE_RECIPE,
    ...activeRecipeIds,
  ];
  let bestScoreAtNextSkill = new Map<ActiveRecipeState, number>(
    routeStates.map((state) => [state, 0]),
  );
  const decisionsBySkill: Map<ActiveRecipeState, Candidate>[] = [];

  for (
    let skill = effectiveTargetSkill - 1;
    skill >= input.startSkill;
    skill -= 1
  ) {
    const evaluated = evaluatedSkills[skill - input.startSkill];
    if (evaluated === undefined) {
      throw new Error(`Route optimizer could not resolve state at skill ${skill}.`);
    }
    const candidatesWithFuture = evaluated.candidates.map((candidate) => {
      const futureScore = bestScoreAtNextSkill.get(candidate.recipe.id);
      if (futureScore === undefined) {
        throw new Error(
          `Route optimizer could not resolve future score for ${candidate.recipe.id}.`,
        );
      }
      return { candidate, futureScore };
    });
    if (candidatesWithFuture.length === 0) {
      throw new Error(`Route optimizer found an unexpected gap at skill ${skill}.`);
    }

    const initialCandidates = candidatesWithFuture
      .map(({ candidate, futureScore }) =>
        pathCandidate(
          candidate,
          futureScore,
          acquisitionFrictionRatio(candidate.recipe, policy),
          true,
        ),
      )
      .sort(comparePathCandidates);
    const switchingCandidates = candidatesWithFuture
      .map(({ candidate, futureScore }) =>
        pathCandidate(
          candidate,
          futureScore,
          policy.switchPenaltyRatio +
            acquisitionFrictionRatio(candidate.recipe, policy),
          true,
        ),
      )
      .sort(comparePathCandidates);
    const continuingCandidates = new Map(
      candidatesWithFuture.map(({ candidate, futureScore }) => [
        candidate.recipe.id,
        pathCandidate(candidate, futureScore, 0, false),
      ]),
    );
    const decisions = new Map<ActiveRecipeState, Candidate>();
    const scores = new Map<ActiveRecipeState, number>();

    const initial = initialCandidates[0];
    if (initial === undefined) {
      throw new Error(`Route optimizer could not initialize skill ${skill}.`);
    }
    decisions.set(NO_ACTIVE_RECIPE, initial);
    scores.set(NO_ACTIVE_RECIPE, initial.totalScore);

    for (const previousRecipeId of activeRecipeIds) {
      const continuing = continuingCandidates.get(previousRecipeId);
      const switching =
        switchingCandidates[0]?.recipe.id === previousRecipeId
          ? switchingCandidates[1]
          : switchingCandidates[0];
      const selected = [continuing, switching]
        .filter((candidate): candidate is PathCandidate => candidate !== undefined)
        .sort(comparePathCandidates)[0];
      if (selected === undefined) {
        throw new Error(
          `Route optimizer could not continue from ${previousRecipeId} at skill ${skill}.`,
        );
      }
      decisions.set(previousRecipeId, selected);
      scores.set(previousRecipeId, selected.totalScore);
    }

    decisionsBySkill[skill - input.startSkill] = decisions;
    bestScoreAtNextSkill = scores;
  }

  const steps: RouteSkillStep[] = [];
  let activeRecipe: ActiveRecipeState = NO_ACTIVE_RECIPE;
  for (let skill = input.startSkill; skill < effectiveTargetSkill; skill += 1) {
    const selected: Candidate | undefined =
      decisionsBySkill[skill - input.startSkill]?.get(activeRecipe);
    if (selected === undefined) {
      throw new Error(`Route optimizer could not reconstruct skill ${skill}.`);
    }
    steps.push(selected.step);
    activeRecipe = selected.recipe.id;
  }
  return steps;
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
  const policy = resolvePolicy(input.policy);
  const evaluatedSkills: EvaluatedSkill[] = [];
  for (let skill = input.startSkill; skill < input.targetSkill; skill += 1) {
    evaluatedSkills.push(evaluateSkill(input, skill));
  }

  const firstBlocked = evaluatedSkills.find(
    ({ candidates }) => candidates.length === 0,
  );
  const effectiveTargetSkill = firstBlocked?.skill ?? input.targetSkill;
  const steps = reconstructOptimalSteps(
    input,
    evaluatedSkills,
    effectiveTargetSkill,
    policy,
  );

  if (firstBlocked !== undefined) {
    return {
      status: "blocked",
      objective: input.objective,
      startSkill: input.startSkill,
      targetSkill: input.targetSkill,
      blockedAtSkill: firstBlocked.skill,
      reason:
        firstBlocked.possibleSteps.length > 0 && input.objective === "cost"
          ? "missing-price-data"
          : "no-eligible-recipe",
      steps,
      segments: segmentsFor(steps),
      totals: totalsFor(steps),
    };
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
