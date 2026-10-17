import {
  importedBuildDatasetSchema,
  normalizedBuildSchema,
  type ImportedBuildDataset,
  type ItemModel,
  type NormalizedBuild,
} from "@forever-professions/contracts";

export {
  createDsqlBatches,
  DSQL_TRANSACTION_LIMITS,
  type DsqlBatchOptions,
} from "./batching.js";
export * from "./catalog.js";
export * from "./cli.js";
export * from "./dsql.js";
export * from "./data-quality.js";
export * from "./database-roles.js";
export * from "./import.js";
export * from "./item-icons.js";
export * from "./migrations.js";
export * from "./professiondb.js";
export * from "./overrides.js";
export * from "./postgres.js";
export * from "./raw-store.js";
export * from "./recipe-change-store.js";
export * from "./recipe-changes.js";
export * from "./release-validation.js";
export * from "./writer.js";

const SAFE_KEY_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

export interface ChangedRecipe {
  readonly recipeId: string;
  readonly previousName: string;
  readonly currentName: string;
  readonly changedFields: readonly string[];
}

export interface RecipeBuildDiff {
  readonly previousBuildId: string;
  readonly currentBuildId: string;
  readonly added: readonly RecipeDiffEntry[];
  readonly removed: readonly RecipeDiffEntry[];
  readonly changed: readonly ChangedRecipe[];
}

export interface RecipeDiffEntry {
  readonly recipeId: string;
  readonly name: string;
}

interface RecipeSnapshot {
  readonly recipeId: string;
  readonly name: string;
  readonly professionId: string;
  readonly thresholds: string;
  readonly reagents: string;
  readonly outputs: string;
  readonly metadata: string;
  readonly sourceKind: string;
  readonly verificationStatus: string;
}

function stableSort<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right)));
}

function registerItem(items: Map<string, ItemModel>, item: ItemModel): void {
  const existing = items.get(item.id);
  if (!existing) {
    items.set(item.id, item);
    return;
  }

  if (
    existing.name !== item.name ||
    existing.gameId !== item.gameId ||
    existing.itemClassId !== item.itemClassId ||
    existing.itemSubClassId !== item.itemSubClassId ||
    existing.inventoryType !== item.inventoryType ||
    JSON.stringify(existing.classification) !== JSON.stringify(item.classification) ||
    JSON.stringify(existing.clientData) !== JSON.stringify(item.clientData)
  ) {
    throw new Error(`Item ${item.id} has conflicting definitions in the same build.`);
  }
}

export function createRawDatasetKey(buildId: string, sha256: string): string {
  if (!SAFE_KEY_SEGMENT.test(buildId)) {
    throw new Error("Build IDs used in raw object keys must be safe path segments.");
  }
  if (!SHA256_HEX.test(sha256)) {
    throw new Error("Raw dataset checksums must be lowercase SHA-256 hex strings.");
  }

  return `raw/${buildId}/${sha256}.json`;
}

