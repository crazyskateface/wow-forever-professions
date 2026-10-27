import assert from "node:assert/strict";
import { gatheringCatalogSchema, gatheringLocationsResponseSchema } from "@forever-professions/contracts";
import { createPostgresTransactionRunner, SqlGatheringReader } from "@forever-professions/ingestion";
import { routeRequest } from "../src/router.js";
const connectionString = process.env.LOCAL_DATABASE_URL ?? "postgresql://forever_professions:local-only@127.0.0.1:55432/forever_professions_local";
if (!["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname)) throw new Error("Gathering API smoke requires local PostgreSQL.");
const runner = createPostgresTransactionRunner({ connectionString });
try {
  const dependencies = { gathering: new SqlGatheringReader(runner) };
  for (const id of ["herbalism", "mining", "skinning"]) {
    const response = await routeRequest("GET", `/api/professions/${id}/gathering`, {}, dependencies);
    assert.equal(response.statusCode, 200, response.body);
    const catalog = gatheringCatalogSchema.parse(JSON.parse(response.body));
    assert.equal(catalog.professionId, id);
    assert.ok(catalog.abilities.every(a => a.professionId === id));
    const source = catalog.sources.find(s => s.locationCount > 25);
    if (source) {
      const params = { datasetId: catalog.datasetId, sourceId: source.id, offset: "0", limit: "25" };
      const result = await routeRequest("GET", `/api/professions/${id}/gathering/locations`, params, dependencies);
      assert.equal(result.statusCode, 200, result.body);
      const page = gatheringLocationsResponseSchema.parse(JSON.parse(result.body));
      assert.equal(page.locations.length, 25);
      assert.equal(page.total, source.locationCount);
      assert.equal((await routeRequest("GET", "/api/professions/skinning/gathering/locations", params, dependencies)).statusCode, 404);
    }
    console.log(`${id}: ${catalog.abilities.length} abilities; ${catalog.sources.length} sources; API validation passed`);
  }
} finally { await runner.end(); }
