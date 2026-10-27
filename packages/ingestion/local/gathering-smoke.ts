import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { gatheringDatasetSchema } from "@forever-professions/contracts";
import { applySqlMigrations, createPostgresTransactionRunner, ingestBuildDataset, ingestGatheringDataset, loadSqlMigrations, normalizeBuildDataset, parseRawDatasetBytes, SqlGatheringReader, SqlRecipeCatalogReader } from "../src/index.js";

const url = new URL(process.env.LOCAL_DATABASE_URL ?? "postgresql://forever_professions:local-only@127.0.0.1:55432/forever_professions_local");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/forever_professions_local") throw new Error("Gathering smoke requires loopback PostgreSQL.");
const admin = createPostgresTransactionRunner({ connectionString: url.toString() });
const name = `gathering_smoke_${randomUUID().replaceAll("-", "")}`;
assert.match(name, /^gathering_smoke_[a-f0-9]+$/);
await admin.query(`CREATE DATABASE "${name}"`);
url.pathname = `/${name}`;
const runner = createPostgresTransactionRunner({ connectionString: url.toString() });
const raw = new Map<string, Uint8Array>();
const rawStore = { async putIfAbsent(input: { key: string; body: Uint8Array }) {
  if (raw.has(input.key)) { assert.deepEqual(raw.get(input.key), input.body); return "already-exists" as const; }
  raw.set(input.key, input.body); return "created" as const;
} };
try {
  await applySqlMigrations(runner, { dialect: "postgres", scope: "catalog", migrations: await loadSqlMigrations(new URL("../sql/", import.meta.url)) });
  const base = await readFile(new URL("../../../data/imports/classic-era-1.15.9.69722-professions.json", import.meta.url));
  const target = await readFile(new URL("../../../data/imports/forever-1.60.1.69977-professions.json", import.meta.url));
  await ingestBuildDataset({ rawBytes: base, rawStore, transactionRunner: runner });
  await ingestBuildDataset({ rawBytes: target, rawStore, transactionRunner: runner, compareAgainst: [{ build: normalizeBuildDataset(parseRawDatasetBytes(base)), comparisonType: "CLASSIC_TO_FOREVER" }] });
  console.log("Both real recipe snapshots and their comparison imported.");
  const rawBytes = await readFile(new URL("../../../data/imports/forever-1.60.1.70630-gathering.json", import.meta.url));
  const result = await ingestGatheringDataset({ rawBytes, rawStore, runner });
  await ingestGatheringDataset({ rawBytes, rawStore, runner });
  const reader = new SqlGatheringReader(runner);
  const herbs = (await reader.getGathering("herbalism"))!;
  assert.ok(herbs.abilities.length > 0);
  assert.ok(herbs.sources.length > 0);
  assert.ok(herbs.maps.length > 0);
  const source = herbs.sources.find(s => s.locationCount > 100)!;
  const query = { datasetId: herbs.datasetId, sourceId: source.id, limit: 25, offset: 0 };
  const first = (await reader.getLocations("herbalism", query))!;
  const next = (await reader.getLocations("herbalism", { ...query, offset: 25 }))!;
  assert.equal(first.total, source.locationCount);
  assert.equal(first.locations.length, 25);
  assert.ok(next.locations.every(l => !first.locations.some(p => p.id === l.id)));
  assert.equal(await reader.getLocations("skinning", query), undefined);
  const zone = (await reader.getLocations("herbalism", { ...query, mapId: first.locations[0]!.mapId }))!;
  assert.ok(zone.locations.every(l => l.mapId === first.locations[0]!.mapId));
  const skinning = (await reader.getGathering("skinning"))!;
  assert.ok(skinning.abilities.some(a => a.outputs.length));
  assert.equal(skinning.sources.length, 0);
  assert.equal((await new SqlRecipeCatalogReader(runner).getProfession("mining"))!.recipes.length, 18);
  const data = gatheringDatasetSchema.parse(JSON.parse(rawBytes.toString("utf8")));
  const observed = gatheringDatasetSchema.parse({ ...data, sources: [...data.sources, { id: "synthetic-creature", professionId: "skinning", kind: "creature", gameId: 999999, name: "Synthetic test only", minimumSkill: null, reportedMinimumSkill: null, evidenceIds: [data.evidence[0]!.id] }],
    yields: [{ id: "synthetic-yield", sourceId: "synthetic-creature", itemId: 2318, itemName: "Synthetic test yield", minimumQuantity: 1, maximumQuantity: 2, observations: 3, evidenceIds: [data.evidence[0]!.id] }] });
  const observationResult = await ingestGatheringDataset({ runner, rawStore, rawBytes: Buffer.from(JSON.stringify(observed)), importedAt: "2099-01-01T00:00:00Z" });
  assert.equal((await reader.getGathering("skinning"))!.yields[0]!.minimumQuantity, 1);
  await runner.query("UPDATE gathering_ability SET data_json=$1 WHERE dataset_id=$2 AND record_id=$3", ["{}", observationResult.datasetId, observed.abilities[0]!.id]);
  await assert.rejects(() => ingestGatheringDataset({ runner, rawStore, rawBytes: Buffer.from(JSON.stringify(observed)) }), /Immutable gathering conflict/);
  const recipes = (await runner.query("SELECT COUNT(*) AS count FROM recipe_version")).rows[0];
  assert.equal(Number(recipes?.count), 4076);
  console.log(JSON.stringify({ status: "passed", ...result, checks: "replay, immutable conflicts, scoped reads, pagination, map filter, creature/yield storage, recipe coexistence" }));
} finally {
  await runner.end();
  await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
}
