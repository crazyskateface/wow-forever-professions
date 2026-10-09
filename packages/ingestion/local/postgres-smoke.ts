import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import type { ImportedBuildDataset } from "@forever-professions/contracts";
import {
  ingestBuildDataset,
  type RawDatasetPutInput,
  type RawDatasetPutStatus,
  type RawDatasetStore,
  type SqlExecutor,
  type SqlQueryResult,
  type TransactionRunner,
} from "../src/index.js";

const defaultConnectionUrl =
  "postgresql://forever_professions:local-only@127.0.0.1:55432/forever_professions_local";

function localConnectionUrl(): string {
  const value = process.env.LOCAL_DATABASE_URL ?? defaultConnectionUrl;
  const parsed = new URL(value);
  const allowedHosts = new Set(["127.0.0.1", "localhost", "::1"]);

  if (!allowedHosts.has(parsed.hostname) || parsed.pathname !== "/forever_professions_local") {
    throw new Error("The local smoke test only connects to forever_professions_local on localhost.");
  }

  return value;
}

function sampleDataset(): ImportedBuildDataset {
  return {
    build: { id: "local-11.2.7.65000", version: "11.2.7" },
    sources: [
      {
        id: "local-client-11.2.7",
        kind: "client-data",
        label: "Local client-data smoke fixture",
      },
    ],
    professions: [
      {
        id: "leatherworking",
        slug: "leatherworking",
        name: "Leatherworking",
        recipes: [
          {
            id: "heavy-armor-kit",
            name: "Heavy Armor Kit",
            metadata: {
              spellId: 3780,
              learnSkill: 150,
              acquisition: "trainer",
              faction: "both",
              specializationSpellId: null,
              cooldownSeconds: null,
              availability: "available",
            },
            thresholds: { orange: 150, yellow: 170, green: 180, gray: 190 },
            reagents: [
              {
                item: { id: "heavy-leather", gameId: 4234, name: "Heavy Leather" },
                quantity: 5,
              },
              {
                item: { id: "fine-thread", gameId: 2321, name: "Fine Thread" },
                quantity: 1,
              },
            ],
            outputs: [
              {
                item: { id: "heavy-armor-kit-item", gameId: 4265, name: "Heavy Armor Kit" },
                minimumQuantity: 1,
                maximumQuantity: 1,
              },
            ],
            sourceId: "local-client-11.2.7",
            verification: { status: "unverified", notes: "Local smoke data only." },
          },
          {
            id: "nightscape-headband",
            name: "Nightscape Headband",
            metadata: {
              spellId: 10507,
              learnSkill: 205,
              acquisition: "trainer",
              faction: "both",
              specializationSpellId: null,
              cooldownSeconds: null,
              availability: "available",
            },
            thresholds: { orange: 205, yellow: 225, green: 235, gray: 245 },
            reagents: [
              {
                item: { id: "thick-leather", gameId: 4304, name: "Thick Leather" },
                quantity: 5,
              },
              {
                item: { id: "silken-thread", gameId: 4291, name: "Silken Thread" },
                quantity: 2,
              },
            ],
            outputs: [
              {
                item: {
                  id: "nightscape-headband-item",
                  gameId: 8176,
                  name: "Nightscape Headband",
                },
                minimumQuantity: 1,
                maximumQuantity: 1,
              },
            ],
            sourceId: "local-client-11.2.7",
            verification: { status: "unverified", notes: "Local smoke data only." },
          },
        ],
      },
    ],
  };
}

class MemoryRawDatasetStore implements RawDatasetStore {
  readonly objects = new Map<string, Uint8Array>();

  async putIfAbsent(input: RawDatasetPutInput): Promise<RawDatasetPutStatus> {
    if (this.objects.has(input.key)) return "already-exists";
    this.objects.set(input.key, new Uint8Array(input.body));
    return "created";
  }
}

function localizeDdl(sql: string): string {
  return sql.replace("CREATE INDEX ASYNC IF NOT EXISTS", "CREATE INDEX IF NOT EXISTS");
}

