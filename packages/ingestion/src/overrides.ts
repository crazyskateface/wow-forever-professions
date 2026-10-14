import {
  importedBuildDatasetSchema,
  importedRecipeOverridesSchema,
  type ImportedBuildDataset,
  type ImportedRecipeOverrides,
} from "@forever-professions/contracts";

export interface AppliedRecipeOverrides {
  readonly dataset: ImportedBuildDataset;
  readonly appliedRecipeIds: readonly string[];
}

export function applyRecipeOverrides(
  datasetInput: ImportedBuildDataset,
  overridesInput: ImportedRecipeOverrides,
): AppliedRecipeOverrides {
  const dataset = importedBuildDatasetSchema.parse(datasetInput);
  const overrides = importedRecipeOverridesSchema.parse(overridesInput);
  const sourceIds = new Set(dataset.sources.map(({ id }) => id));

  for (const source of overrides.sources) {
    if (sourceIds.has(source.id)) {
      throw new Error(`Override source ${source.id} already exists in the base dataset.`);
    }
    sourceIds.add(source.id);
  }

  const overridesByRecipeId = new Map(overrides.recipes.map((override) => [override.id, override]));
  if (overridesByRecipeId.size !== overrides.recipes.length) {
    throw new Error("Recipe override IDs must be unique.");
  }
  for (const override of overrides.recipes) {
    if (!sourceIds.has(override.sourceId)) {
      throw new Error(
        `Recipe override ${override.id} references missing source ${override.sourceId}.`,
      );
    }
  }

  const unmatchedIds = new Set(overridesByRecipeId.keys());
  const professions = dataset.professions.map((profession) => ({
    ...profession,
    recipes: profession.recipes.map((recipe) => {
      const override = overridesByRecipeId.get(recipe.id);
      if (!override) return recipe;

      unmatchedIds.delete(recipe.id);
      return {
        ...recipe,
        metadata: { ...recipe.metadata, ...override.metadata },
        ...(override.thresholds === undefined ? {} : { thresholds: override.thresholds }),
        sourceId: override.sourceId,
        verification: override.verification,
        ...(override.provenanceNotes === undefined
          ? {}
          : { provenanceNotes: override.provenanceNotes }),
      };
    }),
  }));

  if (unmatchedIds.size > 0) {
    throw new Error(
      `Recipe overrides did not match the base dataset: ${[...unmatchedIds].sort().join(", ")}.`,
    );
  }

  return {
    dataset: importedBuildDatasetSchema.parse({
      ...dataset,
      sources: [...dataset.sources, ...overrides.sources],
      professions,
    }),
    appliedRecipeIds: [...overridesByRecipeId.keys()].sort(),
  };
}
