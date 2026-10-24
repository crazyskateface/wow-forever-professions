export type ValidationRouteObjective = "cost" | "crafts" | "materials";
export type ValidationRouteConfidencePolicy =
  | "practical"
  | "supported-only"
  | "experimental";

export interface ComparableRouteStep {
  readonly skill: number;
  readonly recipeId: string;
  readonly recipeName: string;
  readonly expectedCrafts: number;
  readonly expectedMaterials: number;
}

export interface ComparableRouteSegment {
  readonly recipeId: string;
  readonly recipeName: string;
  readonly startSkill: number;
  readonly endSkill: number;
  readonly expectedCrafts: number;
  readonly expectedMaterials: number;
}

export interface ComparableCompleteRoute {
  readonly status: "complete";
  readonly objective: ValidationRouteObjective;
  readonly confidencePolicy: ValidationRouteConfidencePolicy;
  readonly startSkill: number;
  readonly targetSkill: number;
  readonly steps: readonly ComparableRouteStep[];
  readonly segments: readonly ComparableRouteSegment[];
  readonly totals: {
    readonly expectedSkillUps: number;
    readonly expectedCrafts: number;
    readonly expectedMaterials: number;
    readonly expectedCostCopper?: number | undefined;
  };
}

export interface ReferenceGuideReagent {
  readonly name: string;
  readonly quantity: number;
}

export interface ReferenceGuideStep {
  readonly startSkill: number;
  readonly endSkill: number;
  readonly recipeName: string;
  readonly expectedCrafts?: number | undefined;
  readonly reagents?: readonly ReferenceGuideReagent[] | undefined;
  readonly notes?: string | undefined;
}

export interface ReferenceGuide {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly professionId: string;
  readonly startSkill: number;
  readonly targetSkill: number;
  readonly optimizationIntent:
    | "fewest-crafts"
    | "material-cost-proxy"
    | "gold-cost"
    | "practical"
    | "unknown";
  readonly source: {
    readonly publisher: string;
    readonly url: string;
    readonly capturedAt: string;
    readonly sourceBuildId?: string | undefined;
    readonly notes?: string | undefined;
  };
  readonly assumptions: readonly string[];
  readonly steps: readonly ReferenceGuideStep[];
}

export interface ValidationRecipe {
  readonly id: string;
  readonly name: string;
  readonly learnSkill: number | null;
  readonly acquisition:
    | "automatic"
    | "trainer"
    | "vendor"
    | "quest"
    | "drop"
    | "reputation"
    | "unknown";
  readonly availability: "available" | "unavailable" | "unknown";
  readonly verificationStatus: "unverified" | "verified" | "rejected";
  readonly reagents: readonly {
    readonly itemId: string;
    readonly name: string;
    readonly quantity: number;
    readonly classificationLabel?: string | undefined;
  }[];
}

export type GuideDisagreementClassification =
  | "project-data-uncertainty"
  | "reference-recipe-unresolved"
  | "different-optimization-objective"
  | "requires-in-game-verification";

export interface GuideDisagreement {
  readonly startSkill: number;
  readonly endSkill: number;
  readonly generatedRecipeId: string;
  readonly generatedRecipeName: string;
  readonly referenceRecipeName: string;
  readonly classification: GuideDisagreementClassification;
  readonly reasons: readonly string[];
}

export interface RouteRecipeEvidence {
  readonly recipeId: string;
  readonly recipeName: string;
  readonly learnSkill: number | null;
  readonly acquisition: ValidationRecipe["acquisition"];
  readonly availability: ValidationRecipe["availability"];
  readonly verificationStatus: ValidationRecipe["verificationStatus"];
  readonly scarceReagents: readonly string[];
}

export interface RouteBaselineSegment {
  readonly recipeId: string;
  readonly recipeName: string;
  readonly startSkill: number;
  readonly endSkill: number;
  readonly expectedCrafts: number;
  readonly expectedMaterials: number;
  readonly evidence: RouteRecipeEvidence;
}

