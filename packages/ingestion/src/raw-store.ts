import { Buffer } from "node:buffer";
import {
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

const SHA256_HEX = /^[a-f0-9]{64}$/;

export type RawDatasetPutStatus = "created" | "already-exists";

export interface RawDatasetPutInput {
  readonly key: string;
  readonly body: Uint8Array;
  readonly sha256: string;
  readonly contentType?: string;
}

export interface RawDatasetStore {
  putIfAbsent(input: RawDatasetPutInput): Promise<RawDatasetPutStatus>;
}

export interface S3CommandSender {
  send(command: PutObjectCommand): Promise<unknown>;
}

export interface S3RawDatasetStoreOptions {
  readonly bucket: string;
  readonly expectedBucketOwner?: string;
}

export interface CreateS3RawDatasetStoreOptions extends S3RawDatasetStoreOptions {
  readonly region: string;
  readonly maxAttempts?: number;
  readonly credentials?: S3ClientConfig["credentials"];
}

export class S3RawDatasetStore implements RawDatasetStore {
  readonly #client: S3CommandSender;
  readonly #bucket: string;
  readonly #expectedBucketOwner: string | undefined;

  constructor(client: S3CommandSender, options: S3RawDatasetStoreOptions) {
    if (options.bucket.trim().length === 0) throw new Error("An S3 bucket name is required.");
    this.#client = client;
    this.#bucket = options.bucket;
    this.#expectedBucketOwner = options.expectedBucketOwner;
  }

  async putIfAbsent(input: RawDatasetPutInput): Promise<RawDatasetPutStatus> {
    if (input.key.length === 0) throw new Error("A raw dataset object key is required.");
    if (!SHA256_HEX.test(input.sha256)) {
      throw new Error("Raw dataset checksums must be lowercase SHA-256 hex strings.");
    }

    const command = new PutObjectCommand({
      Bucket: this.#bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType ?? "application/json",
      ChecksumSHA256: Buffer.from(input.sha256, "hex").toString("base64"),
      Metadata: { sha256: input.sha256 },
      IfNoneMatch: "*",
      ...(this.#expectedBucketOwner === undefined
        ? {}
        : { ExpectedBucketOwner: this.#expectedBucketOwner }),
    });

    try {
      await this.#client.send(command);
      return "created";
    } catch (error) {
      if (
        error instanceof S3ServiceException &&
        (error.name === "PreconditionFailed" || error.$metadata.httpStatusCode === 412)
      ) {
        return "already-exists";
      }
      throw error;
    }
  }
}

export function createS3RawDatasetStore(
  options: CreateS3RawDatasetStoreOptions,
): S3RawDatasetStore {
  if (options.region.trim().length === 0) throw new Error("An AWS region is required.");
  const client = new S3Client({
    region: options.region,
    maxAttempts: options.maxAttempts ?? 5,
    ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
  });
  return new S3RawDatasetStore(client, options);
}
