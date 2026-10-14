import type { NormalizedBuild } from "@forever-professions/contracts";
import { createDsqlBatches, type DsqlBatchOptions } from "./batching.js";

export interface SqlQueryResult {
  readonly rowCount: number | null;
  readonly rows: readonly Record<string, unknown>[];
}

export interface SqlExecutor {
  query(sql: string, values?: readonly unknown[]): Promise<SqlQueryResult>;
}

export interface TransactionRunner {
  transaction<T>(work: (database: SqlExecutor) => Promise<T>): Promise<T>;
}

export interface NormalizedBuildWriteOptions extends DsqlBatchOptions {
  readonly importedAt?: string;
}

export interface NormalizedBuildWriteResult {
  readonly batches: Readonly<Record<string, number>>;
}

interface ImmutableInsert<Row> {
  readonly label: (row: Row) => string;
  readonly insertSql: string;
  readonly insertValues: (row: Row) => readonly unknown[];
  readonly selectSql: string;
  readonly selectValues: (row: Row) => readonly unknown[];
  readonly expected: (row: Row) => Readonly<Record<string, unknown>>;
  readonly assertReferences?: (database: SqlExecutor, row: Row) => Promise<void>;
}

function normalizeTimestamp(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}[T ]/.test(value)) return value;

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString();
}

function valuesMatch(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  return normalizeTimestamp(actual) === normalizeTimestamp(expected);
}

async function assertExists(
  database: SqlExecutor,
  sql: string,
  values: readonly unknown[],
  message: string,
): Promise<void> {
  const result = await database.query(sql, values);
  if (result.rowCount !== 1) throw new Error(message);
}

async function ensureImmutableRow<Row>(
  database: SqlExecutor,
  row: Row,
  operation: ImmutableInsert<Row>,
): Promise<void> {
  await operation.assertReferences?.(database, row);
  await database.query(operation.insertSql, operation.insertValues(row));

  const result = await database.query(operation.selectSql, operation.selectValues(row));
  const stored = result.rows[0];
  if (result.rowCount !== 1 || !stored) {
    throw new Error(`Could not read ${operation.label(row)} after its idempotent insert.`);
  }

  for (const [column, expected] of Object.entries(operation.expected(row))) {
    if (!valuesMatch(stored[column], expected)) {
      throw new Error(
        `${operation.label(row)} conflicts with the immutable value stored in column ${column}.`,
      );
    }
  }
}

async function writeBatches<Row>(
  runner: TransactionRunner,
  rows: readonly Row[],
  operation: ImmutableInsert<Row>,
  options: DsqlBatchOptions,
): Promise<number> {
  const batches = createDsqlBatches(rows, options);

  for (const batch of batches) {
    await runner.transaction(async (database) => {
      for (const row of batch) await ensureImmutableRow(database, row, operation);
    });
  }

  return batches.length;
}

