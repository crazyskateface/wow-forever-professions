import { gatheringCatalogSchema, gatheringDatasetSchema, gatheringLocationsResponseSchema, type GatheringCatalog, type GatheringDataset, type GatheringLocationsQuery, type GatheringLocationsResponse } from "@forever-professions/contracts";
import { gatheringHash } from "./gathering-conversion.js";
import { createDsqlBatches } from "./batching.js";
import type { RawDatasetStore } from "./raw-store.js";
import type { SqlExecutor, TransactionRunner } from "./writer.js";

export interface GatheringReader {
  getGathering(professionId: string): Promise<GatheringCatalog | undefined>;
  getLocations(professionId: string, query: GatheringLocationsQuery): Promise<GatheringLocationsResponse | undefined>;
}
// These identifiers are a fixed application allowlist, never supplied by import files.
const groups = [
  { table: "gathering_evidence", key: "evidence", columns: [] },
  { table: "gathering_ability", key: "abilities", columns: ["profession_id"] },
  { table: "gathering_source", key: "sources", columns: ["profession_id"] },
  { table: "gathering_location", key: "locations", columns: ["source_id", "map_id"] },
  { table: "gathering_yield", key: "yields", columns: ["source_id"] },
] as const;

export async function ingestGatheringDataset(options: { rawBytes: Uint8Array; rawStore: RawDatasetStore; runner: TransactionRunner; importedAt?: string }) {
  const dataset = gatheringDatasetSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(options.rawBytes)));
  const datasetId = gatheringHash(options.rawBytes);
  const rawKey = `gathering/${dataset.client.build}/${datasetId}.json`;
  await options.rawStore.putIfAbsent({ key: rawKey, body: options.rawBytes, sha256: datasetId });
  for (const group of groups) {
    const rows = dataset[group.key].map(record => {
      const value = record as unknown as Record<string, unknown>;
      return [datasetId, record.id, ...group.columns.map(column => column === "profession_id" ? value.professionId : column === "source_id" ? value.sourceId : value.mapId), JSON.stringify(record)];
    });
    for (const batch of createDsqlBatches(rows, { maximumRows: 100, maximumBytes: 500000 })) {
      await options.runner.transaction(async database => {
        const columns = ["dataset_id", "record_id", ...group.columns, "data_json"];
        const values = batch.flat();
        const placeholders = batch.map((_, i) => `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(",")})`).join(",");
        await database.query(`INSERT INTO ${group.table} (${columns.join(",")}) VALUES ${placeholders} ON CONFLICT DO NOTHING`, values);
        const stored = await database.query(`SELECT record_id, data_json FROM ${group.table} WHERE dataset_id=$1 AND record_id IN (${batch.map((_, i) => `$${i + 2}`).join(",")})`, [datasetId, ...batch.map(row => row[1])]);
        const byId = new Map(stored.rows.map(row => [row.record_id, row.data_json]));
        if (batch.some(row => byId.get(row[1]) !== row.at(-1))) throw new Error(`Immutable gathering conflict in ${group.table}.`);
      });
    }
  }
  // Publish only after every child row is durably written and checked. Partial imports stay invisible.
  const metadata = JSON.stringify({ client: dataset.client, evidence: dataset.evidence });
  await options.runner.transaction(async database => {
    await database.query("INSERT INTO gathering_dataset (dataset_id, client_build, imported_at, raw_sha256, raw_object_key, data_json) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING", [datasetId, dataset.client.build, options.importedAt ?? new Date().toISOString(), datasetId, rawKey, metadata]);
    const stored = await database.query("SELECT data_json, raw_sha256 FROM gathering_dataset WHERE dataset_id=$1", [datasetId]);
    if (stored.rows[0]?.data_json !== metadata || stored.rows[0]?.raw_sha256 !== datasetId) throw new Error("Immutable gathering dataset conflict.");
  });
  return { datasetId, rawKey, abilities: dataset.abilities.length, sources: dataset.sources.length, locations: dataset.locations.length, yields: dataset.yields.length };
}

