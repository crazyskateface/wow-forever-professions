import {
  normalizedBuildSchema,
  type DataSourceKind,
  type NormalizedBuild,
  type VerificationStatus,
} from "@forever-professions/contracts";

export const RECIPE_CHANGE_TYPES = ["NEW", "UPDATED", "REMOVED", "UNCHANGED"] as const;
export type RecipeChangeType = (typeof RECIPE_CHANGE_TYPES)[number];

export const RECIPE_COMPARISON_TYPES = [
  "CLASSIC_TO_FOREVER",
  "FOREVER_BUILD_TO_BUILD",
] as const;
export type RecipeComparisonType = (typeof RECIPE_COMPARISON_TYPES)[number];

export const RECIPE_COMPARABLE_FIELDS = [
  "name",
  "reagents",
  "outputs",
  "orangeSkill",
  "yellowSkill",
  "greenSkill",
  "graySkill",
  "learnSkill",
  "acquisition",
  "faction",
  "specializationSpellId",
  "cooldownSeconds",
  "availability",
] as const;
export type RecipeComparableField = (typeof RECIPE_COMPARABLE_FIELDS)[number];

export interface RecipeChangeIdentity {
  readonly professionId: string;
  readonly spellId: number;
}

export interface RecipeChangeItem {
  readonly itemId: string;
  readonly gameItemId?: number;
  readonly name: string;
  readonly itemClassId?: number;
  readonly itemSubClassId?: number;
  readonly inventoryType?: string;
}

export interface RecipeChangeReagent extends RecipeChangeItem {
  readonly quantity: number;
}

export interface RecipeChangeOutput extends RecipeChangeItem {
  readonly minimumQuantity: number;
  readonly maximumQuantity: number;
}

export interface RecipeChangeProvenance {
  readonly sourceId: string;
  readonly source: DataSourceKind;
  readonly sourceLabel: string;
  readonly sourceUrl?: string;
  readonly verificationStatus: VerificationStatus;
  readonly verifiedAt?: string;
  readonly verifiedBy?: string;
  readonly notes?: string;
}

export interface RecipeComparisonSnapshot {
  readonly recipeId: string;
  readonly identity: RecipeChangeIdentity;
  readonly professionName: string;
  readonly name: string;
  readonly reagents: readonly RecipeChangeReagent[];
  readonly outputs: readonly RecipeChangeOutput[];
  readonly orangeSkill: number;
  readonly yellowSkill: number;
  readonly greenSkill: number;
  readonly graySkill: number;
  readonly learnSkill: number | null;
  readonly borrowedLearnSkill?: number | null;
  readonly acquisition: string;
  readonly teachingItemId?: number | null;
  readonly sourceKinds?: readonly ("trainer" | "vendor" | "quest" | "container" | "drop")[];
  readonly sourceDataOrigin?: "forever" | "classic" | "classic-borrowed" | "unknown";
  readonly hiddenStatus?: boolean | null;
  readonly hiddenDataOrigin?: "forever" | "classic" | "classic-borrowed" | "unknown";
  readonly orangeSkillKnown?: boolean;
  readonly faction: string;
  readonly specializationSpellId: number | null;
  readonly cooldownSeconds: number | null;
  readonly availability: string;
  readonly provenance: RecipeChangeProvenance;
}

export type RecipeComparableValue =
  | string
  | number
  | null
  | readonly RecipeChangeReagent[]
  | readonly RecipeChangeOutput[];

export interface RecipeFieldChange {
  readonly before: RecipeComparableValue;
  readonly after: RecipeComparableValue;
}

export interface RecipeChange {
  readonly identity: RecipeChangeIdentity;
  readonly professionName: string;
  readonly name: string;
  readonly changeType: RecipeChangeType;
  readonly changedFields: Readonly<Partial<Record<RecipeComparableField, RecipeFieldChange>>>;
  readonly base?: RecipeComparisonSnapshot;
  readonly target?: RecipeComparisonSnapshot;
}

export interface RecipeChangeCounts {
  readonly new: number;
  readonly updated: number;
  readonly removed: number;
  readonly unchanged: number;
  readonly total: number;
}

export interface ProfessionRecipeChangeSummary extends RecipeChangeCounts {
  readonly professionId: string;
  readonly professionName: string;
}