export interface MaterialComparison {
  readonly materialName: string;
  readonly generatedQuantity?: number | undefined;
  readonly referenceQuantity?: number | undefined;
  readonly referenceQuantityStatus: "complete" | "partial";
  readonly delta?: number | undefined;
}

export interface GuideRouteBaseline {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly professionId: string;
  readonly professionName: string;
  readonly recipeBuildId: string;
  readonly objective: ValidationRouteObjective;
  readonly confidencePolicy: ValidationRouteConfidencePolicy;
  readonly startSkill: number;
  readonly targetSkill: number;
  readonly totals: ComparableCompleteRoute["totals"];
  readonly segments: readonly RouteBaselineSegment[];
  readonly materials: readonly {
    readonly materialName: string;
    readonly quantity: number;
  }[];
}

export interface GuideValidationResult {
  readonly baseline: GuideRouteBaseline;
  readonly reference: ReferenceGuide;
  readonly summary: {
    readonly comparedSkills: number;
    readonly matchingSkills: number;
    readonly mismatchingSkills: number;
    readonly matchPercent: number;
    readonly generatedExpectedCrafts: number;
    readonly referenceExpectedCrafts?: number | undefined;
    readonly expectedCraftDelta?: number | undefined;
    readonly referenceMaterialsComplete: boolean;
    readonly unresolvedReferenceRecipes: readonly string[];
    readonly uncertainGeneratedRecipes: readonly string[];
    readonly scarceGeneratedRecipes: readonly string[];
    readonly shortGeneratedSegments: number;
    readonly longGeneratedSegments: number;
  };
  readonly disagreements: readonly GuideDisagreement[];
  readonly materials: readonly MaterialComparison[];
}

export interface CreateGuideValidationInput {
  readonly generatedAt: string;
  readonly professionId: string;
  readonly professionName: string;
  readonly recipeBuildId: string;
  readonly route: ComparableCompleteRoute;
  readonly recipes: readonly ValidationRecipe[];
  readonly reference: ReferenceGuide;
}

function normalizedName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function rounded(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function assertReferenceMatchesRoute(
  reference: ReferenceGuide,
  route: ComparableCompleteRoute,
  professionId: string,
): void {
  if (reference.professionId !== professionId) {
    throw new Error(
      `Reference profession ${reference.professionId} does not match ${professionId}.`,
    );
  }
  if (
    reference.startSkill !== route.startSkill ||
    reference.targetSkill !== route.targetSkill
  ) {
    throw new Error(
      `Reference range ${reference.startSkill}-${reference.targetSkill} does not match generated range ${route.startSkill}-${route.targetSkill}.`,
    );
  }

  let expectedStart = reference.startSkill;
  for (const step of reference.steps) {
    if (step.startSkill !== expectedStart || step.endSkill <= step.startSkill) {
      throw new Error(`Reference guide ${reference.id} has a gap or overlap at ${expectedStart}.`);
    }
    expectedStart = step.endSkill;
  }
  if (expectedStart !== reference.targetSkill) {
    throw new Error(`Reference guide ${reference.id} does not reach its target skill.`);
  }
}

function uniqueRecipesByName(
  recipes: readonly ValidationRecipe[],
): ReadonlyMap<string, ValidationRecipe | undefined> {
  const grouped = new Map<string, ValidationRecipe[]>();
  for (const recipe of recipes) {
    const key = normalizedName(recipe.name);
    grouped.set(key, [...(grouped.get(key) ?? []), recipe]);
  }
  return new Map(
    [...grouped.entries()].map(([key, matches]) => [
      key,
      matches.length === 1 ? matches[0] : undefined,
    ]),
  );
}

function evidenceFor(recipe: ValidationRecipe): RouteRecipeEvidence {
  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    learnSkill: recipe.learnSkill,
    acquisition: recipe.acquisition,
    availability: recipe.availability,
    verificationStatus: recipe.verificationStatus,
    scarceReagents: recipe.reagents
      .filter(({ classificationLabel }) =>
        classificationLabel?.trim().toLowerCase() === "scarce",
      )
      .map(({ name }) => name),
  };
}