export function normalizeBuildDataset(input: ImportedBuildDataset): NormalizedBuild {
  const parsed = importedBuildDatasetSchema.parse(input);
  const sourceIds = new Set(parsed.sources.map(({ id }) => id));
  if (sourceIds.size !== parsed.sources.length) {
    throw new Error("Source IDs must be unique within a build dataset.");
  }

  const professions = [];
  const items = new Map<string, ItemModel>();
  const recipes = [];
  const recipeVersions = [];
  const recipeMetadata = [];
  const reagents = [];
  const outputs = [];
  const thresholds = [];
  const provenance = [];
  const verifications = [];
  const recipeIds = new Set<string>();
  const professionIds = new Set<string>();

  for (const profession of parsed.professions) {
    if (professionIds.has(profession.id)) {
      throw new Error(`Profession ID ${profession.id} appears more than once.`);
    }
    professionIds.add(profession.id);
    professions.push({ id: profession.id, slug: profession.slug, name: profession.name });

    for (const recipe of profession.recipes) {
      if (recipeIds.has(recipe.id)) {
        throw new Error(`Recipe ID ${recipe.id} appears more than once in build ${parsed.build.id}.`);
      }
      recipeIds.add(recipe.id);

      if (!sourceIds.has(recipe.sourceId)) {
        throw new Error(`Recipe ${recipe.id} references unknown source ${recipe.sourceId}.`);
      }

      const recipeVersionId = `${recipe.id}@${parsed.build.id}`;
      const verificationId = `${recipeVersionId}:verification`;
      const provenanceId = `${recipeVersionId}:provenance`;
      const reagentItemIds = new Set(recipe.reagents.map(({ item }) => item.id));
      const outputItemIds = new Set(recipe.outputs.map(({ item }) => item.id));

      if (reagentItemIds.size !== recipe.reagents.length) {
        throw new Error(`Recipe ${recipe.id} contains duplicate reagent items.`);
      }
      if (outputItemIds.size !== recipe.outputs.length) {
        throw new Error(`Recipe ${recipe.id} contains duplicate output items.`);
      }

      recipes.push({ id: recipe.id, professionId: profession.id });
      recipeVersions.push({
        id: recipeVersionId,
        recipeId: recipe.id,
        buildId: parsed.build.id,
        name: recipe.name,
      });
      recipeMetadata.push({
        recipeVersionId,
        ...recipe.metadata,
      });
      thresholds.push({ recipeVersionId, ...recipe.thresholds });
      verifications.push({ id: verificationId, ...recipe.verification });
      provenance.push({
        id: provenanceId,
        recipeVersionId,
        sourceId: recipe.sourceId,
        verificationId,
        ...(recipe.provenanceNotes === undefined ? {} : { notes: recipe.provenanceNotes }),
      });

      for (const reagent of recipe.reagents) {
        registerItem(items, reagent.item);
        reagents.push({
          recipeVersionId,
          itemId: reagent.item.id,
          quantity: reagent.quantity,
        });
      }

      for (const output of recipe.outputs) {
        registerItem(items, output.item);
        outputs.push({
          recipeVersionId,
          itemId: output.item.id,
          minimumQuantity: output.minimumQuantity,
          maximumQuantity: output.maximumQuantity,
        });
      }
    }
  }

  return normalizedBuildSchema.parse({
    build: parsed.build,
    sources: stableSort(parsed.sources, ({ id }) => id),
    professions: stableSort(professions, ({ id }) => id),
    items: stableSort([...items.values()], ({ id }) => id),
    recipes: stableSort(recipes, ({ id }) => id),
    recipeVersions: stableSort(recipeVersions, ({ id }) => id),
    recipeMetadata: stableSort(recipeMetadata, ({ recipeVersionId }) => recipeVersionId),
    reagents: stableSort(reagents, ({ recipeVersionId, itemId }) => `${recipeVersionId}:${itemId}`),
    outputs: stableSort(outputs, ({ recipeVersionId, itemId }) => `${recipeVersionId}:${itemId}`),
    thresholds: stableSort(thresholds, ({ recipeVersionId }) => recipeVersionId),
    provenance: stableSort(provenance, ({ id }) => id),
    verifications: stableSort(verifications, ({ id }) => id),
  });
}