async function applyMigrations(pool: Pool): Promise<number> {
  const sqlDirectory = fileURLToPath(new URL("../sql/", import.meta.url));
  const migrationFiles = (await readdir(sqlDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const filename of migrationFiles) {
    const ddl = localizeDdl(await readFile(new URL(`../sql/${filename}`, import.meta.url), "utf8"));
    await pool.query(ddl);
  }

  return migrationFiles.length;
}

async function clearLocalRows(pool: Pool): Promise<void> {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    await client.query("DELETE FROM recipe_output");
    await client.query("DELETE FROM recipe_reagent");
    await client.query("DELETE FROM recipe_threshold");
    await client.query("DELETE FROM recipe_metadata");
    await client.query("DELETE FROM provenance");
    await client.query("DELETE FROM recipe_version");
    await client.query("DELETE FROM verification");
    await client.query("DELETE FROM recipe");
    await client.query("DELETE FROM item");
    await client.query("DELETE FROM profession");
    await client.query("DELETE FROM data_source");
    await client.query("DELETE FROM wow_build");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function createSqlExecutor(client: PoolClient): SqlExecutor {
  return {
    query: async (sql, values): Promise<SqlQueryResult> => {
      const result =
        values === undefined ? await client.query(sql) : await client.query(sql, [...values]);
      return {
        rowCount: result.rowCount,
        rows: result.rows as readonly Record<string, unknown>[],
      };
    },
  };
}

function createLocalTransactionRunner(pool: Pool): TransactionRunner {
  return {
    transaction: async (work) => {
      const client = await pool.connect();
      await client.query("BEGIN");
      try {
        const result = await work(createSqlExecutor(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

async function verifyDatabase(pool: Pool): Promise<Record<string, number>> {
  const counts = await pool.query<{
    builds: string;
    items: string;
    recipe_versions: string;
    reagents: string;
    outputs: string;
    recipe_metadata: string;
  }>(
    "SELECT (SELECT COUNT(*) FROM wow_build) AS builds, (SELECT COUNT(*) FROM item) AS items, (SELECT COUNT(*) FROM recipe_version) AS recipe_versions, (SELECT COUNT(*) FROM recipe_metadata) AS recipe_metadata, (SELECT COUNT(*) FROM recipe_reagent) AS reagents, (SELECT COUNT(*) FROM recipe_output) AS outputs",
  );
  const row = counts.rows[0]!;

  const orphanQueries = [
    "SELECT COUNT(*) AS count FROM recipe_version rv LEFT JOIN recipe r ON r.recipe_id = rv.recipe_id LEFT JOIN wow_build b ON b.build_id = rv.build_id WHERE r.recipe_id IS NULL OR b.build_id IS NULL",
    "SELECT COUNT(*) AS count FROM recipe_reagent rr LEFT JOIN recipe_version rv ON rv.recipe_version_id = rr.recipe_version_id LEFT JOIN item i ON i.item_id = rr.item_id WHERE rv.recipe_version_id IS NULL OR i.item_id IS NULL",
    "SELECT COUNT(*) AS count FROM recipe_output ro LEFT JOIN recipe_version rv ON rv.recipe_version_id = ro.recipe_version_id LEFT JOIN item i ON i.item_id = ro.item_id WHERE rv.recipe_version_id IS NULL OR i.item_id IS NULL",
    "SELECT COUNT(*) AS count FROM recipe_metadata rm LEFT JOIN recipe_version rv ON rv.recipe_version_id = rm.recipe_version_id WHERE rv.recipe_version_id IS NULL",
    "SELECT COUNT(*) AS count FROM provenance p LEFT JOIN recipe_version rv ON rv.recipe_version_id = p.recipe_version_id LEFT JOIN data_source s ON s.source_id = p.source_id LEFT JOIN verification v ON v.verification_id = p.verification_id WHERE rv.recipe_version_id IS NULL OR s.source_id IS NULL OR v.verification_id IS NULL",
  ] as const;
  let orphanCount = 0;
  for (const orphanQuery of orphanQueries) {
    const result = await pool.query<{ count: string }>(orphanQuery);
    orphanCount += Number(result.rows[0]?.count ?? 0);
  }
  if (orphanCount !== 0) throw new Error(`Local database contains ${orphanCount} orphan rows.`);

  return {
    builds: Number(row.builds),
    items: Number(row.items),
    recipeVersions: Number(row.recipe_versions),
    recipeMetadata: Number(row.recipe_metadata),
    reagents: Number(row.reagents),
    outputs: Number(row.outputs),
    orphans: orphanCount,
  };
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: localConnectionUrl(), max: 3 });
  const rawStore = new MemoryRawDatasetStore();
  const transactionRunner = createLocalTransactionRunner(pool);
  const rawBytes = new TextEncoder().encode(JSON.stringify(sampleDataset()));

  try {
    const migrationsApplied = await applyMigrations(pool);
    await clearLocalRows(pool);
    const firstImport = await ingestBuildDataset({
      rawBytes,
      rawStore,
      transactionRunner,
      importedAt: "2026-01-01T00:00:00.000Z",
      maximumRows: 2,
    });
    const repeatedImport = await ingestBuildDataset({
      rawBytes,
      rawStore,
      transactionRunner,
      importedAt: "2026-01-02T00:00:00.000Z",
      maximumRows: 2,
    });
    const rows = await verifyDatabase(pool);

    process.stdout.write(
      `${JSON.stringify(
        {
          migrationsApplied,
          rawObjectKey: firstImport.rawObjectKey,
          rawObjectStatuses: [firstImport.rawObjectStatus, repeatedImport.rawObjectStatus],
          rawObjects: rawStore.objects.size,
          batches: firstImport.batches,
          rows,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await pool.end();
  }
}

await main();
