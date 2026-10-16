import { describe, expect, it } from "vitest";
import {
  healthResponseSchema,
  professionFixtureSchema,
  recipeChangesResponseSchema,
  recipeChangesSummaryResponseSchema,
  recipesResponseSchema,
  routeOptimizationResponseSchema,
  shoppingListResponseSchema,
} from "@forever-professions/contracts";
import { FOREVER_BUILD_CONFIG } from "@forever-professions/domain";
import { leatherworkingFixture } from "@forever-professions/fixtures";
import { routeRequest } from "./router.js";

describe("fixture API router", () => {
  it("answers browser preflight for POST routes", async () => {
    const response = await routeRequest("OPTIONS", "/api/routes/optimize");
    expect(response).toMatchObject({
      statusCode: 204,
      headers: {
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-origin": "*",
      },
      body: "",
    });
  });

  it("returns a contract-valid health response", async () => {
    const response = await routeRequest("GET", "/health");
    expect(response.statusCode).toBe(200);
    expect(() => healthResponseSchema.parse(JSON.parse(response.body))).not.toThrow();
  });

  it("returns fixture recipes for a known profession", async () => {
    const response = await routeRequest("GET", "/professions/leatherworking/recipes");
    expect(response.statusCode).toBe(200);
    const recipes = recipesResponseSchema.parse(JSON.parse(response.body));
    expect(recipes).toHaveLength(2);
    expect(recipes[0]?.provenance).toMatchObject({
      source: "fixture",
      sourceLabel: "Illustrative Phase 1 fixture",
      verification: { status: "unverified" },
    });
  });

  it("serves a complete profession from the configured catalog", async () => {
    const response = await routeRequest(
      "GET",
      "/api/professions/leatherworking",
      {},
      {
        catalog: {
          async listProfessions() {
            return [{ id: "leatherworking", name: "Leatherworking" }];
          },
          async getProfession(professionId) {
            return professionId === "leatherworking" ? leatherworkingFixture : undefined;
          },
          async getRecipe(recipeId) {
            return leatherworkingFixture.recipes.find(({ id }) => id === recipeId);
          },
        },
      },
    );

    expect(response.statusCode).toBe(200);
    expect(professionFixtureSchema.parse(JSON.parse(response.body))).toEqual(
      leatherworkingFixture,
    );
  });

  it("reports an unavailable configured catalog instead of silently using fixtures", async () => {
    const response = await routeRequest("GET", "/api/professions", {}, {
      catalog: {
        async listProfessions() {
          throw new Error("database unavailable");
        },
        async getProfession() {
          return undefined;
        },
        async getRecipe() {
          return undefined;
        },
      },
    });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      error: "Recipe catalog is temporarily unavailable.",
    });
  });

  it("returns 404 for an unknown recipe", async () => {
    expect((await routeRequest("GET", "/recipes/not-real")).statusCode).toBe(404);
  });

  it("serves filtered precomputed recipe changes", async () => {
    let receivedFilter: unknown;
    const comparison = {
      id: "comparison-test",
      baseBuildId: "classic-era",
      targetBuildId: "forever-current",
      comparisonType: "CLASSIC_TO_FOREVER" as const,
      createdAt: "2026-10-12T12:00:00.000Z",
    };
    const response = await routeRequest(
      "GET",
      "/api/recipe-changes",
      {
        comparison: "classic-forever",
        profession: "leatherworking",
        changeType: "updated",
        search: "armor kit",
      },
      {
        changes: {
          async listChanges(filter) {
            receivedFilter = filter;
            return {
              comparison,
              changes: [
                {
                  identity: { professionId: "leatherworking", spellId: 3780 },
                  professionName: "Leatherworking",
                  name: "Heavy Armor Kit",
                  changeType: "UPDATED",
                  changedFields: { learnSkill: { before: 150, after: 145 } },
                },
              ],
            };
          },
          async getSummary() {
            return undefined;
          },
        },
      },
    );

    expect(response.statusCode).toBe(200);
    expect(receivedFilter).toEqual({
      comparisonType: "CLASSIC_TO_FOREVER",
      professionId: "leatherworking",
      changeType: "UPDATED",
      search: "armor kit",
    });
    expect(recipeChangesResponseSchema.parse(JSON.parse(response.body))).toMatchObject({
      comparison: { baseBuildId: "classic-era", targetBuildId: "forever-current" },
      changes: [{ changeType: "UPDATED", name: "Heavy Armor Kit" }],
    });
  });

  it("serves profession-level recipe change summaries", async () => {
    let receivedFilter: unknown;
    const response = await routeRequest(
      "GET",
      "/api/recipe-changes/summary",
      { profession: "leatherworking" },
      {
        changes: {
          async listChanges() {
            return undefined;
          },
          async getSummary(filter) {
            receivedFilter = filter;
            return {
              comparison: {
                id: "comparison-test",
                baseBuildId: "classic-era",
                targetBuildId: "forever-current",
                comparisonType: "CLASSIC_TO_FOREVER",
                createdAt: "2026-10-12T12:00:00.000Z",
              },
              professionId: "leatherworking",
              professionName: "Leatherworking",
              summary: { new: 42, updated: 18, removed: 3, unchanged: 100, total: 163 },
            };
          },
        },
      },
    );

    expect(response.statusCode).toBe(200);
    expect(receivedFilter).toEqual({
      comparisonType: "CLASSIC_TO_FOREVER",
      professionId: "leatherworking",
    });
    expect(recipeChangesSummaryResponseSchema.parse(JSON.parse(response.body))).toMatchObject({
      professionId: "leatherworking",
      summary: { new: 42, updated: 18, removed: 3 },
    });
  });

  it("serves stored auction observations without calling a provider", async () => {
    const response = await routeRequest(
      "GET",
      "/api/auction/prices",
      { marketId: "forever.pvp.horde.us", itemIds: "2589" },
      {
        pricing: {
          async listMarkets() {
            return [];
          },
          async listTrackedGameItemIds() {
            return [2589];
          },
          async getCurrentPrices() {
            return [
              {
                provider: "manual",
                marketId: "forever.pvp.horde.us",
                gameItemId: 2589,
                status: "available",
                observedAt: "2026-10-08T06:00:00.000Z",
                fetchedAt: "2026-10-08T06:01:00.000Z",
                medianUnitPriceCopper: 37,
              },
            ];
          },
        },
      },
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      marketId: "forever.pvp.horde.us",
      observations: [{ gameItemId: 2589, medianUnitPriceCopper: 37 }],
    });
  });

  it("optimizes a cost route from stored prices", async () => {
    const response = await routeRequest(
      "POST",
      "/api/routes/optimize",
      {},
      {
        pricing: {
          async listMarkets() {
            return [];
          },
          async listTrackedGameItemIds() {
            return [4234, 2321, 4304, 4291];
          },
          async getCurrentPrices({ marketId, gameItemIds }) {
            return gameItemIds.map((gameItemId) => ({
              provider: "manual" as const,
              marketId,
              gameItemId,
              status: "available" as const,
              observedAt: "2026-10-08T06:00:00.000Z",
              fetchedAt: "2026-10-08T06:01:00.000Z",
              medianUnitPriceCopper: 10,
            }));
          },
        },
      },
      {
        professionId: "leatherworking",
        marketId: "forever.pvp.horde.us",
        startSkill: 150,
        targetSkill: 180,
        objective: "cost",
        constraints: { knownRecipeIds: ["heavy-armor-kit"] },
      },
    );
    expect(response.statusCode).toBe(200);
    const parsed = routeOptimizationResponseSchema.parse(JSON.parse(response.body));
    expect(parsed.result).toMatchObject({
      status: "complete",
      startSkill: 150,
      targetSkill: 180,
      segments: [{ recipeId: "heavy-armor-kit", startSkill: 150, endSkill: 180 }],
    });
  });

  it("validates optimizer bodies and surfaces fixture coverage gaps", async () => {
    expect(
      (await routeRequest("POST", "/api/routes/optimize", {}, {}, {})).statusCode,
    ).toBe(400);

    const response = await routeRequest(
      "POST",
      "/api/routes/optimize",
      {},
      {},
      {
        professionId: "leatherworking",
        startSkill: 190,
        targetSkill: 205,
        objective: "crafts",
      },
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      result: {
        status: "blocked",
        blockedAtSkill: 190,
        reason: "no-eligible-recipe",
      },
    });

    const aboveCap = await routeRequest(
      "POST",
      "/api/routes/optimize",
      {},
      {},
      {
        professionId: "leatherworking",
        startSkill: FOREVER_BUILD_CONFIG.maxBaseSkill,
        targetSkill: FOREVER_BUILD_CONFIG.maxBaseSkill + 1,
        objective: "crafts",
      },
    );
    expect(aboveCap.statusCode).toBe(400);
    expect(JSON.parse(aboveCap.body)).toMatchObject({
      error: expect.stringMatching(/base profession cap/),
    });
  });

  it("aggregates route reagents into a stored-price shopping list", async () => {
    const response = await routeRequest(
      "POST",
      "/api/shopping-list",
      {},
      {
        pricing: {
          async listMarkets() {
            return [];
          },
          async listTrackedGameItemIds() {
            return [4234, 2321, 4304, 4291];
          },
          async getCurrentPrices({ marketId, gameItemIds }) {
            return gameItemIds.map((gameItemId) => ({
              provider: "manual" as const,
              marketId,
              gameItemId,
              status: "available" as const,
              observedAt: "2026-10-08T06:00:00.000Z",
              fetchedAt: "2026-10-08T06:01:00.000Z",
              medianUnitPriceCopper: 10,
              attribution: {
                text: "Test prices",
                url: "https://example.invalid/prices",
              },
            }));
          },
        },
      },
      {
        professionId: "leatherworking",
        marketId: "forever.pvp.horde.us",
        route: [{ recipeId: "heavy-armor-kit", expectedCrafts: 2.5 }],
        strategy: "cheapest",
      },
    );

    expect(response.statusCode).toBe(200);
    expect(
      shoppingListResponseSchema.parse(JSON.parse(response.body)),
    ).toMatchObject({
      plan: {
        status: "complete",
        routeReagents: [
          { itemId: "fine-thread", quantity: 2.5 },
          { itemId: "heavy-leather", quantity: 12.5 },
        ],
        purchases: [
          { itemId: "fine-thread", quantity: 2.5, expectedCostCopper: 25 },
          { itemId: "heavy-leather", quantity: 12.5, expectedCostCopper: 125 },
        ],
        crafts: [],
        expectedCostCopper: 150,
      },
    });
  });

  it("validates shopping-list bodies and recipe references", async () => {
    expect(
      (await routeRequest("POST", "/api/shopping-list", {}, {}, {})).statusCode,
    ).toBe(400);

    const response = await routeRequest(
      "POST",
      "/api/shopping-list",
      {},
      {
        pricing: {
          async listMarkets() {
            return [];
          },
          async listTrackedGameItemIds() {
            return [];
          },
          async getCurrentPrices() {
            return [];
          },
        },
      },
      {
        professionId: "leatherworking",
        marketId: "forever.pvp.horde.us",
        route: [{ recipeId: "not-real", expectedCrafts: 1 }],
      },
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "Route references unknown recipe not-real.",
    });
  });
});
