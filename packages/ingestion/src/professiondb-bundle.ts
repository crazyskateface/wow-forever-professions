import { importedBuildDatasetSchema, type ImportedBuildDataset } from "@forever-professions/contracts";

/** Bundle one build atomically; preserve existing Leatherworking recipe URLs. */
export function bundleProfessionDbSnapshots(datasets: readonly ImportedBuildDataset[]): ImportedBuildDataset {
  const first = datasets[0];
  if (first === undefined) throw new Error("At least one profession snapshot is required.");
  const sources = new Map<string, ImportedBuildDataset["sources"][number]>();
  const professions = new Set<string>();
  for (const dataset of datasets) {
    if (JSON.stringify(dataset.build) !== JSON.stringify(first.build)) {
      throw new Error("Profession snapshots must belong to the same build.");
    }
    for (const source of dataset.sources) {
      const existing = sources.get(source.id);
      if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(source)) {
        throw new Error(`Conflicting source ${source.id}.`);
      }
      sources.set(source.id, source);
    }
    for (const profession of dataset.professions) {
      if (professions.has(profession.id)) throw new Error(`Duplicate profession ${profession.id}.`);
      professions.add(profession.id);
    }
  }
  return importedBuildDatasetSchema.parse({
    build: first.build,
    sources: [...sources.values()],
    professions: datasets.flatMap(({ professions: entries }) => entries.map((profession) => ({
      ...profession,
      recipes: profession.recipes.map((recipe) => ({
        ...recipe,
        id: profession.id === "leatherworking" ? recipe.id : `${profession.id}:${recipe.id}`,
      })),
    }))),
  });
}
