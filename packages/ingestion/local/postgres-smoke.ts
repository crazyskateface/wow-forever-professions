import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client, type QueryResult } from "pg";
import type {
  ImportedBuildDataset,
  NormalizedBuild,
  RecipeOutput,
  RecipeReagent,
} from "@forever-professions/contracts";
import {
  createDsqlBatches,
  createRawDatasetKey,
  normalizeBuildDataset,
} from "../src/index.js";

const defaultConnectionUrl =
  "postgresql://forever_professions:local-only@127.0.0.1:55432/forever_professions_local";

function localConnectionUrl(): string {
  const value = process.env.LOCAL_DATABASE_URL ?? defaultConnectionUrl;
  const parsed = new URL(value);
  const allowedHosts = new Set(["127.0.0.1", "localhost", "::1"]);

  if (!allowedHosts.has(parsed.hostname) || parsed.pathname !== "/forever_professions_local") {
    throw new Error(
      "The local smoke test only connects to forever_professions_local on localhost.",
    );
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

function localizeDdl(sql: string): string {
  return sql.replace("CREATE INDEX ASYNC IF NOT EXISTS", "CREATE INDEX IF NOT EXISTS");
}

async function applyMigrations(client: Client): Promise<number> {
  const sqlDirectory = fileURLToPath(new URL("../sql/", import.meta.url));
  const migrationFiles = (await readdir(sqlDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const filename of migrationFiles) {
    const ddl = localizeDdl(await readFile(new URL(`../sql/${filename}`, import.meta.url), "utf8"));
    await client.query(ddl);
  }

  return migrationFiles.length;
}

async function clearLocalRows(client: Client): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query("DELETE FROM recipe_output");
    await client.query("DELETE FROM recipe_reagent");
    await client.query("DELETE FROM recipe_threshold");
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
  }
}

async function assertExists(
  client: Client,
  query: string,
  values: readonly unknown[],
  message: string,
): Promise<void> {
  const result = await client.query(query, [...values]);
  if (result.rowCount !== 1) throw new Error(message);
}

async function writeBatches<T>(
  client: Client,
  rows: readonly T[],
  insert: (client: Client, row: T) => Promise<QueryResult>,
): Promise<number> {
  const batches = createDsqlBatches(rows, { maximumRows: 2 });

  for (const batch of batches) {
    await client.query("BEGIN");
    try {
      for (const row of batch) await insert(client, row);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  return batches.length;
}

async function insertNormalizedBuild(
  client: Client,
  build: NormalizedBuild,
  rawObjectKey: string,
  rawSha256: string,
): Promise<Record<string, number>> {
  const batchCounts: Record<string, number> = {};

  batchCounts.wowBuild = await writeBatches(client, [build.build], (database, row) =>
    database.query(
      "INSERT INTO wow_build (build_id, version, released_at, imported_at, raw_object_key, raw_sha256) VALUES ($1, $2, $3, $4, $5, $6)",
      [row.id, row.version, row.releasedAt ?? null, new Date().toISOString(), rawObjectKey, rawSha256],
    ),
  );
  batchCounts.sources = await writeBatches(client, build.sources, (database, row) =>
    database.query(
      "INSERT INTO data_source (source_id, source_kind, label, source_url) VALUES ($1, $2, $3, $4)",
      [row.id, row.kind, row.label, row.url ?? null],
    ),
  );
  batchCounts.professions = await writeBatches(client, build.professions, (database, row) =>
    database.query(
      "INSERT INTO profession (profession_id, slug, name) VALUES ($1, $2, $3)",
      [row.id, row.slug, row.name],
    ),
  );
  batchCounts.items = await writeBatches(client, build.items, (database, row) =>
    database.query("INSERT INTO item (item_id, game_id, name) VALUES ($1, $2, $3)", [
      row.id,
      row.gameId ?? null,
      row.name,
    ]),
  );
  batchCounts.recipes = await writeBatches(client, build.recipes, async (database, row) => {
    await assertExists(
      database,
      "SELECT 1 FROM profession WHERE profession_id = $1",
      [row.professionId],
      `Missing profession ${row.professionId}.`,
    );
    return database.query("INSERT INTO recipe (recipe_id, profession_id) VALUES ($1, $2)", [
      row.id,
      row.professionId,
    ]);
  });
  batchCounts.verifications = await writeBatches(
    client,
    build.verifications,
    (database, row) =>
      database.query(
        "INSERT INTO verification (verification_id, status, verified_at, verified_by, notes) VALUES ($1, $2, $3, $4, $5)",
        [
          row.id,
          row.status,
          row.verifiedAt ?? null,
          row.verifiedBy ?? null,
          row.notes ?? null,
        ],
      ),
  );
  batchCounts.recipeVersions = await writeBatches(
    client,
    build.recipeVersions,
    async (database, row) => {
      await assertExists(
        database,
        "SELECT 1 FROM recipe WHERE recipe_id = $1",
        [row.recipeId],
        `Missing recipe ${row.recipeId}.`,
      );
      await assertExists(
        database,
        "SELECT 1 FROM wow_build WHERE build_id = $1",
        [row.buildId],
        `Missing build ${row.buildId}.`,
      );
      return database.query(
        "INSERT INTO recipe_version (recipe_version_id, recipe_id, build_id, name) VALUES ($1, $2, $3, $4)",
        [row.id, row.recipeId, row.buildId, row.name],
      );
    },
  );
  batchCounts.thresholds = await writeBatches(client, build.thresholds, async (database, row) => {
    await assertExists(
      database,
      "SELECT 1 FROM recipe_version WHERE recipe_version_id = $1",
      [row.recipeVersionId],
      `Missing recipe version ${row.recipeVersionId}.`,
    );
    return database.query(
      "INSERT INTO recipe_threshold (recipe_version_id, orange, yellow, green, gray) VALUES ($1, $2, $3, $4, $5)",
      [row.recipeVersionId, row.orange, row.yellow, row.green, row.gray],
    );
  });
  batchCounts.provenance = await writeBatches(client, build.provenance, async (database, row) => {
    await assertExists(
      database,
      "SELECT 1 FROM recipe_version WHERE recipe_version_id = $1",
      [row.recipeVersionId],
      `Missing recipe version ${row.recipeVersionId}.`,
    );
    await assertExists(
      database,
      "SELECT 1 FROM data_source WHERE source_id = $1",
      [row.sourceId],
      `Missing source ${row.sourceId}.`,
    );
    await assertExists(
      database,
      "SELECT 1 FROM verification WHERE verification_id = $1",
      [row.verificationId],
      `Missing verification ${row.verificationId}.`,
    );
    return database.query(
      "INSERT INTO provenance (provenance_id, recipe_version_id, source_id, verification_id, notes) VALUES ($1, $2, $3, $4, $5)",
      [row.id, row.recipeVersionId, row.sourceId, row.verificationId, row.notes ?? null],
    );
  });

  const insertReagent = async (database: Client, row: RecipeReagent): Promise<QueryResult> => {
    await assertExists(
      database,
      "SELECT 1 FROM recipe_version WHERE recipe_version_id = $1",
      [row.recipeVersionId],
      `Missing recipe version ${row.recipeVersionId}.`,
    );
    await assertExists(
      database,
      "SELECT 1 FROM item WHERE item_id = $1",
      [row.itemId],
      `Missing item ${row.itemId}.`,
    );
    return database.query(
      "INSERT INTO recipe_reagent (recipe_version_id, item_id, quantity) VALUES ($1, $2, $3)",
      [row.recipeVersionId, row.itemId, row.quantity],
    );
  };
  batchCounts.reagents = await writeBatches(client, build.reagents, insertReagent);

  const insertOutput = async (database: Client, row: RecipeOutput): Promise<QueryResult> => {
    await assertExists(
      database,
      "SELECT 1 FROM recipe_version WHERE recipe_version_id = $1",
      [row.recipeVersionId],
      `Missing recipe version ${row.recipeVersionId}.`,
    );
    await assertExists(
      database,
      "SELECT 1 FROM item WHERE item_id = $1",
      [row.itemId],
      `Missing item ${row.itemId}.`,
    );
    return database.query(
      "INSERT INTO recipe_output (recipe_version_id, item_id, minimum_quantity, maximum_quantity) VALUES ($1, $2, $3, $4)",
      [row.recipeVersionId, row.itemId, row.minimumQuantity, row.maximumQuantity],
    );
  };
  batchCounts.outputs = await writeBatches(client, build.outputs, insertOutput);

  return batchCounts;
}

async function verifyDatabase(client: Client): Promise<Record<string, number>> {
  const counts = await client.query<{
    builds: string;
    items: string;
    recipe_versions: string;
    reagents: string;
    outputs: string;
  }>(
    "SELECT (SELECT COUNT(*) FROM wow_build) AS builds, (SELECT COUNT(*) FROM item) AS items, (SELECT COUNT(*) FROM recipe_version) AS recipe_versions, (SELECT COUNT(*) FROM recipe_reagent) AS reagents, (SELECT COUNT(*) FROM recipe_output) AS outputs",
  );
  const row = counts.rows[0]!;

  const orphanQueries = [
    "SELECT COUNT(*) AS count FROM recipe_version rv LEFT JOIN recipe r ON r.recipe_id = rv.recipe_id LEFT JOIN wow_build b ON b.build_id = rv.build_id WHERE r.recipe_id IS NULL OR b.build_id IS NULL",
    "SELECT COUNT(*) AS count FROM recipe_reagent rr LEFT JOIN recipe_version rv ON rv.recipe_version_id = rr.recipe_version_id LEFT JOIN item i ON i.item_id = rr.item_id WHERE rv.recipe_version_id IS NULL OR i.item_id IS NULL",
    "SELECT COUNT(*) AS count FROM recipe_output ro LEFT JOIN recipe_version rv ON rv.recipe_version_id = ro.recipe_version_id LEFT JOIN item i ON i.item_id = ro.item_id WHERE rv.recipe_version_id IS NULL OR i.item_id IS NULL",
    "SELECT COUNT(*) AS count FROM provenance p LEFT JOIN recipe_version rv ON rv.recipe_version_id = p.recipe_version_id LEFT JOIN data_source s ON s.source_id = p.source_id LEFT JOIN verification v ON v.verification_id = p.verification_id WHERE rv.recipe_version_id IS NULL OR s.source_id IS NULL OR v.verification_id IS NULL",
  ] as const;
  let orphanCount = 0;
  for (const orphanQuery of orphanQueries) {
    const result = await client.query<{ count: string }>(orphanQuery);
    orphanCount += Number(result.rows[0]?.count ?? 0);
  }
  if (orphanCount !== 0) throw new Error(`Local database contains ${orphanCount} orphan rows.`);

  return {
    builds: Number(row.builds),
    items: Number(row.items),
    recipeVersions: Number(row.recipe_versions),
    reagents: Number(row.reagents),
    outputs: Number(row.outputs),
    orphans: orphanCount,
  };
}

async function main(): Promise<void> {
  const imported = sampleDataset();
  const rawJson = JSON.stringify(imported);
  const rawSha256 = createHash("sha256").update(rawJson).digest("hex");
  const rawObjectKey = createRawDatasetKey(imported.build.id, rawSha256);
  const normalized = normalizeBuildDataset(imported);
  const client = new Client({ connectionString: localConnectionUrl() });

  await client.connect();
  try {
    const migrationsApplied = await applyMigrations(client);
    await clearLocalRows(client);
    const batches = await insertNormalizedBuild(client, normalized, rawObjectKey, rawSha256);
    const rows = await verifyDatabase(client);

    process.stdout.write(
      `${JSON.stringify({ migrationsApplied, rawObjectKey, batches, rows }, null, 2)}\n`,
    );
  } finally {
    await client.end();
  }
}

await main();