export class SqlGatheringReader implements GatheringReader {
  constructor(private readonly database: SqlExecutor) {}
  async getGathering(professionId: string): Promise<GatheringCatalog | undefined> {
    const header = (await this.database.query("SELECT dataset_id, data_json FROM gathering_dataset ORDER BY imported_at DESC, dataset_id DESC LIMIT 1")).rows[0];
    if (!header) return undefined;
    const datasetId = header.dataset_id;
    const metadata = JSON.parse(String(header.data_json));
    const [abilities, sources, yields, counts, maps] = await Promise.all([
      this.database.query("SELECT data_json FROM gathering_ability WHERE dataset_id=$1 AND profession_id=$2 ORDER BY record_id", [datasetId, professionId]),
      this.database.query("SELECT data_json FROM gathering_source WHERE dataset_id=$1 AND profession_id=$2 ORDER BY record_id", [datasetId, professionId]),
      this.database.query("SELECT y.data_json FROM gathering_yield y JOIN gathering_source s ON s.dataset_id=y.dataset_id AND s.record_id=y.source_id WHERE y.dataset_id=$1 AND s.profession_id=$2 ORDER BY y.record_id", [datasetId, professionId]),
      this.database.query("SELECT l.source_id, COUNT(*) AS count FROM gathering_location l JOIN gathering_source s ON s.dataset_id=l.dataset_id AND s.record_id=l.source_id WHERE l.dataset_id=$1 AND s.profession_id=$2 GROUP BY l.source_id", [datasetId, professionId]),
      this.database.query("SELECT l.map_id, COUNT(*) AS count FROM gathering_location l JOIN gathering_source s ON s.dataset_id=l.dataset_id AND s.record_id=l.source_id WHERE l.dataset_id=$1 AND s.profession_id=$2 GROUP BY l.map_id ORDER BY l.map_id", [datasetId, professionId]),
    ]);
    const locationCounts = new Map(counts.rows.map(row => [row.source_id, Number(row.count)]));
    // Map names come from the stored location, with no hardcoded zone mapping.
    const mapNames = new Map<number, string | null>();
    for (const row of maps.rows) {
      const sample = await this.database.query("SELECT data_json FROM gathering_location WHERE dataset_id=$1 AND map_id=$2 LIMIT 1", [datasetId, row.map_id]);
      mapNames.set(Number(row.map_id), JSON.parse(String(sample.rows[0]?.data_json)).mapName);
    }
    return gatheringCatalogSchema.parse({ datasetId, ...metadata, professionId,
      abilities: abilities.rows.map(row => JSON.parse(String(row.data_json))),
      sources: sources.rows.map(row => { const source = JSON.parse(String(row.data_json)); return { ...source, locationCount: locationCounts.get(source.id) ?? 0 }; }),
      yields: yields.rows.map(row => JSON.parse(String(row.data_json))),
      maps: maps.rows.map(row => ({ mapId: Number(row.map_id), mapName: mapNames.get(Number(row.map_id)) ?? null, locationCount: Number(row.count) })),
    });
  }
  async getLocations(professionId: string, query: GatheringLocationsQuery): Promise<GatheringLocationsResponse | undefined> {
    // A pinned dataset ID prevents pagination from crossing an import publication.
    const source = await this.database.query("SELECT s.record_id FROM gathering_source s JOIN gathering_dataset d ON d.dataset_id=s.dataset_id WHERE s.dataset_id=$1 AND s.record_id=$2 AND s.profession_id=$3", [query.datasetId, query.sourceId, professionId]);
    if (!source.rows.length) return undefined;
    const values: unknown[] = [query.datasetId, query.sourceId];
    const where = `dataset_id=$1 AND source_id=$2${query.mapId === undefined ? "" : " AND map_id=$3"}`;
    if (query.mapId !== undefined) values.push(query.mapId);
    const total = await this.database.query(`SELECT COUNT(*) AS count FROM gathering_location WHERE ${where}`, values);
    const rows = await this.database.query(`SELECT data_json FROM gathering_location WHERE ${where} ORDER BY record_id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, query.limit, query.offset]);
    return gatheringLocationsResponseSchema.parse({ total: Number(total.rows[0]?.count), locations: rows.rows.map(row => JSON.parse(String(row.data_json))) });
  }
}