function generatedMaterials(
  route: ComparableCompleteRoute,
  recipesById: ReadonlyMap<string, ValidationRecipe>,
): ReadonlyMap<string, { name: string; quantity: number }> {
  const totals = new Map<string, { name: string; quantity: number }>();
  for (const step of route.steps) {
    const recipe = recipesById.get(step.recipeId);
    if (recipe === undefined) {
      throw new Error(`Generated route references unknown recipe ${step.recipeId}.`);
    }
    for (const reagent of recipe.reagents) {
      const key = normalizedName(reagent.name);
      const current = totals.get(key)?.quantity ?? 0;
      totals.set(key, {
        name: reagent.name,
        quantity: current + reagent.quantity * step.expectedCrafts,
      });
    }
  }
  return totals;
}

function referenceMaterials(
  reference: ReferenceGuide,
): {
  readonly complete: boolean;
  readonly totals: ReadonlyMap<string, { name: string; quantity: number }>;
} {
  const totals = new Map<string, { name: string; quantity: number }>();
  for (const step of reference.steps) {
    for (const reagent of step.reagents ?? []) {
      const key = normalizedName(reagent.name);
      const current = totals.get(key)?.quantity ?? 0;
      totals.set(key, { name: reagent.name, quantity: current + reagent.quantity });
    }
  }
  return {
    complete: reference.steps.every(({ reagents }) => reagents !== undefined),
    totals,
  };
}

function referenceStepAt(
  reference: ReferenceGuide,
  skill: number,
): ReferenceGuideStep {
  const step = reference.steps.find(
    ({ startSkill, endSkill }) => skill >= startSkill && skill < endSkill,
  );
  if (step === undefined) {
    throw new Error(`Reference guide ${reference.id} has no step at skill ${skill}.`);
  }
  return step;
}

function classificationFor(
  generatedRecipe: ValidationRecipe,
  referenceRecipe: ValidationRecipe | undefined,
  routeObjective: ValidationRouteObjective,
  referenceIntent: ReferenceGuide["optimizationIntent"],
): { classification: GuideDisagreementClassification; reasons: readonly string[] } {
  const reasons: string[] = [];
  if (referenceRecipe === undefined) {
    return {
      classification: "reference-recipe-unresolved",
      reasons: ["The reference recipe name does not resolve uniquely in the imported catalog."],
    };
  }

  if (generatedRecipe.availability === "unknown") {
    reasons.push("Generated recipe availability is unknown.");
  }
  if (generatedRecipe.acquisition === "unknown") {
    reasons.push("Generated recipe acquisition is unknown.");
  }
  if (generatedRecipe.verificationStatus !== "verified") {
    reasons.push("Generated recipe is not Forever-verified.");
  }
  if (reasons.length > 0) {
    return { classification: "project-data-uncertainty", reasons };
  }

  const comparableIntent =
    (routeObjective === "crafts" && referenceIntent === "fewest-crafts") ||
    (routeObjective === "cost" && referenceIntent === "gold-cost");
  if (!comparableIntent) {
    return {
      classification: "different-optimization-objective",
      reasons: [
        `Generated objective is ${routeObjective}; reference intent is ${referenceIntent}.`,
      ],
    };
  }

  return {
    classification: "requires-in-game-verification",
    reasons: ["Both recipes resolve, but the disagreement needs gameplay or source review."],
  };
}