function snapshotRecipes(build: NormalizedBuild): Map<string, RecipeSnapshot> {
  const professionByRecipe = new Map(
    build.recipes.map(({ id, professionId }) => [id, professionId] as const),
  );
  const thresholdsByVersion = new Map(
    build.thresholds.map((threshold) => [threshold.recipeVersionId, threshold] as const),
  );
  const provenanceByVersionId = new Map(
    build.provenance.map((record) => [record.recipeVersionId, record] as const),
  );
  const metadataByVersionId = new Map(
    build.recipeMetadata.map((metadata) => [metadata.recipeVersionId, metadata] as const),
  );
  const verificationById = new Map(
    build.verifications.map((verification) => [verification.id, verification] as const),
  );
  const sourceById = new Map(build.sources.map((source) => [source.id, source] as const));

  return new Map(
    build.recipeVersions.map((version) => {
      const threshold = thresholdsByVersion.get(version.id);
      const provenance = provenanceByVersionId.get(version.id);
      const metadata = metadataByVersionId.get(version.id);
      const verification = provenance
        ? verificationById.get(provenance.verificationId)
        : undefined;
      const source = provenance ? sourceById.get(provenance.sourceId) : undefined;

      if (!threshold || !metadata || !provenance || !verification || !source) {
        throw new Error(`Recipe version ${version.id} is missing normalized detail records.`);
      }

      const recipeReagents = stableSort(
        build.reagents.filter(({ recipeVersionId }) => recipeVersionId === version.id),
        ({ itemId }) => itemId,
      );
      const recipeOutputs = stableSort(
        build.outputs.filter(({ recipeVersionId }) => recipeVersionId === version.id),
        ({ itemId }) => itemId,
      );

      return [
        version.recipeId,
        {
          recipeId: version.recipeId,
          name: version.name,
          professionId: professionByRecipe.get(version.recipeId) ?? "",
          thresholds: JSON.stringify({
            orange: threshold.orange,
            yellow: threshold.yellow,
            green: threshold.green,
            gray: threshold.gray,
          }),
          reagents: JSON.stringify(
            recipeReagents.map(({ itemId, quantity }) => ({ itemId, quantity })),
          ),
          outputs: JSON.stringify(
            recipeOutputs.map(({ itemId, minimumQuantity, maximumQuantity }) => ({
              itemId,
              minimumQuantity,
              maximumQuantity,
            })),
          ),
          metadata: JSON.stringify({
            spellId: metadata.spellId,
            learnSkill: metadata.learnSkill,
            acquisition: metadata.acquisition,
            faction: metadata.faction,
            specializationSpellId: metadata.specializationSpellId,
            cooldownSeconds: metadata.cooldownSeconds,
            availability: metadata.availability,
          }),
          sourceKind: source.kind,
          verificationStatus: verification.status,
        },
      ] as const;
    }),
  );
}

export function diffBuilds(previous: NormalizedBuild, current: NormalizedBuild): RecipeBuildDiff {
  const previousRecipes = snapshotRecipes(normalizedBuildSchema.parse(previous));
  const currentRecipes = snapshotRecipes(normalizedBuildSchema.parse(current));
  const added: RecipeDiffEntry[] = [];
  const removed: RecipeDiffEntry[] = [];
  const changed: ChangedRecipe[] = [];

  for (const [recipeId, currentRecipe] of currentRecipes) {
    const previousRecipe = previousRecipes.get(recipeId);
    if (!previousRecipe) {
      added.push({ recipeId, name: currentRecipe.name });
      continue;
    }

    const changedFields = (
      [
        "name",
        "professionId",
        "thresholds",
        "reagents",
        "outputs",
        "metadata",
        "sourceKind",
        "verificationStatus",
      ] as const
    ).filter((field) => previousRecipe[field] !== currentRecipe[field]);

    if (changedFields.length > 0) {
      changed.push({
        recipeId,
        previousName: previousRecipe.name,
        currentName: currentRecipe.name,
        changedFields,
      });
    }
  }

  for (const [recipeId, previousRecipe] of previousRecipes) {
    if (!currentRecipes.has(recipeId)) {
      removed.push({ recipeId, name: previousRecipe.name });
    }
  }

  return {
    previousBuildId: previous.build.id,
    currentBuildId: current.build.id,
    added: stableSort(added, ({ recipeId }) => recipeId),
    removed: stableSort(removed, ({ recipeId }) => recipeId),
    changed: stableSort(changed, ({ recipeId }) => recipeId),
  };
}

export function renderBuildDiffMarkdown(diff: RecipeBuildDiff): string {
  const lines = [
    `# Recipe changes: ${diff.previousBuildId} → ${diff.currentBuildId}`,
    "",
    `Added: ${diff.added.length} · Changed: ${diff.changed.length} · Removed: ${diff.removed.length}`,
    "",
  ];

  const sections: readonly [string, readonly string[]][] = [
    ["Added recipes", diff.added.map(({ recipeId, name }) => `- ${name} (\`${recipeId}\`)`)],
    [
      "Changed recipes",
      diff.changed.map(
        ({ recipeId, previousName, currentName, changedFields }) =>
          `- ${previousName === currentName ? currentName : `${previousName} → ${currentName}`} (\`${recipeId}\`): ${changedFields.join(", ")}`,
      ),
    ],
    ["Removed recipes", diff.removed.map(({ recipeId, name }) => `- ${name} (\`${recipeId}\`)`)],
  ];

  for (const [heading, entries] of sections) {
    lines.push(`## ${heading}`, "", ...(entries.length > 0 ? entries : ["None."]), "");
  }

  return lines.join("\n").trimEnd() + "\n";
}