export async function writeNormalizedBuild(
  runner: TransactionRunner,
  build: NormalizedBuild,
  rawObjectKey: string,
  rawSha256: string,
  options: NormalizedBuildWriteOptions = {},
): Promise<NormalizedBuildWriteResult> {
  const importedAt = options.importedAt ?? new Date().toISOString();
  const batchOptions: DsqlBatchOptions = {
    ...(options.maximumRows === undefined ? {} : { maximumRows: options.maximumRows }),
    ...(options.maximumBytes === undefined ? {} : { maximumBytes: options.maximumBytes }),
  };
  const batches: Record<string, number> = {};

  batches.wowBuild = await writeBatches(
    runner,
    [build.build],
    {
      label: (row) => `build ${row.id}`,
      insertSql:
        "INSERT INTO wow_build (build_id, version, released_at, imported_at, raw_object_key, raw_sha256) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
      insertValues: (row) => [
        row.id,
        row.version,
        row.releasedAt ?? null,
        importedAt,
        rawObjectKey,
        rawSha256,
      ],
      selectSql:
        "SELECT build_id, version, released_at, raw_object_key, raw_sha256 FROM wow_build WHERE build_id = $1",
      selectValues: (row) => [row.id],
      expected: (row) => ({
        build_id: row.id,
        version: row.version,
        released_at: row.releasedAt ?? null,
        raw_object_key: rawObjectKey,
        raw_sha256: rawSha256,
      }),
    },
    batchOptions,
  );

  batches.sources = await writeBatches(
    runner,
    build.sources,
    {
      label: (row) => `data source ${row.id}`,
      insertSql:
        "INSERT INTO data_source (source_id, source_kind, label, source_url) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
      insertValues: (row) => [row.id, row.kind, row.label, row.url ?? null],
      selectSql:
        "SELECT source_id, source_kind, label, source_url FROM data_source WHERE source_id = $1",
      selectValues: (row) => [row.id],
      expected: (row) => ({
        source_id: row.id,
        source_kind: row.kind,
        label: row.label,
        source_url: row.url ?? null,
      }),
    },
    batchOptions,
  );

  batches.professions = await writeBatches(
    runner,
    build.professions,
    {
      label: (row) => `profession ${row.id}`,
      insertSql:
        "INSERT INTO profession (profession_id, slug, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      insertValues: (row) => [row.id, row.slug, row.name],
      selectSql: "SELECT profession_id, slug, name FROM profession WHERE profession_id = $1",
      selectValues: (row) => [row.id],
      expected: (row) => ({ profession_id: row.id, slug: row.slug, name: row.name }),
    },
    batchOptions,
  );

  batches.items = await writeBatches(
    runner,
    build.items,
    {
      label: (row) => `item ${row.id}`,
      insertSql:
        "INSERT INTO item (item_id, game_id, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      insertValues: (row) => [row.id, row.gameId ?? null, row.name],
      selectSql: "SELECT item_id, game_id, name FROM item WHERE item_id = $1",
      selectValues: (row) => [row.id],
      expected: (row) => ({ item_id: row.id, game_id: row.gameId ?? null, name: row.name }),
    },
    batchOptions,
  );

  const itemClassifications = build.items.flatMap((item) =>
    item.classification === undefined
      ? []
      : [{
          itemId: item.id,
          recipeBuildId: build.build.id,
          ...item.classification,
        }],
  );
  batches.itemClassifications = await writeBatches(
    runner,
    itemClassifications,
    {
      label: (row) => `item classification ${row.itemId}@${row.recipeBuildId}`,
      insertSql:
        "INSERT INTO item_classification (item_id, recipe_build_id, classification_id, classification_label, color, source_product, source_build_id, source_locale) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING",
      insertValues: (row) => [
        row.itemId,
        row.recipeBuildId,
        row.id,
        row.label,
        row.color,
        row.source.product,
        row.source.build,
        row.source.locale,
      ],
      selectSql:
        "SELECT item_id, recipe_build_id, classification_id, classification_label, color, source_product, source_build_id, source_locale FROM item_classification WHERE item_id = $1 AND recipe_build_id = $2",
      selectValues: (row) => [row.itemId, row.recipeBuildId],
      expected: (row) => ({
        item_id: row.itemId,
        recipe_build_id: row.recipeBuildId,
        classification_id: row.id,
        classification_label: row.label,
        color: row.color,
        source_product: row.source.product,
        source_build_id: row.source.build,
        source_locale: row.source.locale,
      }),
      assertReferences: async (database, row) => {
        await assertExists(
          database,
          "SELECT 1 AS found FROM item WHERE item_id = $1",
          [row.itemId],
          `Missing item ${row.itemId}.`,
        );
        await assertExists(
          database,
          "SELECT 1 AS found FROM wow_build WHERE build_id = $1",
          [row.recipeBuildId],
          `Missing build ${row.recipeBuildId}.`,
        );
      },
    },
    batchOptions,
  );

  batches.recipes = await writeBatches(
    runner,
    build.recipes,
    {
      label: (row) => `recipe ${row.id}`,
      insertSql:
        "INSERT INTO recipe (recipe_id, profession_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      insertValues: (row) => [row.id, row.professionId],
      selectSql: "SELECT recipe_id, profession_id FROM recipe WHERE recipe_id = $1",
      selectValues: (row) => [row.id],
      expected: (row) => ({ recipe_id: row.id, profession_id: row.professionId }),
      assertReferences: (database, row) =>
        assertExists(
          database,
          "SELECT 1 AS found FROM profession WHERE profession_id = $1",
          [row.professionId],
          `Missing profession ${row.professionId}.`,
        ),
    },
    batchOptions,
  );

  batches.verifications = await writeBatches(
    runner,
    build.verifications,
    {
      label: (row) => `verification ${row.id}`,
      insertSql:
        "INSERT INTO verification (verification_id, status, verified_at, verified_by, notes) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
      insertValues: (row) => [
        row.id,
        row.status,
        row.verifiedAt ?? null,
        row.verifiedBy ?? null,
        row.notes ?? null,
      ],
      selectSql:
        "SELECT verification_id, status, verified_at, verified_by, notes FROM verification WHERE verification_id = $1",
      selectValues: (row) => [row.id],
      expected: (row) => ({
        verification_id: row.id,
        status: row.status,
        verified_at: row.verifiedAt ?? null,
        verified_by: row.verifiedBy ?? null,
        notes: row.notes ?? null,
      }),
    },
    batchOptions,
  );

  batches.recipeVersions = await writeBatches(
    runner,
    build.recipeVersions,
    {
      label: (row) => `recipe version ${row.id}`,
      insertSql:
        "INSERT INTO recipe_version (recipe_version_id, recipe_id, build_id, name) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
      insertValues: (row) => [row.id, row.recipeId, row.buildId, row.name],
      selectSql:
        "SELECT recipe_version_id, recipe_id, build_id, name FROM recipe_version WHERE recipe_version_id = $1",
      selectValues: (row) => [row.id],
      expected: (row) => ({
        recipe_version_id: row.id,
        recipe_id: row.recipeId,
        build_id: row.buildId,
        name: row.name,
      }),
      assertReferences: async (database, row) => {
        await assertExists(
          database,
          "SELECT 1 AS found FROM recipe WHERE recipe_id = $1",
          [row.recipeId],
          `Missing recipe ${row.recipeId}.`,
        );
        await assertExists(
          database,
          "SELECT 1 AS found FROM wow_build WHERE build_id = $1",
          [row.buildId],
          `Missing build ${row.buildId}.`,
        );
      },
    },
    batchOptions,
  );

  batches.recipeMetadata = await writeBatches(
    runner,
    build.recipeMetadata,
    {
      label: (row) => `recipe metadata ${row.recipeVersionId}`,
      insertSql:
        "INSERT INTO recipe_metadata (recipe_version_id, spell_id, learn_skill, acquisition, faction, specialization_spell_id, cooldown_seconds, availability) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING",
      insertValues: (row) => [
        row.recipeVersionId,
        row.spellId,
        row.learnSkill,
        row.acquisition,
        row.faction,
        row.specializationSpellId,
        row.cooldownSeconds,
        row.availability,
      ],
      selectSql:
        "SELECT recipe_version_id, spell_id, learn_skill, acquisition, faction, specialization_spell_id, cooldown_seconds, availability FROM recipe_metadata WHERE recipe_version_id = $1",
      selectValues: (row) => [row.recipeVersionId],
      expected: (row) => ({
        recipe_version_id: row.recipeVersionId,
        spell_id: row.spellId,
        learn_skill: row.learnSkill,
        acquisition: row.acquisition,
        faction: row.faction,
        specialization_spell_id: row.specializationSpellId,
        cooldown_seconds: row.cooldownSeconds,
        availability: row.availability,
      }),
      assertReferences: (database, row) =>
        assertExists(
          database,
          "SELECT 1 AS found FROM recipe_version WHERE recipe_version_id = $1",
          [row.recipeVersionId],
          `Missing recipe version ${row.recipeVersionId}.`,
        ),
    },
    batchOptions,
  );

  batches.thresholds = await writeBatches(
    runner,
    build.thresholds,
    {
      label: (row) => `thresholds for ${row.recipeVersionId}`,
      insertSql:
        "INSERT INTO recipe_threshold (recipe_version_id, orange, yellow, green, gray) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
      insertValues: (row) => [
        row.recipeVersionId,
        row.orange,
        row.yellow,
        row.green,
        row.gray,
      ],
      selectSql:
        "SELECT recipe_version_id, orange, yellow, green, gray FROM recipe_threshold WHERE recipe_version_id = $1",
      selectValues: (row) => [row.recipeVersionId],
      expected: (row) => ({
        recipe_version_id: row.recipeVersionId,
        orange: row.orange,
        yellow: row.yellow,
        green: row.green,
        gray: row.gray,
      }),
      assertReferences: (database, row) =>
        assertExists(
          database,
          "SELECT 1 AS found FROM recipe_version WHERE recipe_version_id = $1",
          [row.recipeVersionId],
          `Missing recipe version ${row.recipeVersionId}.`,
        ),
    },
    batchOptions,
  );

  batches.provenance = await writeBatches(
    runner,
    build.provenance,
    {
      label: (row) => `provenance ${row.id}`,
      insertSql:
        "INSERT INTO provenance (provenance_id, recipe_version_id, source_id, verification_id, notes) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
      insertValues: (row) => [
        row.id,
        row.recipeVersionId,
        row.sourceId,
        row.verificationId,
        row.notes ?? null,
      ],
      selectSql:
        "SELECT provenance_id, recipe_version_id, source_id, verification_id, notes FROM provenance WHERE provenance_id = $1",
      selectValues: (row) => [row.id],
      expected: (row) => ({
        provenance_id: row.id,
        recipe_version_id: row.recipeVersionId,
        source_id: row.sourceId,
        verification_id: row.verificationId,
        notes: row.notes ?? null,
      }),
      assertReferences: async (database, row) => {
        await assertExists(
          database,
          "SELECT 1 AS found FROM recipe_version WHERE recipe_version_id = $1",
          [row.recipeVersionId],
          `Missing recipe version ${row.recipeVersionId}.`,
        );
        await assertExists(
          database,
          "SELECT 1 AS found FROM data_source WHERE source_id = $1",
          [row.sourceId],
          `Missing source ${row.sourceId}.`,
        );
        await assertExists(
          database,
          "SELECT 1 AS found FROM verification WHERE verification_id = $1",
          [row.verificationId],
          `Missing verification ${row.verificationId}.`,
        );
      },
    },
    batchOptions,
  );

  batches.reagents = await writeBatches(
    runner,
    build.reagents,
    {
      label: (row) => `reagent ${row.recipeVersionId}/${row.itemId}`,
      insertSql:
        "INSERT INTO recipe_reagent (recipe_version_id, item_id, quantity) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      insertValues: (row) => [row.recipeVersionId, row.itemId, row.quantity],
      selectSql:
        "SELECT recipe_version_id, item_id, quantity FROM recipe_reagent WHERE recipe_version_id = $1 AND item_id = $2",
      selectValues: (row) => [row.recipeVersionId, row.itemId],
      expected: (row) => ({
        recipe_version_id: row.recipeVersionId,
        item_id: row.itemId,
        quantity: row.quantity,
      }),
      assertReferences: async (database, row) => {
        await assertExists(
          database,
          "SELECT 1 AS found FROM recipe_version WHERE recipe_version_id = $1",
          [row.recipeVersionId],
          `Missing recipe version ${row.recipeVersionId}.`,
        );
        await assertExists(
          database,
          "SELECT 1 AS found FROM item WHERE item_id = $1",
          [row.itemId],
          `Missing item ${row.itemId}.`,
        );
      },
    },
    batchOptions,
  );

  batches.outputs = await writeBatches(
    runner,
    build.outputs,
    {
      label: (row) => `output ${row.recipeVersionId}/${row.itemId}`,
      insertSql:
        "INSERT INTO recipe_output (recipe_version_id, item_id, minimum_quantity, maximum_quantity) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
      insertValues: (row) => [
        row.recipeVersionId,
        row.itemId,
        row.minimumQuantity,
        row.maximumQuantity,
      ],
      selectSql:
        "SELECT recipe_version_id, item_id, minimum_quantity, maximum_quantity FROM recipe_output WHERE recipe_version_id = $1 AND item_id = $2",
      selectValues: (row) => [row.recipeVersionId, row.itemId],
      expected: (row) => ({
        recipe_version_id: row.recipeVersionId,
        item_id: row.itemId,
        minimum_quantity: row.minimumQuantity,
        maximum_quantity: row.maximumQuantity,
      }),
      assertReferences: async (database, row) => {
        await assertExists(
          database,
          "SELECT 1 AS found FROM recipe_version WHERE recipe_version_id = $1",
          [row.recipeVersionId],
          `Missing recipe version ${row.recipeVersionId}.`,
        );
        await assertExists(
          database,
          "SELECT 1 AS found FROM item WHERE item_id = $1",
          [row.itemId],
          `Missing item ${row.itemId}.`,
        );
      },
    },
    batchOptions,
  );

  return { batches };
}
