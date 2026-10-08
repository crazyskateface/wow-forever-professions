import {
  importedBuildDatasetSchema,
  type ImportedBuildDataset,
} from "@forever-professions/contracts";

export type DataQualitySeverity = "error" | "warning" | "info";

export interface DataQualityFinding {
  readonly code: string;
  readonly severity: DataQualitySeverity;
  readonly count: number;
  readonly message: string;
  readonly examples: readonly string[];
}

export interface DataQualityReport {
  readonly buildId: string;
  readonly professions: number;
  readonly recipes: number;
  readonly items: number;
  readonly sourceKinds: Readonly<Record<string, number>>;
  readonly verificationStatuses: Readonly<Record<string, number>>;
  readonly findings: readonly DataQualityFinding[];
}

function counts(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function finding(
  code: string,
  severity: DataQualitySeverity,
  message: string,
  recipeIds: readonly string[],
): DataQualityFinding | undefined {
  if (recipeIds.length === 0) return undefined;
  return {
    code,
    severity,
    count: recipeIds.length,
    message,
    examples: recipeIds.slice(0, 8),
  };
}

export function auditImportedBuildDataset(input: ImportedBuildDataset): DataQualityReport {
  const dataset = importedBuildDatasetSchema.parse(input);
  const recipes = dataset.professions.flatMap((profession) => profession.recipes);
  const itemIds = new Set(
    recipes.flatMap((recipe) => [
      ...recipe.reagents.map(({ item }) => item.id),
      ...recipe.outputs.map(({ item }) => item.id),
    ]),
  );
  const sourceById = new Map(dataset.sources.map((source) => [source.id, source] as const));
  const unverified: string[] = [];
  const rejected: string[] = [];
  const fallback: string[] = [];
  const incompleteReview: string[] = [];
  const prematureReview: string[] = [];
  const rejectedWithoutNotes: string[] = [];
  const missingNames: string[] = [];
  const borrowedRanks: string[] = [];
  const provisionalOutputs: string[] = [];

  for (const recipe of recipes) {
    const source = sourceById.get(recipe.sourceId);
    if (source?.kind === "classic-fallback") fallback.push(recipe.id);
    if (recipe.verification.status === "unverified") unverified.push(recipe.id);
    if (recipe.verification.status === "rejected") rejected.push(recipe.id);
    if (
      recipe.verification.status !== "unverified" &&
      (!recipe.verification.verifiedAt || !recipe.verification.verifiedBy)
    ) {
      incompleteReview.push(recipe.id);
    }
    if (
      recipe.verification.status === "unverified" &&
      (recipe.verification.verifiedAt || recipe.verification.verifiedBy)
    ) {
      prematureReview.push(recipe.id);
    }
    if (
      recipe.verification.status === "rejected" &&
      !recipe.verification.notes
    ) {
      rejectedWithoutNotes.push(recipe.id);
    }
    if (
      [...recipe.reagents, ...recipe.outputs].some(({ item }) =>
        item.name.startsWith("Unknown item #"),
      )
    ) {
      missingNames.push(recipe.id);
    }
    if (recipe.provenanceNotes?.includes("required skill was deliberately not imported")) {
      borrowedRanks.push(recipe.id);
    }
    if (recipe.verification.notes?.includes("Output quantity is provisionally one")) {
      provisionalOutputs.push(recipe.id);
    }
  }

  const findings = [
    finding(
      "incomplete-review-metadata",
      "error",
      "Reviewed records require both reviewer identity and review time.",
      incompleteReview,
    ),
    finding(
      "premature-review-metadata",
      "error",
      "Unverified records must not carry metadata that implies a completed review.",
      prematureReview,
    ),
    finding(
      "missing-rejection-rationale",
      "error",
      "Rejected records require notes identifying the conflicting evidence.",
      rejectedWithoutNotes,
    ),
    finding(
      "rejected-recipe",
      "error",
      "Rejected recipe records must not enter the product catalog.",
      rejected,
    ),
    finding(
      "classic-fallback",
      "warning",
      "Classic fallback records are not authoritative for Forever.",
      fallback,
    ),
    finding(
      "unverified-recipe",
      "warning",
      "Recipe records still require Forever-specific verification.",
      unverified,
    ),
    finding(
      "missing-item-name",
      "warning",
      "At least one referenced item has no English name in the item snapshot.",
      missingNames,
    ),
    finding(
      "borrowed-required-skill-omitted",
      "warning",
      "A Vanilla-borrowed learning rank was omitted instead of being presented as Forever data.",
      borrowedRanks,
    ),
    finding(
      "provisional-output-quantity",
      "warning",
      "Output quantity is provisionally one because the source snapshot does not encode stack size.",
      provisionalOutputs,
    ),
  ].filter((value): value is DataQualityFinding => value !== undefined);

  return {
    buildId: dataset.build.id,
    professions: dataset.professions.length,
    recipes: recipes.length,
    items: itemIds.size,
    sourceKinds: counts(dataset.sources.map(({ kind }) => kind)),
    verificationStatuses: counts(recipes.map(({ verification }) => verification.status)),
    findings,
  };
}

export function renderDataQualityMarkdown(report: DataQualityReport): string {
  const lines = [
    `# Data quality report: ${report.buildId}`,
    "",
    `Professions: ${report.professions} · Recipes: ${report.recipes} · Items: ${report.items}`,
    "",
    "## Sources",
    "",
    ...Object.entries(report.sourceKinds).map(([kind, count]) => `- ${kind}: ${count}`),
    "",
    "## Verification",
    "",
    ...Object.entries(report.verificationStatuses).map(
      ([status, count]) => `- ${status}: ${count}`,
    ),
    "",
    "## Findings",
    "",
  ];

  if (report.findings.length === 0) {
    lines.push("No findings.", "");
  } else {
    for (const entry of report.findings) {
      lines.push(
        `### ${entry.severity.toUpperCase()} · ${entry.code} (${entry.count})`,
        "",
        entry.message,
        "",
        `Examples: ${entry.examples.map((id) => `\`${id}\``).join(", ")}`,
        "",
      );
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
