import type { NormalizedBuild } from "@forever-professions/contracts";
import {
  compareRecipeBuilds,
  type RecipeComparisonType,
} from "./recipe-changes.js";

export interface ReleaseRowCounts {
  readonly baseRecipes: number;
  readonly targetRecipes: number;
  readonly recipeChanges: number;
  readonly targetClientItems: number;
  readonly targetQualityItems: number;
  readonly targetItemStats: number;
}

const RELEASE_COUNT_COLUMNS = {
  baseRecipes: "base_recipes",
  targetRecipes: "target_recipes",
  recipeChanges: "recipe_changes",
  targetClientItems: "target_client_items",
  targetQualityItems: "target_quality_items",
  targetItemStats: "target_item_stats",
} as const;

function nonnegativeInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Release count ${label} must be a nonnegative safe integer.`);
  }
  return parsed;
}

export function expectedReleaseRowCounts(
  base: NormalizedBuild,
  target: NormalizedBuild,
  comparisonType: RecipeComparisonType,
): ReleaseRowCounts {
  const comparison = compareRecipeBuilds(base, target, {
    comparisonType,
    includeUnchanged: true,
  });
  return {
    baseRecipes: base.recipeVersions.length,
    targetRecipes: target.recipeVersions.length,
    recipeChanges: comparison.summary.total,
    targetClientItems: target.items.filter(({ clientData }) => clientData !== undefined)
      .length,
    targetQualityItems: target.items.filter(
      ({ clientData }) => clientData?.qualityId !== undefined,
    ).length,
    targetItemStats: target.items.reduce(
      (total, { clientData }) => total + (clientData?.stats?.length ?? 0),
      0,
    ),
  };
}

export function persistedReleaseRowCounts(
  row: Readonly<Record<string, unknown>>,
): ReleaseRowCounts {
  return Object.fromEntries(
    Object.entries(RELEASE_COUNT_COLUMNS).map(([key, column]) => [
      key,
      nonnegativeInteger(row[column], column),
    ]),
  ) as unknown as ReleaseRowCounts;
}

export function assertReleaseRowCounts(
  expected: ReleaseRowCounts,
  persisted: ReleaseRowCounts,
): void {
  const mismatches = Object.keys(RELEASE_COUNT_COLUMNS).flatMap((key) => {
    const typedKey = key as keyof ReleaseRowCounts;
    return expected[typedKey] === persisted[typedKey]
      ? []
      : [`${typedKey}: expected ${expected[typedKey]}, found ${persisted[typedKey]}`];
  });
  if (mismatches.length > 0) {
    throw new Error(
      `Persisted release data is incomplete or inconsistent (${mismatches.join("; ")}).`,
    );
  }
}
