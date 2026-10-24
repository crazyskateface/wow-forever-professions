import {
  assessDataQuality,
  assertTargetSkillWithinBaseCap,
  evaluateRecipeAtSkill,
  validateLevelingRecipe,
  type ProvenanceSource,
  type LevelingRecipeAcquisition,
  type LevelingRecipe,
  type PlayerFaction,
  type RecipeEvaluationContext,
  type VerificationStatus,
} from "@forever-professions/domain";

export * from "./route-validation.js";

export type RouteObjective = "cost" | "crafts" | "materials";
export type RoutePreset =
  | "practical"
  | "trainer-friendly"
  | "cheapest"
  | "fewest-crafts"
  | "fewest-materials"
  | "experimental";
export type RouteConfidencePolicy =
  | "practical"
  | "supported-only"
  | "experimental";
export type RouteConfidenceLevel =
  | "verified"
  | "unverified"
  | "fallback"
  | "unknown"
  | "rejected";
export type RouteEvidenceReason =
  | "unknown-acquisition"
  | "unknown-availability"
  | "classic-fallback"
  | "unverified-recipe"
  | "rejected-recipe";
export type RouteSelectionReason =
  | "only-eligible-recipe"
  | "practical-balance"
  | "practical-evidence-fallback"
  | "trainer-preference"
  | "trainer-fallback"
  | "lowest-supported-cost"
  | "fewest-expected-crafts"
  | "fewest-materials"
  | "experimental-evidence-accepted";
export type RouteAlternativeLossReason =
  | "shorter-coverage"
  | "weaker-evidence"
  | "trainer-preference"
  | "higher-expected-cost"
  | "more-expected-crafts"
  | "more-materials"
  | "full-route-fit";

export interface RouteRecipeEvidence {
  readonly level: RouteConfidenceLevel;
  readonly reasons: readonly RouteEvidenceReason[];
  readonly acquisition: LevelingRecipeAcquisition;
  readonly availability: LevelingRecipe["availability"];
  readonly provenanceSource: ProvenanceSource;
  readonly verificationStatus: VerificationStatus;
}

export interface RouteRecipe extends LevelingRecipe {
  readonly name: string;
  readonly provenanceSource: ProvenanceSource;
  readonly verificationStatus: VerificationStatus;
}

export interface RouteConstraints {
  readonly faction?: PlayerFaction;
  readonly specializationSpellIds?: readonly number[];
  readonly professionBranchId?: string;
  readonly knownRecipeIds?: readonly string[];
  readonly trainerOnly?: boolean;
  readonly excludedRecipeIds?: readonly string[];
  readonly excludedItemIds?: readonly string[];
  readonly allowUnknownAcquisition?: boolean;
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

export interface ResolvedRoutePreset {
  readonly preset: RoutePreset;
  readonly objective: RouteObjective;
  readonly confidencePolicy: RouteConfidencePolicy;
  readonly policy: ResolvedRouteOptimizationPolicy;
}

const PURE_OBJECTIVE_POLICY: ResolvedRouteOptimizationPolicy = {
  switchPenaltyRatio: 0,
  acquisitionPenaltyRatios: {
    automatic: 0,
    trainer: 0,
    vendor: 0,
    quest: 0,
    drop: 0,
    reputation: 0,
    unknown: 0,
  },
  specializationPenaltyRatio: 0,
  cooldownPenaltyRatio: 0,
};

const TRAINER_FRIENDLY_POLICY: ResolvedRouteOptimizationPolicy = {
  ...DEFAULT_ROUTE_OPTIMIZATION_POLICY,
  acquisitionPenaltyRatios: {
    automatic: 0,
    trainer: 0,
    vendor: 1,
    quest: 1,
    drop: 1,
    reputation: 1,
    unknown: 1,
  },
};

export function resolveRoutePreset(preset: RoutePreset): ResolvedRoutePreset {
  if (preset === "trainer-friendly") {
    return {
      preset,
      objective: "crafts",
      confidencePolicy: "supported-only",
      policy: TRAINER_FRIENDLY_POLICY,
    };
  }
  if (preset === "cheapest") {
    return {
      preset,
      objective: "cost",
      confidencePolicy: "supported-only",
      policy: PURE_OBJECTIVE_POLICY,
    };
  }
  if (preset === "fewest-crafts") {
    return {
      preset,
      objective: "crafts",
      confidencePolicy: "supported-only",
      policy: PURE_OBJECTIVE_POLICY,
    };
  }
  if (preset === "fewest-materials") {
    return {
      preset,
      objective: "materials",
      confidencePolicy: "supported-only",
      policy: PURE_OBJECTIVE_POLICY,
    };
  }
  if (preset === "experimental") {
    return {
      preset,
      objective: "crafts",
      confidencePolicy: "experimental",
      policy: PURE_OBJECTIVE_POLICY,
    };
  }
  return {
    preset,
    objective: "crafts",
    confidencePolicy: "practical",
    policy: DEFAULT_ROUTE_OPTIMIZATION_POLICY,
  };
}

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
  readonly maxBaseSkill: number;
  readonly startSkill: number;
  readonly targetSkill: number;
  readonly objective: RouteObjective;
  readonly preset?: RoutePreset;
  readonly confidencePolicy?: RouteConfidencePolicy;
  readonly recipes: readonly RouteRecipe[];
  readonly scarceItemIds?: readonly string[];
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
  readonly evidence: RouteRecipeEvidence;
}

