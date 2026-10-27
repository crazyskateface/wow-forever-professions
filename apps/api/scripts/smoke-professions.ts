import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PROFESSIONS, professionFixtureSchema, professionsResponseSchema, recipeChangesResponseSchema, recipeChangesSummaryResponseSchema, routeOptimizationResponseSchema, shoppingListResponseSchema } from "@forever-professions/contracts";
import { createPostgresTransactionRunner, parseRawDatasetBytes, SqlRecipeCatalogReader, SqlRecipeChangeReader } from "@forever-professions/ingestion";
import { routeRequest } from "../src/router.js";

// Read-only integration check of the imported local catalog and application boundary.
const connectionString = process.env.LOCAL_DATABASE_URL ?? "postgresql://forever_professions:local-only@127.0.0.1:55432/forever_professions_local";
const connection = new URL(connectionString);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(connection.hostname), "Local smoke test requires loopback PostgreSQL.");
const runner = createPostgresTransactionRunner({ connectionString, maxConnections: 3 });
try {
  const dataset = parseRawDatasetBytes(await readFile(new URL("../../../data/imports/forever-1.60.1.69977-professions.json", import.meta.url)));
  const dependencies = {
    catalog: new SqlRecipeCatalogReader(runner), changes: new SqlRecipeChangeReader(runner),
    pricing: { async getCurrentPrices() { return []; }, async listMarkets() { return []; }, async listTrackedGameItemIds() { return []; } },
  };
  const list = await routeRequest("GET", "/api/professions", {}, dependencies);
  assert.equal(list.statusCode, 200);
  assert.deepEqual(professionsResponseSchema.parse(JSON.parse(list.body)).map(({ id }) => id).sort(), PROFESSIONS.map(({ id }) => id).sort());
  for (const definition of PROFESSIONS) {
    const expected = dataset.professions.find(({ id }) => id === definition.id)!;
    const response = await routeRequest("GET", `/api/professions/${definition.id}`, {}, dependencies);
    assert.equal(response.statusCode, 200, response.body);
    const profession = professionFixtureSchema.parse(JSON.parse(response.body));
    assert.equal(profession.recipes.length, expected.recipes.length);
    assert.ok(profession.recipes.every(({ professionId, buildId }) => professionId === definition.id && buildId === dataset.build.id));
    for (const recipe of profession.recipes) {
      assert.equal(recipe.outputs.length, expected.recipes.find(({ id }) => id === recipe.id)!.outputs.length);
    }
    const query = { comparison: "classic-forever", profession: definition.id };
    const changes = await routeRequest("GET", "/api/recipe-changes", query, dependencies);
    assert.equal(changes.statusCode, 200, changes.body);
    assert.ok(recipeChangesResponseSchema.parse(JSON.parse(changes.body)).changes.every(({ identity }) => identity.professionId === definition.id));
    const summary = await routeRequest("GET", "/api/recipe-changes/summary", query, dependencies);
    assert.equal(summary.statusCode, 200, summary.body);
    assert.ok(recipeChangesSummaryResponseSchema.parse(JSON.parse(summary.body)).summary.total >= profession.recipes.length);
    const route = await routeRequest("POST", "/api/routes/optimize", {}, dependencies, { professionId: definition.id, startSkill: 1, targetSkill: 300, preset: "practical", constraints: { knownRecipeIds: profession.recipes.map(({ id }) => id) } });
    assert.equal(route.statusCode, 200, route.body);
    const optimized = routeOptimizationResponseSchema.parse(JSON.parse(route.body));
    assert.equal(optimized.professionId, definition.id);
    const allowed = new Set(profession.recipes.filter(({ learnSkill, availability }) => learnSkill !== null && availability !== "unavailable").map(({ id }) => id));
    assert.ok(optimized.result.segments.every(({ recipeId }) => allowed.has(recipeId)));
    const recipe = profession.recipes.find(({ outputs, reagents }) => outputs.length === 0 && reagents.length > 0) ?? profession.recipes[0]!;
    const shopping = await routeRequest("POST", "/api/shopping-list", {}, dependencies, { professionId: definition.id, marketId: "forever.pvp.horde.us", route: [{ recipeId: recipe.id, expectedCrafts: 2 }], strategy: "buy-only" });
    assert.equal(shopping.statusCode, 200, shopping.body);
    shoppingListResponseSchema.parse(JSON.parse(shopping.body));
    console.log(`${definition.name}: ${profession.recipes.length} recipes; catalog, comparison, route (${optimized.result.status}), and shopping passed`);
  }
} finally { await runner.end(); }
