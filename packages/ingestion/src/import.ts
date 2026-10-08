import { createHash } from "node:crypto";
import {
  importedBuildDatasetSchema,
  type ImportedBuildDataset,
} from "@forever-professions/contracts";
import type { DsqlBatchOptions } from "./batching.js";
import { createRawDatasetKey, normalizeBuildDataset } from "./index.js";
import type { RawDatasetPutStatus, RawDatasetStore } from "./raw-store.js";
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
}

export interface IngestBuildDatasetResult extends NormalizedBuildWriteResult {
  readonly buildId: string;
  readonly rawObjectKey: string;
  readonly rawSha256: string;
  readonly rawObjectStatus: RawDatasetPutStatus;
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

  return {
    buildId: imported.build.id,
    rawObjectKey,
    rawSha256,
    rawObjectStatus,
    batches: writeResult.batches,
  };
}