export interface RecipeBuildComparison {
  readonly baseBuildId: string;
  readonly targetBuildId: string;
  readonly comparisonType: RecipeComparisonType;
  readonly summary: RecipeChangeCounts;
  readonly professionSummaries: readonly ProfessionRecipeChangeSummary[];
  readonly changes: readonly RecipeChange[];
}

export interface CompareRecipeBuildsOptions {
  readonly comparisonType: RecipeComparisonType;
  readonly includeUnchanged?: boolean;
}

interface MutableRecipeChangeCounts {
  new: number;
  updated: number;
  removed: number;
  unchanged: number;
  total: number;
}

function createEmptyCounts(): MutableRecipeChangeCounts {
  return { new: 0, updated: 0, removed: 0, unchanged: 0, total: 0 };
}

function identityKey({ professionId, spellId }: RecipeChangeIdentity): string {
  return JSON.stringify([professionId, spellId]);
}

function compareIdentity(left: RecipeChangeIdentity, right: RecipeChangeIdentity): number {
  const professionOrder = left.professionId.localeCompare(right.professionId);
  return professionOrder === 0 ? left.spellId - right.spellId : professionOrder;
}

function compareItemId(
  left: { readonly itemId: string },
  right: { readonly itemId: string },
): number {
  return left.itemId.localeCompare(right.itemId);
}

