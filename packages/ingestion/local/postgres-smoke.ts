import { Pool, type PoolClient } from "pg";
import type { ImportedBuildDataset } from "@forever-professions/contracts";
import {
  applySqlMigrations,
  ingestBuildDataset,
  loadSqlMigrations,
  normalizeBuildDataset,
  SqlRecipeChangeReader,
  type RawDatasetPutInput,
  type RawDatasetPutStatus,
  type RawDatasetStore,
  type SqlExecutor,
  type SqlMigrationRunner,
  type SqlQueryResult,
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
                item: {
                  id: "heavy-leather",
                  gameId: 4234,
                  name: "Heavy Leather",
                  itemClassId: 7,
                  itemSubClassId: 6,
                  inventoryType: "INVTYPE_NON_EQUIP_IGNORE",
                  clientData: {
                    displayName: "Heavy Leather",
                    qualityId: 1,
                    stats: [
                      {
                        statId: 45,
                        value: 2,
                        displayText: "Equip: Increases spell power by 2.",
                        displayTone: "effect",
                      },
                    ],
                    requiredLevel: 0,
                    sellPriceCopper: 15,
                    source: {
                      product: "wow_classic_beta",
                      build: "1.60.1.70374",
                      locale: "enUS",
                    },
                  },
                },
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

function targetDataset(): ImportedBuildDataset {
  const target = structuredClone(sampleDataset());
  target.build = { id: "local-11.2.8.65100", version: "11.2.8" };
  target.sources[0]!.id = "local-client-11.2.8";
  target.sources[0]!.label = "Local target client-data smoke fixture";
  for (const recipe of target.professions[0]!.recipes) {
    recipe.sourceId = "local-client-11.2.8";
  }
  const armorKit = target.professions[0]!.recipes[0]!;
  armorKit.metadata.learnSkill = 145;
  armorKit.thresholds = { orange: 145, yellow: 165, green: 175, gray: 185 };
  armorKit.reagents[0]!.quantity = 4;
  target.professions[0]!.recipes.push({
    id: "tanning-rack",
    name: "Tanning Rack",
    metadata: {
      spellId: 99999,
      learnSkill: 20,
      acquisition: "trainer",
      faction: "both",
      specializationSpellId: null,
      cooldownSeconds: null,
      availability: "available",
    },
    thresholds: { orange: 20, yellow: 40, green: 50, gray: 60 },
    reagents: [
      {
        item: { id: "light-leather", gameId: 2318, name: "Light Leather" },
        quantity: 4,
      },
    ],
    outputs: [
      {
        item: { id: "tanning-rack-item", gameId: 99000, name: "Tanning Rack" },
        minimumQuantity: 1,
        maximumQuantity: 1,
      },
    ],
    sourceId: "local-client-11.2.8",
    verification: { status: "unverified", notes: "Local smoke data only." },
  });
  return target;
}

class MemoryRawDatasetStore implements RawDatasetStore {
  readonly objects = new Map<string, Uint8Array>();

  async putIfAbsent(input: RawDatasetPutInput): Promise<RawDatasetPutStatus> {
    if (this.objects.has(input.key)) return "already-exists";
    this.objects.set(input.key, new Uint8Array(input.body));
    return "created";
  }
}

async function clearLocalRows(pool: Pool): Promise<void> {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    await client.query("DELETE FROM recipe_change");
    await client.query("DELETE FROM recipe_comparison");
    await client.query("DELETE FROM recipe_output");
    await client.query("DELETE FROM recipe_reagent");
    await client.query("DELETE FROM recipe_threshold");
    await client.query("DELETE FROM recipe_metadata");
    await client.query("DELETE FROM provenance");
    await client.query("DELETE FROM recipe_version");
    await client.query("DELETE FROM verification");
    await client.query("DELETE FROM recipe");
    await client.query("DELETE FROM item_stat");
    await client.query("DELETE FROM item_quality");
    await client.query("DELETE FROM item_client_data");
    await client.query("DELETE FROM item_classification");
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

function createLocalTransactionRunner(pool: Pool): SqlMigrationRunner {
  return {
    query: async (sql, values): Promise<SqlQueryResult> => {
      const result =
        values === undefined ? await pool.query(sql) : await pool.query(sql, [...values]);
      return {
        rowCount: result.rowCount,
        rows: result.rows as readonly Record<string, unknown>[],
      };
    },
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
    comparisons: string;
    recipe_changes: string;
    item_client_data: string;
    item_quality: string;
    item_stats: string;
  }>(
    "SELECT (SELECT COUNT(*) FROM wow_build) AS builds, (SELECT COUNT(*) FROM item) AS items, (SELECT COUNT(*) FROM item_client_data) AS item_client_data, (SELECT COUNT(*) FROM item_quality) AS item_quality, (SELECT COUNT(*) FROM item_stat) AS item_stats, (SELECT COUNT(*) FROM recipe_version) AS recipe_versions, (SELECT COUNT(*) FROM recipe_metadata) AS recipe_metadata, (SELECT COUNT(*) FROM recipe_reagent) AS reagents, (SELECT COUNT(*) FROM recipe_output) AS outputs, (SELECT COUNT(*) FROM recipe_comparison) AS comparisons, (SELECT COUNT(*) FROM recipe_change) AS recipe_changes",
  );
  const row = counts.rows[0]!;

  const orphanQueries = [
    "SELECT COUNT(*) AS count FROM recipe_version rv LEFT JOIN recipe r ON r.recipe_id = rv.recipe_id LEFT JOIN wow_build b ON b.build_id = rv.build_id WHERE r.recipe_id IS NULL OR b.build_id IS NULL",
    "SELECT COUNT(*) AS count FROM recipe_reagent rr LEFT JOIN recipe_version rv ON rv.recipe_version_id = rr.recipe_version_id LEFT JOIN item i ON i.item_id = rr.item_id WHERE rv.recipe_version_id IS NULL OR i.item_id IS NULL",
    "SELECT COUNT(*) AS count FROM recipe_output ro LEFT JOIN recipe_version rv ON rv.recipe_version_id = ro.recipe_version_id LEFT JOIN item i ON i.item_id = ro.item_id WHERE rv.recipe_version_id IS NULL OR i.item_id IS NULL",
    "SELECT COUNT(*) AS count FROM recipe_metadata rm LEFT JOIN recipe_version rv ON rv.recipe_version_id = rm.recipe_version_id WHERE rv.recipe_version_id IS NULL",
    "SELECT COUNT(*) AS count FROM provenance p LEFT JOIN recipe_version rv ON rv.recipe_version_id = p.recipe_version_id LEFT JOIN data_source s ON s.source_id = p.source_id LEFT JOIN verification v ON v.verification_id = p.verification_id WHERE rv.recipe_version_id IS NULL OR s.source_id IS NULL OR v.verification_id IS NULL",
    "SELECT COUNT(*) AS count FROM recipe_comparison c LEFT JOIN wow_build b ON b.build_id = c.base_build_id LEFT JOIN wow_build t ON t.build_id = c.target_build_id WHERE b.build_id IS NULL OR t.build_id IS NULL",
    "SELECT COUNT(*) AS count FROM recipe_change rc LEFT JOIN recipe_comparison c ON c.comparison_id = rc.comparison_id LEFT JOIN profession p ON p.profession_id = rc.profession_id WHERE c.comparison_id IS NULL OR p.profession_id IS NULL",
    "SELECT COUNT(*) AS count FROM item_client_data icd LEFT JOIN item i ON i.item_id = icd.item_id LEFT JOIN wow_build b ON b.build_id = icd.recipe_build_id WHERE i.item_id IS NULL OR b.build_id IS NULL",
    "SELECT COUNT(*) AS count FROM item_quality iq LEFT JOIN item i ON i.item_id = iq.item_id LEFT JOIN wow_build b ON b.build_id = iq.recipe_build_id WHERE i.item_id IS NULL OR b.build_id IS NULL",
    "SELECT COUNT(*) AS count FROM item_stat ist LEFT JOIN item i ON i.item_id = ist.item_id LEFT JOIN wow_build b ON b.build_id = ist.recipe_build_id WHERE i.item_id IS NULL OR b.build_id IS NULL",
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
    comparisons: Number(row.comparisons),
    recipeChanges: Number(row.recipe_changes),
    itemClientData: Number(row.item_client_data),
    itemQualities: Number(row.item_quality),
    itemStats: Number(row.item_stats),
    orphans: orphanCount,
  };
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: localConnectionUrl(), max: 3 });
  const rawStore = new MemoryRawDatasetStore();
  const transactionRunner = createLocalTransactionRunner(pool);
  const baseDataset = sampleDataset();
  const rawBytes = new TextEncoder().encode(JSON.stringify(baseDataset));
  const targetRawBytes = new TextEncoder().encode(JSON.stringify(targetDataset()));

  try {
    const migrations = await applySqlMigrations(transactionRunner, {
      dialect: "postgres",
      scope: "catalog",
      migrations: await loadSqlMigrations(new URL("../sql/", import.meta.url)),
    });
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
    const targetImport = await ingestBuildDataset({
      rawBytes: targetRawBytes,
      rawStore,
      transactionRunner,
      importedAt: "2026-01-03T00:00:00.000Z",
      maximumRows: 2,
      compareAgainst: [
        {
          build: normalizeBuildDataset(baseDataset),
          comparisonType: "CLASSIC_TO_FOREVER",
        },
      ],
    });
    const repeatedTargetImport = await ingestBuildDataset({
      rawBytes: targetRawBytes,
      rawStore,
      transactionRunner,
      importedAt: "2026-01-04T00:00:00.000Z",
      maximumRows: 2,
      compareAgainst: [
        {
          build: normalizeBuildDataset(baseDataset),
          comparisonType: "CLASSIC_TO_FOREVER",
        },
      ],
    });
    const rows = await verifyDatabase(pool);
    const database: SqlExecutor = {
      query: async (sql, values): Promise<SqlQueryResult> => {
        const result = values === undefined ? await pool.query(sql) : await pool.query(sql, [...values]);
        return {
          rowCount: result.rowCount,
          rows: result.rows as readonly Record<string, unknown>[],
        };
      },
    };
    const changeReader = new SqlRecipeChangeReader(database);
    const changeSummary = await changeReader.getSummary({
      comparisonType: "CLASSIC_TO_FOREVER",
      professionId: "leatherworking",
    });
    const changes = await changeReader.listChanges({
      comparisonType: "CLASSIC_TO_FOREVER",
      professionId: "leatherworking",
    });

    if (
      rows.comparisons !== 1 ||
      rows.recipeChanges !== 3 ||
      rows.itemStats !== 2 ||
      changeSummary?.summary.new !== 1 ||
      changeSummary.summary.updated !== 1 ||
      changeSummary.summary.unchanged !== 1 ||
      changes?.changes.length !== 2
    ) {
      throw new Error("Local recipe comparison persistence returned unexpected results.");
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          migrations,
          rawObjectKey: firstImport.rawObjectKey,
          rawObjectStatuses: [
            firstImport.rawObjectStatus,
            repeatedImport.rawObjectStatus,
            targetImport.rawObjectStatus,
            repeatedTargetImport.rawObjectStatus,
          ],
          rawObjects: rawStore.objects.size,
          batches: firstImport.batches,
          comparisonWrites: [targetImport.comparisons, repeatedTargetImport.comparisons],
          changeSummary,
          returnedChanges: changes.changes.length,
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