function disagreementsFor(
  route: ComparableCompleteRoute,
  reference: ReferenceGuide,
  recipesById: ReadonlyMap<string, ValidationRecipe>,
  recipesByName: ReadonlyMap<string, ValidationRecipe | undefined>,
): readonly GuideDisagreement[] {
  const disagreements: GuideDisagreement[] = [];
  for (const step of route.steps) {
    const referenceStep = referenceStepAt(reference, step.skill);
    const referenceRecipe = recipesByName.get(normalizedName(referenceStep.recipeName));
    if (referenceRecipe?.id === step.recipeId) {
      continue;
    }
    const generatedRecipe = recipesById.get(step.recipeId);
    if (generatedRecipe === undefined) {
      throw new Error(`Generated route references unknown recipe ${step.recipeId}.`);
    }
    const classified = classificationFor(
      generatedRecipe,
      referenceRecipe,
      route.objective,
      reference.optimizationIntent,
    );
    const previous = disagreements.at(-1);
    if (
      previous !== undefined &&
      previous.endSkill === step.skill &&
      previous.generatedRecipeId === step.recipeId &&
      normalizedName(previous.referenceRecipeName) ===
        normalizedName(referenceStep.recipeName) &&
      previous.classification === classified.classification &&
      previous.reasons.join("\n") === classified.reasons.join("\n")
    ) {
      disagreements[disagreements.length - 1] = {
        ...previous,
        endSkill: step.skill + 1,
      };
    } else {
      disagreements.push({
        startSkill: step.skill,
        endSkill: step.skill + 1,
        generatedRecipeId: step.recipeId,
        generatedRecipeName: step.recipeName,
        referenceRecipeName: referenceStep.recipeName,
        ...classified,
      });
    }
  }
  return disagreements;
}

function materialComparisons(
  generated: ReadonlyMap<string, { name: string; quantity: number }>,
  reference: ReadonlyMap<string, { name: string; quantity: number }>,
  referenceComplete: boolean,
): readonly MaterialComparison[] {
  return [...new Set([...generated.keys(), ...reference.keys()])]
    .map((key) => {
      const generatedMaterial = generated.get(key);
      const referenceMaterial = reference.get(key);
      const generatedQuantity = generatedMaterial?.quantity;
      const referenceQuantity = referenceMaterial?.quantity;
      const referenceQuantityStatus: MaterialComparison["referenceQuantityStatus"] =
        referenceComplete ? "complete" : "partial";
      return {
        materialName: generatedMaterial?.name ?? referenceMaterial!.name,
        referenceQuantityStatus,
        ...(generatedQuantity === undefined
          ? {}
          : { generatedQuantity: rounded(generatedQuantity) }),
        ...(referenceQuantity === undefined
          ? {}
          : { referenceQuantity: rounded(referenceQuantity) }),
        ...(
          !referenceComplete ||
          generatedQuantity === undefined ||
          referenceQuantity === undefined
          ? {}
          : { delta: rounded(generatedQuantity - referenceQuantity) }
        ),
      };
    })
    .sort((left, right) => {
      const leftMagnitude = Math.abs(left.delta ?? Number.POSITIVE_INFINITY);
      const rightMagnitude = Math.abs(right.delta ?? Number.POSITIVE_INFINITY);
      return rightMagnitude - leftMagnitude || left.materialName.localeCompare(right.materialName);
    });
}

function baselineSegment(
  segment: ComparableRouteSegment,
  recipesById: ReadonlyMap<string, ValidationRecipe>,
): RouteBaselineSegment {
  const recipe = recipesById.get(segment.recipeId);
  if (recipe === undefined) {
    throw new Error(`Generated route references unknown recipe ${segment.recipeId}.`);
  }
  return {
    recipeId: segment.recipeId,
    recipeName: segment.recipeName,
    startSkill: segment.startSkill,
    endSkill: segment.endSkill,
    expectedCrafts: rounded(segment.expectedCrafts),
    expectedMaterials: rounded(segment.expectedMaterials),
    evidence: evidenceFor(recipe),
  };
}