export interface RouteAlternative {
  readonly recipeId: string;
  readonly recipeName: string;
  readonly startSkill: number;
  readonly endSkill: number;
  readonly expectedSkillUps: number;
  readonly expectedCrafts: number;
  readonly expectedMaterials: number;
  readonly expectedCostCopper?: number;
  readonly evidence: RouteRecipeEvidence;
  readonly lossReason: RouteAlternativeLossReason;
  readonly lossSummary: string;
}

interface RouteCandidateSummary {
  readonly recipeId: string;
  readonly recipeName: string;
  readonly startSkill: number;
  readonly endSkill: number;
  readonly expectedSkillUps: number;
  readonly expectedCrafts: number;
  readonly expectedMaterials: number;
  readonly expectedCostCopper?: number;
  readonly evidence: RouteRecipeEvidence;
}

export interface RouteRecommendation {
  readonly reasons: readonly RouteSelectionReason[];
  readonly summary: string;
}

export interface RouteSegment extends RouteCandidateSummary {
  readonly recommendation: RouteRecommendation;
  readonly alternatives: readonly RouteAlternative[];
}

export interface RouteTotals {
  readonly expectedSkillUps: number;
  readonly expectedCrafts: number;
  readonly expectedMaterials: number;
  readonly expectedCostCopper?: number;
}

interface RouteResultBase {
  readonly preset: RoutePreset;
  readonly objective: RouteObjective;
  readonly confidencePolicy: RouteConfidencePolicy;
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
  readonly reason:
    | "no-eligible-recipe"
    | "missing-price-data"
    | "unsupported-recipe-evidence";
  readonly explanation: string;
}

export type RouteOptimizationResult = CompleteRouteResult | BlockedRouteResult;

interface Candidate {
  readonly recipe: RouteRecipe;
  readonly step: RouteSkillStep;
  readonly stepScore: number;
  readonly scarceMaterials: number;
  readonly unknownEvidenceSteps: number;
}

interface PathCandidate extends Candidate {
  readonly totalScarceMaterials: number;
  readonly totalUnknownEvidenceSteps: number;
  readonly totalScore: number;
  readonly missingPriceSteps: number;
  readonly knownCostCopper: number;
  readonly changesRecipe: boolean;
}