function buildRecipeSnapshots(build: NormalizedBuild): Map<string, RecipeComparisonSnapshot> {
  const parsed = normalizedBuildSchema.parse(build);
  const recipeById = new Map(parsed.recipes.map((recipe) => [recipe.id, recipe] as const));
  const professionById = new Map(
    parsed.professions.map((profession) => [profession.id, profession] as const),
  );
  const itemById = new Map(parsed.items.map((item) => [item.id, item] as const));
  const metadataByVersionId = new Map(
    parsed.recipeMetadata.map((metadata) => [metadata.recipeVersionId, metadata] as const),
  );
  const thresholdsByVersionId = new Map(
    parsed.thresholds.map((thresholds) => [thresholds.recipeVersionId, thresholds] as const),
  );
  const provenanceByVersionId = new Map(
    parsed.provenance.map((provenance) => [provenance.recipeVersionId, provenance] as const),
  );
  const sourceById = new Map(parsed.sources.map((source) => [source.id, source] as const));
  const verificationById = new Map(
    parsed.verifications.map((verification) => [verification.id, verification] as const),
  );
  const snapshots = new Map<string, RecipeComparisonSnapshot>();

  for (const version of parsed.recipeVersions) {
    const recipe = recipeById.get(version.recipeId);
    const metadata = metadataByVersionId.get(version.id);
    const thresholds = thresholdsByVersionId.get(version.id);
    const provenanceRecord = provenanceByVersionId.get(version.id);
    const source = provenanceRecord ? sourceById.get(provenanceRecord.sourceId) : undefined;
    const verification = provenanceRecord
      ? verificationById.get(provenanceRecord.verificationId)
      : undefined;
    const profession = recipe ? professionById.get(recipe.professionId) : undefined;

    if (!recipe || !metadata || !thresholds || !provenanceRecord || !source || !verification) {
      throw new Error(`Recipe version ${version.id} is missing normalized detail records.`);
    }
    if (!profession) {
      throw new Error(`Recipe ${recipe.id} references unknown profession ${recipe.professionId}.`);
    }

    const identity = { professionId: recipe.professionId, spellId: metadata.spellId };
    const key = identityKey(identity);
    if (snapshots.has(key)) {
      throw new Error(
        `Build ${parsed.build.id} contains duplicate recipe identity ${recipe.professionId}:${metadata.spellId}.`,
      );
    }

    const reagents = parsed.reagents
      .filter(({ recipeVersionId }) => recipeVersionId === version.id)
      .map(({ itemId, quantity }) => {
        const item = itemById.get(itemId);
        if (!item) throw new Error(`Recipe version ${version.id} references unknown item ${itemId}.`);
        return {
          itemId,
          ...(item.gameId === undefined ? {} : { gameItemId: item.gameId }),
          name: item.name,
          ...(item.itemClassId === undefined ? {} : { itemClassId: item.itemClassId }),
          ...(item.itemSubClassId === undefined
            ? {}
            : { itemSubClassId: item.itemSubClassId }),
          ...(item.inventoryType === undefined ? {} : { inventoryType: item.inventoryType }),
          quantity,
        };
      })
      .sort(compareItemId);
    const outputs = parsed.outputs
      .filter(({ recipeVersionId }) => recipeVersionId === version.id)
      .map(({ itemId, minimumQuantity, maximumQuantity }) => {
        const item = itemById.get(itemId);
        if (!item) throw new Error(`Recipe version ${version.id} references unknown item ${itemId}.`);
        return {
          itemId,
          ...(item.gameId === undefined ? {} : { gameItemId: item.gameId }),
          name: item.name,
          ...(item.itemClassId === undefined ? {} : { itemClassId: item.itemClassId }),
          ...(item.itemSubClassId === undefined
            ? {}
            : { itemSubClassId: item.itemSubClassId }),
          ...(item.inventoryType === undefined ? {} : { inventoryType: item.inventoryType }),
          minimumQuantity,
          maximumQuantity,
        };
      })
      .sort(compareItemId);

    snapshots.set(key, {
      recipeId: recipe.id,
      identity,
      professionName: profession.name,
      name: version.name,
      reagents,
      outputs,
      orangeSkill: thresholds.orange,
      yellowSkill: thresholds.yellow,
      greenSkill: thresholds.green,
      graySkill: thresholds.gray,
      learnSkill: metadata.learnSkill,
      ...(metadata.borrowedLearnSkill === undefined
        ? {}
        : { borrowedLearnSkill: metadata.borrowedLearnSkill }),
      acquisition: metadata.acquisition,
      ...(metadata.teachingItemId === undefined
        ? {}
        : { teachingItemId: metadata.teachingItemId }),
      ...(metadata.sourceKinds === undefined ? {} : { sourceKinds: metadata.sourceKinds }),
      ...(metadata.sourceDataOrigin === undefined
        ? {}
        : { sourceDataOrigin: metadata.sourceDataOrigin }),
      ...(metadata.hiddenStatus === undefined ? {} : { hiddenStatus: metadata.hiddenStatus }),
      ...(metadata.hiddenDataOrigin === undefined
        ? {}
        : { hiddenDataOrigin: metadata.hiddenDataOrigin }),
      ...(metadata.orangeSkillKnown === undefined
        ? {}
        : { orangeSkillKnown: metadata.orangeSkillKnown }),
      faction: metadata.faction,
      specializationSpellId: metadata.specializationSpellId,
      cooldownSeconds: metadata.cooldownSeconds,
      availability: metadata.availability,
      provenance: {
        sourceId: source.id,
        source: source.kind,
        sourceLabel: source.label,
        ...(source.url === undefined ? {} : { sourceUrl: source.url }),
        verificationStatus: verification.status,
        ...(verification.verifiedAt === undefined ? {} : { verifiedAt: verification.verifiedAt }),
        ...(verification.verifiedBy === undefined ? {} : { verifiedBy: verification.verifiedBy }),
        ...(provenanceRecord.notes === undefined ? {} : { notes: provenanceRecord.notes }),
      },
    });
  }

  return snapshots;
}

function fieldValue(
  snapshot: RecipeComparisonSnapshot,
  field: RecipeComparableField,
): RecipeComparableValue {
  return snapshot[field];
}

function comparisonValue(
  snapshot: RecipeComparisonSnapshot,
  field: RecipeComparableField,
): unknown {
  if (field === "reagents") {
    return snapshot.reagents.map(
      ({ itemId, gameItemId, name, quantity }) => ({ itemId, gameItemId, name, quantity }),
    );
  }
  if (field === "outputs") {
    return snapshot.outputs.map(
      ({ itemId, gameItemId, name, minimumQuantity, maximumQuantity }) => ({
        itemId,
        gameItemId,
        name,
        minimumQuantity,
        maximumQuantity,
      }),
    );
  }
  return fieldValue(snapshot, field);
}