export function createGuideValidation(
  input: CreateGuideValidationInput,
): GuideValidationResult {
  assertReferenceMatchesRoute(input.reference, input.route, input.professionId);
  const recipesById = new Map(input.recipes.map((recipe) => [recipe.id, recipe]));
  const recipesByName = uniqueRecipesByName(input.recipes);
  const generatedMaterialTotals = generatedMaterials(input.route, recipesById);
  const referenceMaterialAccounting = referenceMaterials(input.reference);
  const baselineSegments = input.route.segments.map((segment) =>
    baselineSegment(segment, recipesById),
  );
  const disagreements = disagreementsFor(
    input.route,
    input.reference,
    recipesById,
    recipesByName,
  );
  const mismatchingSkills = disagreements.reduce(
    (total, disagreement) =>
      total + disagreement.endSkill - disagreement.startSkill,
    0,
  );
  const comparedSkills = input.route.targetSkill - input.route.startSkill;
  const referenceCrafts = input.reference.steps.every(
    ({ expectedCrafts }) => expectedCrafts !== undefined,
  )
    ? input.reference.steps.reduce(
        (total, { expectedCrafts }) => total + expectedCrafts!,
        0,
      )
    : undefined;
  const unresolvedReferenceRecipes = [
    ...new Set(
      input.reference.steps
        .filter(
          ({ recipeName }) =>
            recipesByName.get(normalizedName(recipeName)) === undefined,
        )
        .map(({ recipeName }) => recipeName),
    ),
  ];
  const uncertainGeneratedRecipes = [
    ...new Set(
      baselineSegments
        .filter(
          ({ evidence }) =>
            evidence.acquisition === "unknown" ||
            evidence.availability === "unknown" ||
            evidence.verificationStatus !== "verified",
        )
        .map(({ recipeName }) => recipeName),
    ),
  ];
  const scarceGeneratedRecipes = [
    ...new Set(
      baselineSegments
        .filter(({ evidence }) => evidence.scarceReagents.length > 0)
        .map(({ recipeName }) => recipeName),
    ),
  ];

  return {
    baseline: {
      schemaVersion: 1,
      generatedAt: input.generatedAt,
      professionId: input.professionId,
      professionName: input.professionName,
      recipeBuildId: input.recipeBuildId,
      objective: input.route.objective,
      confidencePolicy: input.route.confidencePolicy,
      startSkill: input.route.startSkill,
      targetSkill: input.route.targetSkill,
      totals: input.route.totals,
      segments: baselineSegments,
      materials: [...generatedMaterialTotals.values()]
        .map(({ name, quantity }) => ({
          materialName: name,
          quantity: rounded(quantity),
        }))
        .sort((left, right) => left.materialName.localeCompare(right.materialName)),
    },
    reference: input.reference,
    summary: {
      comparedSkills,
      matchingSkills: comparedSkills - mismatchingSkills,
      mismatchingSkills,
      matchPercent: rounded(((comparedSkills - mismatchingSkills) / comparedSkills) * 100),
      generatedExpectedCrafts: rounded(input.route.totals.expectedCrafts),
      ...(referenceCrafts === undefined
        ? {}
        : {
            referenceExpectedCrafts: rounded(referenceCrafts),
            expectedCraftDelta: rounded(input.route.totals.expectedCrafts - referenceCrafts),
          }),
      referenceMaterialsComplete: referenceMaterialAccounting.complete,
      unresolvedReferenceRecipes,
      uncertainGeneratedRecipes,
      scarceGeneratedRecipes,
      shortGeneratedSegments: baselineSegments.filter(
        ({ startSkill, endSkill }) => endSkill - startSkill <= 2,
      ).length,
      longGeneratedSegments: baselineSegments.filter(
        ({ startSkill, endSkill }) => endSkill - startSkill >= 40,
      ).length,
    },
    disagreements,
    materials: materialComparisons(
      generatedMaterialTotals,
      referenceMaterialAccounting.totals,
      referenceMaterialAccounting.complete,
    ),
  };
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function displayed(value: number | undefined): string {
  return value === undefined ? "—" : String(rounded(value));
}

function displayedReferenceMaterial(material: MaterialComparison): string {
  if (material.referenceQuantity === undefined) {
    return material.referenceQuantityStatus === "partial" ? "unknown (partial)" : "—";
  }
  const quantity = displayed(material.referenceQuantity);
  return material.referenceQuantityStatus === "partial"
    ? `${quantity} (partial)`
    : quantity;
}

export function renderGuideValidationMarkdown(result: GuideValidationResult): string {
  const { baseline, reference, summary } = result;
  const lines = [
    `# Guide validation: ${baseline.professionName} ${baseline.startSkill}–${baseline.targetSkill}`,
    "",
    `Generated from recipe build \`${baseline.recipeBuildId}\` at ${baseline.generatedAt} using the \`${baseline.confidencePolicy}\` confidence policy.`,
    `Compared with [${reference.source.publisher}](${reference.source.url}), captured ${reference.source.capturedAt}${reference.source.sourceBuildId === undefined ? "" : ` and labeled for build \`${reference.source.sourceBuildId}\``}.`,
    "",
    "> This comparison is diagnostic evidence, not an automatic recipe-data correction. A third-party route can use different prices, accessibility assumptions, or unsupported game facts.",
    "",
    "## Summary",
    "",
    `- Skill decisions compared: ${summary.comparedSkills}`,
    `- Matching decisions: ${summary.matchingSkills} (${summary.matchPercent}%)`,
    `- Mismatching decisions: ${summary.mismatchingSkills}`,
    `- Generated expected crafts: ${summary.generatedExpectedCrafts}`,
    `- Reference expected crafts: ${displayed(summary.referenceExpectedCrafts)}`,
    `- Expected craft delta: ${displayed(summary.expectedCraftDelta)}`,
    `- Generated route segments: ${baseline.segments.length}`,
    `- Short generated segments (2 skill points or fewer): ${summary.shortGeneratedSegments}`,
    `- Long generated segments (40 skill points or more): ${summary.longGeneratedSegments}`,
    `- Generated recipes with uncertain evidence: ${summary.uncertainGeneratedRecipes.length}`,
    `- Generated recipes using Scarce reagents: ${summary.scarceGeneratedRecipes.length}`,
    `- Unresolved reference recipe names: ${summary.unresolvedReferenceRecipes.length}`,
    "",
    "## Interpretation queue",
    "",
    "Review `project-data-uncertainty` first: those disagreements can expose missing acquisition or availability evidence. `different-optimization-objective` means the routes are not directly optimizing the same quantity. Every proposed data correction still requires a supported source.",
    "",
    "| Skill | Generated route | Reference route | Provisional classification | Reasons |",
    "| --- | --- | --- | --- | --- |",
    ...result.disagreements.map((entry) =>
      `| ${entry.startSkill}–${entry.endSkill} | ${markdownCell(entry.generatedRecipeName)} | ${markdownCell(entry.referenceRecipeName)} | \`${entry.classification}\` | ${markdownCell(entry.reasons.join(" "))} |`,
    ),
    "",
    "## Generated route baseline",
    "",
    "| Skill | Recipe | Expected crafts | Acquisition | Availability | Verification | Scarce reagents |",
    "| --- | --- | ---: | --- | --- | --- | --- |",
    ...baseline.segments.map((segment) =>
      `| ${segment.startSkill}–${segment.endSkill} | ${markdownCell(segment.recipeName)} | ${displayed(segment.expectedCrafts)} | ${segment.evidence.acquisition} | ${segment.evidence.availability} | ${segment.evidence.verificationStatus} | ${segment.evidence.scarceReagents.length === 0 ? "—" : markdownCell(segment.evidence.scarceReagents.join(", "))} |`,
    ),
    "",
    "## Material comparison",
    "",
    summary.referenceMaterialsComplete
      ? "Positive deltas mean the generated route uses more. A missing side means the material appears in only one route; this can also reflect different intermediate-crafting accounting."
      : "Reference quantities are partial because one or more reference steps omit reagent data. Partial quantities are labeled and deltas are suppressed.",
    "",
    "| Material | Generated | Reference | Delta |",
    "| --- | ---: | ---: | ---: |",
    ...result.materials.map((material) =>
      `| ${markdownCell(material.materialName)} | ${displayed(material.generatedQuantity)} | ${displayedReferenceMaterial(material)} | ${displayed(material.delta)} |`,
    ),
    "",
    "## Reference route",
    "",
    `Reference optimization intent: \`${reference.optimizationIntent}\`.`,
    "",
    ...reference.assumptions.map((assumption) => `- ${assumption}`),
    "",
    "| Skill | Recipe | Expected crafts |",
    "| --- | --- | ---: |",
    ...reference.steps.map((step) =>
      `| ${step.startSkill}–${step.endSkill} | ${markdownCell(step.recipeName)} | ${displayed(step.expectedCrafts)} |`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}