interface PathScore {
  readonly scarceMaterials: number;
  readonly unknownEvidenceSteps: number;
  readonly objectiveScore: number;
  readonly missingPriceSteps: number;
  readonly knownCostCopper: number;
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

function resolveConfidencePolicy(
  policy: RouteConfidencePolicy | undefined,
): RouteConfidencePolicy {
  return policy ?? "practical";
}

function evidenceFor(recipe: RouteRecipe): RouteRecipeEvidence {
  const quality = assessDataQuality(
    recipe.provenanceSource,
    recipe.verificationStatus,
  );
  const reasons: RouteEvidenceReason[] = [];
  if (recipe.acquisition === "unknown") reasons.push("unknown-acquisition");
  if (recipe.availability === "unknown") reasons.push("unknown-availability");
  if (quality.level === "fallback") reasons.push("classic-fallback");
  if (quality.level === "unverified") reasons.push("unverified-recipe");
  if (quality.level === "rejected") reasons.push("rejected-recipe");

  const level: RouteConfidenceLevel =
    quality.level === "rejected"
      ? "rejected"
      : recipe.acquisition === "unknown" || recipe.availability === "unknown"
        ? "unknown"
        : quality.level;

  return {
    level,
    reasons,
    acquisition: recipe.acquisition,
    availability: recipe.availability,
    provenanceSource: recipe.provenanceSource,
    verificationStatus: recipe.verificationStatus,
  };
}

function evaluationContext(
  input: OptimizeRouteInput,
  skill: number,
  confidencePolicy: RouteConfidencePolicy,
): RecipeEvaluationContext {
  const constraints = input.constraints;
  const supportedOnly = confidencePolicy === "supported-only";
  const allowUnknownAcquisition = supportedOnly
    ? false
    : constraints?.allowUnknownAcquisition;
  const allowUnknownAvailability = supportedOnly
    ? false
    : constraints?.allowUnknownAvailability;
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
    ...(allowUnknownAcquisition === undefined
      ? {}
      : { allowUnknownAcquisition }),
    ...(allowUnknownAvailability === undefined
      ? {}
      : { allowUnknownAvailability }),
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
  confidencePolicy: RouteConfidencePolicy,
): RouteSkillStep | undefined {
  if (recipe.verificationStatus === "rejected") return undefined;
  const evaluation = evaluateRecipeAtSkill(
    recipe,
    evaluationContext(input, skill, confidencePolicy),
  );
  if (evaluation.status === "ineligible") return undefined;

  return {
    skill,
    recipeId: recipe.id,
    recipeName: recipe.name,
    skillUpProbability: evaluation.skillUpProbability,
    expectedCrafts: evaluation.expectedCrafts,
    expectedMaterials: evaluation.expectedMaterials,
    evidence: evidenceFor(recipe),
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

function comparePathCandidates(
  preferSupportedCost: boolean,
): (left: PathCandidate, right: PathCandidate) => number {
  return (left, right) =>
    left.totalScarceMaterials - right.totalScarceMaterials ||
    left.totalUnknownEvidenceSteps - right.totalUnknownEvidenceSteps ||
    left.totalScore - right.totalScore ||
    (preferSupportedCost &&
    left.missingPriceSteps === 0 &&
    right.missingPriceSteps === 0
      ? left.knownCostCopper - right.knownCostCopper
      : 0) ||
    Number(left.changesRecipe) - Number(right.changesRecipe) ||
    left.step.expectedCrafts - right.step.expectedCrafts ||
    left.recipe.id.localeCompare(right.recipe.id);
}

function scarceMaterialsFor(
  recipe: RouteRecipe,
  step: RouteSkillStep,
  scarceItemIds: ReadonlySet<string>,
): number {
  const unitsPerCraft = recipe.reagents.reduce(
    (total, reagent) =>
      total + (scarceItemIds.has(reagent.itemId) ? reagent.quantity : 0),
    0,
  );
  return unitsPerCraft * step.expectedCrafts;
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
  futureScore: PathScore,
  penaltyRatio: number,
  changesRecipe: boolean,
): PathCandidate {
  return {
    ...candidate,
    totalScarceMaterials:
      candidate.scarceMaterials + futureScore.scarceMaterials,
    totalUnknownEvidenceSteps:
      candidate.unknownEvidenceSteps + futureScore.unknownEvidenceSteps,
    totalScore:
      candidate.stepScore * (1 + penaltyRatio) + futureScore.objectiveScore,
    missingPriceSteps:
      (candidate.step.expectedCostCopper === undefined ? 1 : 0) +
      futureScore.missingPriceSteps,
    knownCostCopper:
      (candidate.step.expectedCostCopper ?? 0) + futureScore.knownCostCopper,
    changesRecipe,
  };
}

function evaluateSkill(
  input: OptimizeRouteInput,
  skill: number,
  scarceItemIds: ReadonlySet<string>,
  confidencePolicy: RouteConfidencePolicy,
): EvaluatedSkill {
  const possible = input.recipes
    .map((recipe) => ({
      recipe,
      step: createStep(recipe, input, skill, confidencePolicy),
    }))
    .filter(
      (candidate): candidate is { recipe: RouteRecipe; step: RouteSkillStep } =>
        candidate.step !== undefined,
    );

  return {
    skill,
    possibleSteps: possible.map(({ step }) => step),
    candidates: possible.flatMap(({ recipe, step }) => {
      const stepScore = scoreFor(step, input.objective);
      return stepScore === undefined
        ? []
        : [
            {
              recipe,
              step,
              stepScore,
              scarceMaterials: scarceMaterialsFor(
                recipe,
                step,
                scarceItemIds,
              ),
              unknownEvidenceSteps:
                confidencePolicy !== "experimental" &&
                (recipe.acquisition === "unknown" ||
                recipe.availability === "unknown")
                  ? 1
                  : 0,
            },
          ];
    }),
  };
}

function reconstructOptimalSteps(
  input: OptimizeRouteInput,
  evaluatedSkills: readonly EvaluatedSkill[],
  effectiveTargetSkill: number,
  policy: ResolvedRouteOptimizationPolicy,
  preferSupportedCost: boolean,
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
  let bestScoreAtNextSkill = new Map<ActiveRecipeState, PathScore>(
    routeStates.map((state) => [
      state,
      {
        scarceMaterials: 0,
        unknownEvidenceSteps: 0,
        objectiveScore: 0,
        missingPriceSteps: 0,
        knownCostCopper: 0,
      },
    ]),
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
      .sort(comparePathCandidates(preferSupportedCost));
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
      .sort(comparePathCandidates(preferSupportedCost));
    const continuingCandidates = new Map(
      candidatesWithFuture.map(({ candidate, futureScore }) => [
        candidate.recipe.id,
        pathCandidate(candidate, futureScore, 0, false),
      ]),
    );
    const decisions = new Map<ActiveRecipeState, Candidate>();
    const scores = new Map<ActiveRecipeState, PathScore>();

    const initial = initialCandidates[0];
    if (initial === undefined) {
      throw new Error(`Route optimizer could not initialize skill ${skill}.`);
    }
    decisions.set(NO_ACTIVE_RECIPE, initial);
    scores.set(NO_ACTIVE_RECIPE, {
      scarceMaterials: initial.totalScarceMaterials,
      unknownEvidenceSteps: initial.totalUnknownEvidenceSteps,
      objectiveScore: initial.totalScore,
      missingPriceSteps: initial.missingPriceSteps,
      knownCostCopper: initial.knownCostCopper,
    });

    for (const previousRecipeId of activeRecipeIds) {
      const continuing = continuingCandidates.get(previousRecipeId);
      const switching =
        switchingCandidates[0]?.recipe.id === previousRecipeId
          ? switchingCandidates[1]
          : switchingCandidates[0];
      const selected = [continuing, switching]
        .filter((candidate): candidate is PathCandidate => candidate !== undefined)
        .sort(comparePathCandidates(preferSupportedCost))[0];
      if (selected === undefined) {
        throw new Error(
          `Route optimizer could not continue from ${previousRecipeId} at skill ${skill}.`,
        );
      }
      decisions.set(previousRecipeId, selected);
      scores.set(previousRecipeId, {
        scarceMaterials: selected.totalScarceMaterials,
        unknownEvidenceSteps: selected.totalUnknownEvidenceSteps,
        objectiveScore: selected.totalScore,
        missingPriceSteps: selected.missingPriceSteps,
        knownCostCopper: selected.knownCostCopper,
      });
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

function totalsFor(
  steps: readonly RouteSkillStep[],
  includeEmptyCost: boolean,
): RouteTotals {
  const allCostsAvailable = (includeEmptyCost || steps.length > 0) &&
    steps.every(({ expectedCostCopper }) => expectedCostCopper !== undefined);
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

function scoreForAlternative(
  alternative: RouteCandidateSummary,
  objective: RouteObjective,
): number {
  const skillUps = alternative.expectedSkillUps;
  if (objective === "crafts") return alternative.expectedCrafts / skillUps;
  if (objective === "materials") return alternative.expectedMaterials / skillUps;
  return alternative.expectedCostCopper! / skillUps;
}

function aggregateAlternativeSteps(
  steps: readonly RouteSkillStep[],
): RouteCandidateSummary {
  const first = steps[0];
  const last = steps.at(-1);
  if (first === undefined || last === undefined) {
    throw new Error("Route alternatives require at least one skill step.");
  }
  const allCostsAvailable = steps.every(
    ({ expectedCostCopper }) => expectedCostCopper !== undefined,
  );
  return {
    recipeId: first.recipeId,
    recipeName: first.recipeName,
    startSkill: first.skill,
    endSkill: last.skill + 1,
    expectedSkillUps: steps.length,
    expectedCrafts: steps.reduce((total, step) => total + step.expectedCrafts, 0),
    expectedMaterials: steps.reduce(
      (total, step) => total + step.expectedMaterials,
      0,
    ),
    evidence: first.evidence,
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

function alternativeRunsFor(
  segment: RouteCandidateSummary,
  evaluatedSkills: readonly EvaluatedSkill[],
  routeStartSkill: number,
): readonly RouteCandidateSummary[] {
  const recipeIds = [
    ...new Set(
      evaluatedSkills
        .slice(
          segment.startSkill - routeStartSkill,
          segment.endSkill - routeStartSkill,
        )
        .flatMap(({ candidates }) =>
          candidates
            .filter(({ recipe }) => recipe.id !== segment.recipeId)
            .map(({ recipe }) => recipe.id),
        ),
    ),
  ];
  const alternatives: RouteCandidateSummary[] = [];

  for (const recipeId of recipeIds) {
    let run: RouteSkillStep[] = [];
    for (let skill = segment.startSkill; skill < segment.endSkill; skill += 1) {
      const step = evaluatedSkills[skill - routeStartSkill]?.candidates.find(
        ({ recipe }) => recipe.id === recipeId,
      )?.step;
      if (step !== undefined) {
        run.push(step);
      } else if (run.length > 0) {
        alternatives.push(aggregateAlternativeSteps(run));
        run = [];
      }
    }
    if (run.length > 0) alternatives.push(aggregateAlternativeSteps(run));
  }

  return alternatives;
}

function compareAlternatives(
  objective: RouteObjective,
  segmentSkillUps: number,
): (left: RouteCandidateSummary, right: RouteCandidateSummary) => number {
  return (left, right) =>
    scoreForAlternative(left, objective) *
      (segmentSkillUps / left.expectedSkillUps) -
      scoreForAlternative(right, objective) *
        (segmentSkillUps / right.expectedSkillUps) ||
    right.expectedSkillUps - left.expectedSkillUps ||
    left.expectedCrafts / left.expectedSkillUps -
      right.expectedCrafts / right.expectedSkillUps ||
    left.recipeId.localeCompare(right.recipeId);
}

function evidenceRank(level: RouteConfidenceLevel): number {
  if (level === "verified") return 0;
  if (level === "unverified") return 1;
  if (level === "fallback") return 2;
  if (level === "unknown") return 3;
  return 4;
}

function isTrainerAcquisition(
  acquisition: LevelingRecipeAcquisition,
): boolean {
  return acquisition === "automatic" || acquisition === "trainer";
}

function explainAlternative(
  selected: RouteCandidateSummary,
  alternative: RouteCandidateSummary,
  preset: RoutePreset,
  objective: RouteObjective,
): RouteAlternative {
  let lossReason: RouteAlternativeLossReason;
  let lossSummary: string;
  if (alternative.expectedSkillUps < selected.expectedSkillUps) {
    lossReason = "shorter-coverage";
    lossSummary = `Covers ${alternative.expectedSkillUps} of this step's ${selected.expectedSkillUps} skill points.`;
  } else if (evidenceRank(alternative.evidence.level) > evidenceRank(selected.evidence.level)) {
    lossReason = "weaker-evidence";
    lossSummary = "Uses weaker supporting evidence than the selected recipe.";
  } else if (
    preset === "trainer-friendly" &&
    isTrainerAcquisition(selected.evidence.acquisition) &&
    !isTrainerAcquisition(alternative.evidence.acquisition)
  ) {
    lossReason = "trainer-preference";
    lossSummary = "Trainer friendly prefers the selected supported trainer path.";
  } else {
    const selectedScore = scoreForAlternative(selected, objective);
    const alternativeScore = scoreForAlternative(alternative, objective);
    if (objective === "cost" && alternativeScore > selectedScore) {
      lossReason = "higher-expected-cost";
      lossSummary = "Has a higher supported expected cost over the comparable range.";
    } else if (objective === "crafts" && alternativeScore > selectedScore) {
      lossReason = "more-expected-crafts";
      lossSummary = "Needs more expected crafts per skill point over the comparable range.";
    } else if (objective === "materials" && alternativeScore > selectedScore) {
      lossReason = "more-materials";
      lossSummary = "Uses more expected material units per skill point over the comparable range.";
    } else {
      lossReason = "full-route-fit";
      lossSummary = "Lost on full-route fit after recipe continuity and acquisition friction were considered.";
    }
  }
  return { ...alternative, lossReason, lossSummary };
}

function recommendationFor(
  segment: RouteCandidateSummary,
  alternatives: readonly RouteAlternative[],
  preset: RoutePreset,
): RouteRecommendation {
  if (preset === "practical" && segment.evidence.level === "unknown") {
    return {
      reasons: ["practical-evidence-fallback"],
      summary: "No supported option completed this range, so Practical used this clearly labeled evidence gap as a last resort.",
    };
  }
  if (alternatives.length === 0) {
    return {
      reasons: ["only-eligible-recipe"],
      summary: "This was the only eligible recipe that could cover this range under the selected preset.",
    };
  }
  if (preset === "trainer-friendly") {
    return isTrainerAcquisition(segment.evidence.acquisition)
      ? {
          reasons: ["trainer-preference"],
          summary: "Selected because Trainer friendly prefers a supported trainer path before other acquisition sources.",
        }
      : {
          reasons: ["trainer-fallback"],
          summary: "The full-route tradeoff could not stay on a supported trainer path, so the preset chose its best supported fallback.",
        };
  }
  if (preset === "cheapest") {
    return {
      reasons: ["lowest-supported-cost"],
      summary: "Selected for the lowest supported full-route cost after Scarce-material avoidance.",
    };
  }
  if (preset === "fewest-crafts") {
    return {
      reasons: ["fewest-expected-crafts"],
      summary: "Selected to minimize expected crafts across the full route after Scarce-material avoidance.",
    };
  }
  if (preset === "fewest-materials") {
    return {
      reasons: ["fewest-materials"],
      summary: "Selected to minimize expected material units across the full route after Scarce-material avoidance.",
    };
  }
  if (preset === "experimental") {
    return segment.evidence.level === "unknown"
      ? {
          reasons: ["experimental-evidence-accepted"],
          summary: "Experimental accepted the labeled evidence gap because this recipe minimized expected crafts.",
        }
      : {
          reasons: ["fewest-expected-crafts"],
          summary: "Experimental allowed evidence risks, but this supported recipe still minimized expected crafts.",
        };
  }
  return {
    reasons: ["practical-balance"],
    summary: "Selected for the best full-route balance of expected crafts, recipe continuity, acquisition friction, Scarce avoidance, and evidence confidence.",
  };
}

function selectAlternatives(
  segment: RouteCandidateSummary,
  evaluatedSkills: readonly EvaluatedSkill[],
  input: OptimizeRouteInput,
  scarceRecipeIds: ReadonlySet<string>,
  preset: RoutePreset,
): readonly RouteAlternative[] {
  const runs = alternativeRunsFor(segment, evaluatedSkills, input.startSkill);
  const eligibleRuns = scarceRecipeIds.has(segment.recipeId)
    ? runs
    : runs.filter(({ recipeId }) => !scarceRecipeIds.has(recipeId));
  const objectiveLeaders = [...eligibleRuns]
    .sort(compareAlternatives(input.objective, segment.expectedSkillUps))
    .slice(0, 2);
  const materialLeaders = [...eligibleRuns]
    .sort(compareAlternatives("materials", segment.expectedSkillUps))
    .slice(0, 4);
  return [...objectiveLeaders, ...materialLeaders]
    .filter((alternative): alternative is RouteCandidateSummary => alternative !== undefined)
    .filter(
      (alternative, index, selected) =>
        selected.findIndex(
          (candidate) =>
            candidate.recipeId === alternative.recipeId &&
            candidate.startSkill === alternative.startSkill &&
            candidate.endSkill === alternative.endSkill,
        ) === index,
    )
    .slice(0, 6)
    .map((alternative) =>
      explainAlternative(segment, alternative, preset, input.objective),
    );
}

function segmentsFor(
  steps: readonly RouteSkillStep[],
  evaluatedSkills: readonly EvaluatedSkill[],
  input: OptimizeRouteInput,
  scarceRecipeIds: ReadonlySet<string>,
  preset: RoutePreset,
): readonly RouteSegment[] {
  const segments: RouteCandidateSummary[] = [];
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
      evidence: step.evidence,
      ...(step.expectedCostCopper === undefined
        ? {}
        : { expectedCostCopper: step.expectedCostCopper }),
    });
  }
  return segments.map((segment) => {
    const alternatives = selectAlternatives(
      segment,
      evaluatedSkills,
      input,
      scarceRecipeIds,
      preset,
    );
    return {
      ...segment,
      recommendation: recommendationFor(segment, alternatives, preset),
      alternatives,
    };
  });
}

function hasUnknownEvidenceCandidate(
  input: OptimizeRouteInput,
  skill: number,
): boolean {
  const context: RecipeEvaluationContext = {
    ...evaluationContext(input, skill, "practical"),
    allowUnknownAcquisition: true,
    allowUnknownAvailability: true,
  };
  return input.recipes.some((recipe) => {
    if (
      recipe.verificationStatus === "rejected" ||
      (recipe.acquisition !== "unknown" && recipe.availability !== "unknown")
    ) {
      return false;
    }
    return evaluateRecipeAtSkill(recipe, context).status === "eligible";
  });
}

function inferredLegacyPreset(input: OptimizeRouteInput): RoutePreset {
  if (input.objective === "cost") return "cheapest";
  if (input.objective === "materials") return "fewest-materials";
  if (input.confidencePolicy === "experimental") return "experimental";
  if (input.constraints?.trainerOnly) return "trainer-friendly";
  if (input.confidencePolicy === "supported-only") return "fewest-crafts";
  return "practical";
}

function blockedExplanation(
  preset: RoutePreset,
  skill: number,
  reason: BlockedRouteResult["reason"],
): string {
  const label = preset.replaceAll("-", " ");
  if (reason === "missing-price-data") {
    return `The ${label} preset stopped at skill ${skill} because every eligible recipe there is missing required market price data. Missing prices were not treated as zero.`;
  }
  if (reason === "unsupported-recipe-evidence") {
    return `The ${label} preset stopped at skill ${skill} because completing the route would cross its supported acquisition or availability boundary.`;
  }
  return `The ${label} preset stopped at skill ${skill} because no recipe satisfied the active skill, faction, knowledge, acquisition, and availability constraints.`;
}

export function optimizeLevelingRoute(
  input: OptimizeRouteInput,
): RouteOptimizationResult {
  const preset = input.preset ?? inferredLegacyPreset(input);
  const presetConfiguration = input.preset === undefined
    ? undefined
    : resolveRoutePreset(input.preset);
  const resolvedInput: OptimizeRouteInput = presetConfiguration === undefined
    ? input
    : {
        ...input,
        objective: presetConfiguration.objective,
        confidencePolicy: presetConfiguration.confidencePolicy,
        policy: presetConfiguration.policy,
      };
  assertSkillRange(resolvedInput.startSkill, resolvedInput.targetSkill);
  assertTargetSkillWithinBaseCap(
    resolvedInput.targetSkill,
    resolvedInput.maxBaseSkill,
  );
  validateRecipes(resolvedInput.recipes);
  const policy = resolvePolicy(resolvedInput.policy);
  const confidencePolicy = resolveConfidencePolicy(
    resolvedInput.confidencePolicy,
  );
  const scarceItemIds = new Set(resolvedInput.scarceItemIds ?? []);
  const scarceRecipeIds = new Set(
    resolvedInput.recipes
      .filter((recipe) =>
        recipe.reagents.some(({ itemId }) => scarceItemIds.has(itemId)),
      )
      .map(({ id }) => id),
  );
  const evaluatedSkills: EvaluatedSkill[] = [];
  for (
    let skill = resolvedInput.startSkill;
    skill < resolvedInput.targetSkill;
    skill += 1
  ) {
    evaluatedSkills.push(
      evaluateSkill(resolvedInput, skill, scarceItemIds, confidencePolicy),
    );
  }

  const firstBlocked = evaluatedSkills.find(
    ({ candidates }) => candidates.length === 0,
  );
  const effectiveTargetSkill = firstBlocked?.skill ?? resolvedInput.targetSkill;
  const steps = reconstructOptimalSteps(
    resolvedInput,
    evaluatedSkills,
    effectiveTargetSkill,
    policy,
    preset === "practical",
  );

  if (firstBlocked !== undefined) {
    const reason = firstBlocked.possibleSteps.length > 0 &&
      resolvedInput.objective === "cost"
      ? "missing-price-data"
      : hasUnknownEvidenceCandidate(resolvedInput, firstBlocked.skill)
        ? "unsupported-recipe-evidence"
        : "no-eligible-recipe";
    return {
      status: "blocked",
      preset,
      objective: resolvedInput.objective,
      confidencePolicy,
      startSkill: resolvedInput.startSkill,
      targetSkill: resolvedInput.targetSkill,
      blockedAtSkill: firstBlocked.skill,
      reason,
      explanation: blockedExplanation(preset, firstBlocked.skill, reason),
      steps,
      segments: segmentsFor(
        steps,
        evaluatedSkills,
        resolvedInput,
        scarceRecipeIds,
        preset,
      ),
      totals: totalsFor(steps, false),
    };
  }

  return {
    status: "complete",
    preset,
    objective: resolvedInput.objective,
    confidencePolicy,
    startSkill: resolvedInput.startSkill,
    targetSkill: resolvedInput.targetSkill,
    steps,
    segments: segmentsFor(
      steps,
      evaluatedSkills,
      resolvedInput,
      scarceRecipeIds,
      preset,
    ),
    totals: totalsFor(steps, true),
  };
}