function targetFieldHasComparableEvidence(
  target: RecipeComparisonSnapshot,
  field: RecipeComparableField,
): boolean {
  if (field === "learnSkill") return target.learnSkill !== null;
  if (field === "acquisition") return target.acquisition !== "unknown";
  if (field === "availability") return target.availability !== "unknown";
  if (field === "orangeSkill") return target.orangeSkillKnown !== false;
  return true;
}

function compareFields(
  base: RecipeComparisonSnapshot,
  target: RecipeComparisonSnapshot,
): Readonly<Partial<Record<RecipeComparableField, RecipeFieldChange>>> {
  const changes: Partial<Record<RecipeComparableField, RecipeFieldChange>> = {};

  for (const field of RECIPE_COMPARABLE_FIELDS) {
    if (!targetFieldHasComparableEvidence(target, field)) continue;
    const before = fieldValue(base, field);
    const after = fieldValue(target, field);
    if (
      JSON.stringify(comparisonValue(base, field)) !==
      JSON.stringify(comparisonValue(target, field))
    ) {
      changes[field] = { before, after };
    }
  }

  return changes;
}

function incrementCounts(counts: MutableRecipeChangeCounts, changeType: RecipeChangeType): void {
  counts.total += 1;
  if (changeType === "NEW") counts.new += 1;
  if (changeType === "UPDATED") counts.updated += 1;
  if (changeType === "REMOVED") counts.removed += 1;
  if (changeType === "UNCHANGED") counts.unchanged += 1;
}

export function compareRecipeBuilds(
  baseBuild: NormalizedBuild,
  targetBuild: NormalizedBuild,
  options: CompareRecipeBuildsOptions,
): RecipeBuildComparison {
  const base = normalizedBuildSchema.parse(baseBuild);
  const target = normalizedBuildSchema.parse(targetBuild);
  const baseSnapshots = buildRecipeSnapshots(base);
  const targetSnapshots = buildRecipeSnapshots(target);
  const keys = [...new Set([...baseSnapshots.keys(), ...targetSnapshots.keys()])].sort((left, right) => {
    const leftSnapshot = baseSnapshots.get(left) ?? targetSnapshots.get(left);
    const rightSnapshot = baseSnapshots.get(right) ?? targetSnapshots.get(right);
    if (!leftSnapshot || !rightSnapshot) return left.localeCompare(right);
    return compareIdentity(leftSnapshot.identity, rightSnapshot.identity);
  });
  const summary = createEmptyCounts();
  const professionCounts = new Map<
    string,
    { professionName: string; counts: MutableRecipeChangeCounts }
  >();
  const changes: RecipeChange[] = [];

  for (const key of keys) {
    const baseSnapshot = baseSnapshots.get(key);
    const targetSnapshot = targetSnapshots.get(key);
    if (!baseSnapshot && !targetSnapshot) continue;
    const snapshot = targetSnapshot ?? baseSnapshot;
    if (!snapshot) continue;

    const changedFields =
      baseSnapshot && targetSnapshot ? compareFields(baseSnapshot, targetSnapshot) : {};
    const changeType: RecipeChangeType = !baseSnapshot
      ? "NEW"
      : !targetSnapshot
        ? "REMOVED"
        : Object.keys(changedFields).length > 0
          ? "UPDATED"
          : "UNCHANGED";

    incrementCounts(summary, changeType);
    const profession = professionCounts.get(snapshot.identity.professionId) ?? {
      professionName: snapshot.professionName,
      counts: createEmptyCounts(),
    };
    incrementCounts(profession.counts, changeType);
    professionCounts.set(snapshot.identity.professionId, profession);

    if (changeType !== "UNCHANGED" || options.includeUnchanged === true) {
      changes.push({
        identity: snapshot.identity,
        professionName: snapshot.professionName,
        name: targetSnapshot?.name ?? baseSnapshot?.name ?? snapshot.name,
        changeType,
        changedFields,
        ...(baseSnapshot === undefined ? {} : { base: baseSnapshot }),
        ...(targetSnapshot === undefined ? {} : { target: targetSnapshot }),
      });
    }
  }

  const professionSummaries = [...professionCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([professionId, { professionName, counts }]) => ({
      professionId,
      professionName,
      ...counts,
    }));

  return {
    baseBuildId: base.build.id,
    targetBuildId: target.build.id,
    comparisonType: options.comparisonType,
    summary,
    professionSummaries,
    changes,
  };
}
