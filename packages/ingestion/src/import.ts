import { createHash } from "node:crypto";
import {
  importedBuildDatasetSchema,
  type ImportedBuildDataset,
  type NormalizedBuild,
} from "@forever-professions/contracts";
import type { DsqlBatchOptions } from "./batching.js";
import { createRawDatasetKey, normalizeBuildDataset } from "./index.js";
import type { RawDatasetPutStatus, RawDatasetStore } from "./raw-store.js";
import {
  generateAndStoreRecipeComparison,
  type RecipeBuildComparisonWriteResult,
} from "./recipe-change-store.js";
import type { RecipeComparisonType } from "./recipe-changes.js";
import {
  writeNormalizedBuild,
  type NormalizedBuildWriteResult,
  type TransactionRunner,
} from "./writer.js";

export interface IngestBuildDatasetOptions extends DsqlBatchOptions {
  readonly rawBytes: Uint8Array;
  readonly rawStore: RawDatasetStore;
  readonly transactionRunner: TransactionRunner;
  readonly importedAt?: string;
  readonly compareAgainst?: readonly {
    readonly build: NormalizedBuild;
    readonly comparisonType: RecipeComparisonType;
  }[];
}

export interface IngestBuildDatasetResult extends NormalizedBuildWriteResult {
  readonly buildId: string;
  readonly rawObjectKey: string;
  readonly rawSha256: string;
  readonly rawObjectStatus: RawDatasetPutStatus;
  readonly comparisons: readonly (RecipeBuildComparisonWriteResult & {
    readonly comparisonType: RecipeComparisonType;
    readonly baseBuildId: string;
    readonly targetBuildId: string;
  })[];
}

export function parseRawDatasetBytes(rawBytes: Uint8Array): ImportedBuildDataset {
  const json = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
  return importedBuildDatasetSchema.parse(JSON.parse(json));
}

export async function ingestBuildDataset(
  options: IngestBuildDatasetOptions,
): Promise<IngestBuildDatasetResult> {
  const imported = parseRawDatasetBytes(options.rawBytes);
  const rawSha256 = createHash("sha256").update(options.rawBytes).digest("hex");
  const rawObjectKey = createRawDatasetKey(imported.build.id, rawSha256);

  const rawObjectStatus = await options.rawStore.putIfAbsent({
    key: rawObjectKey,
    body: options.rawBytes,
    sha256: rawSha256,
  });

  const normalized = normalizeBuildDataset(imported);
  const writeResult = await writeNormalizedBuild(
    options.transactionRunner,
    normalized,
    rawObjectKey,
    rawSha256,
    {
      ...(options.importedAt === undefined ? {} : { importedAt: options.importedAt }),
      ...(options.maximumRows === undefined ? {} : { maximumRows: options.maximumRows }),
      ...(options.maximumBytes === undefined ? {} : { maximumBytes: options.maximumBytes }),
    },
  );
  const comparisons = [];
  for (const requested of options.compareAgainst ?? []) {
    const stored = await generateAndStoreRecipeComparison(
      options.transactionRunner,
      requested.build,
      normalized,
      {
        comparisonType: requested.comparisonType,
        ...(options.importedAt === undefined ? {} : { createdAt: options.importedAt }),
        ...(options.maximumRows === undefined ? {} : { maximumRows: options.maximumRows }),
        ...(options.maximumBytes === undefined ? {} : { maximumBytes: options.maximumBytes }),
      },
    );
    comparisons.push({
      comparisonId: stored.comparisonId,
      batches: stored.batches,
      comparisonType: requested.comparisonType,
      baseBuildId: requested.build.build.id,
      targetBuildId: normalized.build.id,
    });
  }

  return {
    buildId: imported.build.id,
    rawObjectKey,
    rawSha256,
    rawObjectStatus,
    batches: writeResult.batches,
    comparisons,
  };
}
