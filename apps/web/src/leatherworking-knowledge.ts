import type {
  ProfessionFixture,
  Recipe,
  RecipeAcquisition,
  RecipeSourceKind,
} from "@forever-professions/contracts";

export type LeatherworkingKnowledgePageId =
  | "overview"
  | "changes"
  | "trainers"
  | "merchants-favor"
  | "camping"
  | "specializations"
  | "source-vendor"
  | "source-quest"
  | "source-reputation"
  | "source-drop";

export interface KnowledgePageDefinition {
  readonly description: string;
  readonly eyebrow: string;
  readonly href: string;
  readonly label: string;
  readonly title: string;
}

export const LEATHERWORKING_KNOWLEDGE_PAGES: Readonly<
  Record<LeatherworkingKnowledgePageId, KnowledgePageDefinition>
> = {
  overview: {
    description: "Build-scoped Leatherworking facts, evidence limits, and direct paths into the Forever planner.",
    eyebrow: "Leatherworking field guide",
    href: "/leatherworking",
    label: "Overview",
    title: "Leatherworking in Forever",
  },
  changes: {
    description: "The stored Classic Era to Forever comparison, with explicit New, Updated, Removed, and Unchanged totals.",
    eyebrow: "Stored build comparison",
    href: "/leatherworking/changes",
    label: "What changed",
    title: "What changed in Forever",
  },
  trainers: {
    description: "Trainer-taught recipes and learning ranks supported by the current Forever evidence snapshot.",
    eyebrow: "Acquisition guide",
    href: "/leatherworking/trainers",
    label: "Trainers",
    title: "Leatherworking trainers and ranks",
  },
  "merchants-favor": {
    description: "What the current dataset can and cannot establish about Merchant's Favor and Leatherworking.",
    eyebrow: "Evidence review",
    href: "/leatherworking/merchants-favor",
    label: "Merchant's Favor",
    title: "Merchant's Favor and Leatherworking",
  },
  camping: {
    description: "The supported evidence boundary for camping-related Leatherworking interactions.",
    eyebrow: "Evidence review",
    href: "/leatherworking/camping",
    label: "Camping",
    title: "Camping and Leatherworking",
  },
  specializations: {
    description: "Build-scoped specialization requirements without inferring missing specialization names or unlock rules.",
    eyebrow: "Recipe requirements",
    href: "/leatherworking/specializations",
    label: "Specializations",
    title: "Leatherworking specializations",
  },
  "source-vendor": {
    description: "Vendor-acquired Leatherworking recipes supported by the current Forever catalog.",
    eyebrow: "Recipe sources",
    href: "/leatherworking/sources/vendor",
    label: "Vendor recipes",
    title: "Vendor recipe sources",
  },
  "source-quest": {
    description: "Quest-acquired Leatherworking recipes supported by the current Forever catalog.",
    eyebrow: "Recipe sources",
    href: "/leatherworking/sources/quest",
    label: "Quest recipes",
    title: "Quest recipe sources",
  },
  "source-reputation": {
    description: "Reputation-acquired Leatherworking recipes supported by the current Forever catalog.",
    eyebrow: "Recipe sources",
    href: "/leatherworking/sources/reputation",
    label: "Reputation recipes",
    title: "Reputation recipe sources",
  },
  "source-drop": {
    description: "Dropped Leatherworking recipes supported by the current Forever catalog.",
    eyebrow: "Recipe sources",
    href: "/leatherworking/sources/drop",
    label: "Drop recipes",
    title: "Dropped recipe sources",
  },
};

const PATH_TO_PAGE = new Map(
  Object.entries(LEATHERWORKING_KNOWLEDGE_PAGES).map(([id, definition]) => [
    definition.href,
    id as LeatherworkingKnowledgePageId,
  ]),
);

export function leatherworkingKnowledgePageFromPath(
  pathname: string,
): LeatherworkingKnowledgePageId | undefined {
  const normalized = pathname.replace(/\/+$/, "").toLowerCase() || "/";
  return PATH_TO_PAGE.get(normalized);
}

export interface KnowledgeCatalogSummary {
  readonly availableRecipes: number;
  readonly foreverSourceEvidenceRecipes: number;
  readonly knownAcquisitionRecipes: number;
  readonly knownAvailabilityRecipes: number;
  readonly knownLearningRankRecipes: number;
  readonly sourceEvidenceRecipes: number;
  readonly specializationRecipes: number;
  readonly teachingItemRecipes: number;
  readonly totalRecipes: number;
  readonly unverifiedRecipes: number;
}

export function isIllustrativeKnowledgeCatalog(
  profession: ProfessionFixture,
): boolean {
  return profession.recipes.length > 0 && profession.recipes.every(
    ({ provenance }) => provenance.source === "fixture",
  );
}

export function summarizeKnowledgeCatalog(
  profession: ProfessionFixture,
): KnowledgeCatalogSummary {
  const { recipes } = profession;
  return {
    availableRecipes: recipes.filter(({ availability }) => availability === "available").length,
    foreverSourceEvidenceRecipes: recipes.filter(
      ({ sourceDataOrigin }) => sourceDataOrigin === "forever",
    ).length,
    knownAcquisitionRecipes: recipes.filter(
      ({ acquisition }) => acquisition !== "unknown",
    ).length,
    knownAvailabilityRecipes: recipes.filter(
      ({ availability }) => availability !== "unknown",
    ).length,
    knownLearningRankRecipes: recipes.filter(({ learnSkill }) => learnSkill !== null).length,
    sourceEvidenceRecipes: recipes.filter(({ sourceKinds }) => (sourceKinds?.length ?? 0) > 0).length,
    specializationRecipes: recipes.filter(
      ({ specializationSpellId }) => specializationSpellId !== null,
    ).length,
    teachingItemRecipes: recipes.filter(
      ({ teachingItemId }) => teachingItemId !== undefined && teachingItemId !== null,
    ).length,
    totalRecipes: recipes.length,
    unverifiedRecipes: recipes.filter(
      ({ provenance }) => provenance.verification.status === "unverified",
    ).length,
  };
}

export function primaryRecipesForAcquisition(
  profession: ProfessionFixture,
  acquisition: RecipeAcquisition,
): readonly Recipe[] {
  return profession.recipes
    .filter((recipe) => recipe.acquisition === acquisition)
    .sort((left, right) =>
      (left.learnSkill ?? Number.POSITIVE_INFINITY) -
        (right.learnSkill ?? Number.POSITIVE_INFINITY) ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id),
    );
}

export function supplementalRecipesForSourceKind(
  profession: ProfessionFixture,
  sourceKind: RecipeSourceKind,
  primaryAcquisition: RecipeAcquisition,
): readonly Recipe[] {
  return profession.recipes
    .filter((recipe) =>
      recipe.acquisition !== primaryAcquisition && recipe.sourceKinds?.includes(sourceKind),
    )
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export function recipeKnowledgeHref(
  acquisition: RecipeAcquisition,
  recipeId?: string,
): string | undefined {
  const hash = recipeId === undefined ? "" : `#${encodeURIComponent(recipeId)}`;
  if (acquisition === "trainer") return `/leatherworking/trainers${hash}`;
  if (
    acquisition === "vendor" ||
    acquisition === "quest" ||
    acquisition === "reputation" ||
    acquisition === "drop"
  ) {
    return `/leatherworking/sources/${acquisition}${hash}`;
  }
  if (acquisition === "automatic") return `/leatherworking${hash}`;
  return undefined;
}

export function plannerRecipeHref(recipeId: string): string {
  const query = new URLSearchParams({ recipe: recipeId, view: "recipes" });
  return `/?${query.toString()}`;
}
