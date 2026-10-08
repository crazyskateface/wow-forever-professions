import { Buffer } from "node:buffer";
import {
  PutObjectCommand,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import type {
  ImportedBuildDataset,
  NormalizedBuild,
} from "@forever-professions/contracts";
import { describe, expect, it } from "vitest";
import {
  ingestBuildDataset,
  S3RawDatasetStore,
  writeNormalizedBuild,
  type RawDatasetPutInput,
  type RawDatasetStore,
  type S3CommandSender,
  type SqlExecutor,
  type TransactionRunner,
} from "./index.js";

function emptyNormalizedBuild(version = "11.2.7"): NormalizedBuild {
  return {
    build: { id: "11.2.7.65000", version },
    sources: [],
    professions: [],
    items: [],
    recipes: [],
    recipeVersions: [],
    reagents: [],
    outputs: [],
    thresholds: [],
    provenance: [],
    verifications: [],
  };
}

describe("normalized build writer", () => {
  it("is idempotent and rejects a changed value under an existing key", async () => {
    let storedBuild: Record<string, unknown> | undefined;
    const queries: { sql: string; values: readonly unknown[] }[] = [];
    const database: SqlExecutor = {
      query: async (sql, values = []) => {
        queries.push({ sql, values });
        if (sql.startsWith("INSERT INTO wow_build") && !storedBuild) {
          storedBuild = {
            build_id: values[0],
            version: values[1],
            released_at: values[2],
            raw_object_key: values[4],
            raw_sha256: values[5],
          };
          return { rowCount: 1, rows: [] };
        }
        if (sql.startsWith("INSERT INTO wow_build")) return { rowCount: 0, rows: [] };
        if (sql.startsWith("SELECT build_id")) {
          return { rowCount: storedBuild ? 1 : 0, rows: storedBuild ? [storedBuild] : [] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    };
    const runner: TransactionRunner = {
      transaction: (work) => work(database),
    };
    const checksum = "a".repeat(64);

    await writeNormalizedBuild(runner, emptyNormalizedBuild(), "raw/build/a.json", checksum);
    await writeNormalizedBuild(runner, emptyNormalizedBuild(), "raw/build/a.json", checksum);

    await expect(
      writeNormalizedBuild(runner, emptyNormalizedBuild("11.2.8"), "raw/build/a.json", checksum),
    ).rejects.toThrow("immutable value stored in column version");
    expect(queries[0]?.sql).toContain("VALUES ($1, $2, $3, $4, $5, $6)");
    expect(queries[0]?.sql).not.toContain("11.2.7.65000");
    expect(queries[0]?.values[0]).toBe("11.2.7.65000");
  });
});

describe("raw S3 dataset store", () => {
  it("uses a checksum and an overwrite-preventing conditional write", async () => {
    const commands: PutObjectCommand[] = [];
    const sender: S3CommandSender = {
      send: async (command) => {
        commands.push(command);
        return {};
      },
    };
    const store = new S3RawDatasetStore(sender, {
      bucket: "raw-datasets",
      expectedBucketOwner: "123456789012",
    });
    const body = new TextEncoder().encode("exact raw bytes");
    const sha256 = "a".repeat(64);

    await expect(store.putIfAbsent({ key: "raw/build/a.json", body, sha256 })).resolves.toBe(
      "created",
    );

    const input = commands[0]?.input;
    expect(input?.IfNoneMatch).toBe("*");
    expect(input?.Body).toBe(body);
    expect(input?.ExpectedBucketOwner).toBe("123456789012");
    expect(input?.ChecksumSHA256).toBe(Buffer.from(sha256, "hex").toString("base64"));
    expect(input?.Metadata).toEqual({ sha256 });
  });

  it("treats an existing content-addressed object as success", async () => {
    const sender: S3CommandSender = {
      send: async () => {
        throw new S3ServiceException({
          name: "PreconditionFailed",
          message: "Object already exists",
          $fault: "client",
          $metadata: { httpStatusCode: 412 },
        });
      },
    };
    const store = new S3RawDatasetStore(sender, { bucket: "raw-datasets" });

    await expect(
      store.putIfAbsent({
        key: "raw/build/a.json",
        body: new Uint8Array(),
        sha256: "a".repeat(64),
      }),
    ).resolves.toBe("already-exists");
  });
});

describe("dataset ingestion ordering", () => {
  it("preserves schema-valid raw bytes before semantic normalization", async () => {
    const dataset: ImportedBuildDataset = {
      build: { id: "11.2.7.65000", version: "11.2.7" },
      sources: [{ id: "declared", kind: "client-data", label: "Client data" }],
      professions: [
        {
          id: "leatherworking",
          slug: "leatherworking",
          name: "Leatherworking",
          recipes: [
            {
              id: "recipe",
              name: "Recipe",
              thresholds: { orange: 1, yellow: 2, green: 3, gray: 4 },
              reagents: [],
              outputs: [
                {
                  item: { id: "output", name: "Output" },
                  minimumQuantity: 1,
                  maximumQuantity: 1,
                },
              ],
              sourceId: "missing",
              verification: { status: "unverified" },
            },
          ],
        },
      ],
    };
    const rawBytes = new TextEncoder().encode(JSON.stringify(dataset));
    let captured: RawDatasetPutInput | undefined;
    let transactions = 0;
    const rawStore: RawDatasetStore = {
      putIfAbsent: async (input) => {
        captured = input;
        return "created";
      },
    };
    const transactionRunner: TransactionRunner = {
      transaction: async () => {
        transactions += 1;
        throw new Error("Database should not be reached.");
      },
    };

    await expect(
      ingestBuildDataset({ rawBytes, rawStore, transactionRunner }),
    ).rejects.toThrow("unknown source");
    expect(captured?.body).toBe(rawBytes);
    expect(captured?.key).toMatch(/^raw\/11\.2\.7\.65000\/[a-f0-9]{64}\.json$/);
    expect(transactions).toBe(0);
  });
});
