import {
  auctionMarketsResponseSchema,
  auctionPriceRequestSchema,
  auctionPricesResponseSchema,
  healthResponseSchema,
  professionFixtureSchema,
  professionsResponseSchema,
  recipeChangesQuerySchema,
  recipeChangesResponseSchema,
  recipeChangesSummaryQuerySchema,
  recipeChangesSummaryResponseSchema,
  recipeSchema,
  recipesResponseSchema,
  routeOptimizationRequestSchema,
  shoppingListRequestSchema,
} from "@forever-professions/contracts";
import { professionFixtures } from "@forever-professions/fixtures";
import type {
  RecipeCatalogReader,
  RecipeChangeReader,
  RecipeChangeType,
  RecipeComparisonType,
} from "@forever-professions/ingestion";
import type { CurrentAuctionPriceReader } from "@forever-professions/pricing";
import {
  optimizeFixtureRoute,
  RoutePricingUnavailableError,
} from "./optimize-route.js";
import {
  buildFixtureShoppingList,
  ShoppingPricingUnavailableError,
  ShoppingRouteInvalidError,
} from "./shopping-list.js";

export interface ApiResponse {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

const headers = {
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-origin": "*",
  "content-type": "application/json; charset=utf-8",
} as const;

function json(statusCode: number, value: unknown): ApiResponse {
  return { statusCode, headers, body: JSON.stringify(value) };
}

export interface ApiDependencies {
  readonly catalog?: RecipeCatalogReader;
  readonly changes?: RecipeChangeReader;
  readonly pricing?: CurrentAuctionPriceReader;
}

function optionalQueryValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function comparisonType(value: "classic-forever" | "forever-build"): RecipeComparisonType {
  return value === "classic-forever" ? "CLASSIC_TO_FOREVER" : "FOREVER_BUILD_TO_BUILD";
}

function changeType(
  value: "new" | "updated" | "removed" | "unchanged",
): RecipeChangeType {
  return value.toUpperCase() as RecipeChangeType;
}

async function findProfession(
  professionId: string,
  dependencies: ApiDependencies,
) {
  return dependencies.catalog
    ? dependencies.catalog.getProfession(professionId)
    : professionFixtures.find(({ id }) => id === professionId);
}

async function findRecipe(recipeId: string, dependencies: ApiDependencies) {
  return dependencies.catalog
    ? dependencies.catalog.getRecipe(recipeId)
    : professionFixtures.flatMap(({ recipes }) => recipes).find(({ id }) => id === recipeId);
}

export async function routeRequest(
  method: string,
  path: string,
  query: Readonly<Record<string, string | undefined>> = {},
  dependencies: ApiDependencies = {},
  body?: unknown,
): Promise<ApiResponse> {
  const normalizedPath = path === "/api" ? "/" : path.replace(/^\/api(?=\/)/, "");

  if (method === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (normalizedPath === "/routes/optimize") {
    if (method !== "POST") return json(405, { error: "Method not allowed." });
    const request = routeOptimizationRequestSchema.safeParse(body);
    if (!request.success) {
      return json(400, { error: "A valid route optimization request is required." });
    }
    try {
      const profession = await findProfession(request.data.professionId, dependencies);
      if (!profession) return json(404, { error: "Profession not found." });
      return json(
        200,
        await optimizeFixtureRoute(request.data, profession, dependencies.pricing),
      );
    } catch (error) {
      if (error instanceof RoutePricingUnavailableError) {
        return json(503, { error: error.message });
      }
      return json(503, { error: "Route optimization is temporarily unavailable." });
    }
  }

  if (normalizedPath === "/shopping-list") {
    if (method !== "POST") return json(405, { error: "Method not allowed." });
    const request = shoppingListRequestSchema.safeParse(body);
    if (!request.success) {
      return json(400, { error: "A valid shopping-list request is required." });
    }
    try {
      const profession = await findProfession(request.data.professionId, dependencies);
      if (!profession) return json(404, { error: "Profession not found." });
      return json(
        200,
        await buildFixtureShoppingList(
          request.data,
          profession,
          dependencies.pricing,
        ),
      );
    } catch (error) {
      if (error instanceof ShoppingRouteInvalidError) {
        return json(400, { error: error.message });
      }
      if (error instanceof ShoppingPricingUnavailableError) {
        return json(503, { error: error.message });
      }
      return json(503, { error: "Shopping list is temporarily unavailable." });
    }
  }

  if (method !== "GET") return json(405, { error: "Method not allowed." });

  if (normalizedPath === "/health") {
    return json(
      200,
      healthResponseSchema.parse({
        service: "forever-professions-api",
        status: "ok",
        timestamp: new Date().toISOString(),
      }),
    );
  }

  if (normalizedPath === "/professions") {
    try {
      const professions = dependencies.catalog
        ? await dependencies.catalog.listProfessions()
        : professionFixtures.map(({ id, name }) => ({ id, name }));
      return json(200, professionsResponseSchema.parse(professions));
    } catch {
      return json(503, { error: "Recipe catalog is temporarily unavailable." });
    }
  }

  if (normalizedPath === "/recipe-changes") {
    const request = recipeChangesQuerySchema.safeParse({
      comparison: optionalQueryValue(query.comparison),
      profession: optionalQueryValue(query.profession),
      changeType: optionalQueryValue(query.changeType),
      search: optionalQueryValue(query.search),
    });
    if (!request.success) {
      return json(400, { error: "Invalid recipe-change filters." });
    }
    if (!dependencies.changes) {
      return json(503, { error: "Recipe changes are not configured." });
    }
    try {
      const response = await dependencies.changes.listChanges({
        comparisonType: comparisonType(request.data.comparison),
        ...(request.data.profession === undefined
          ? {}
          : { professionId: request.data.profession }),
        ...(request.data.changeType === undefined
          ? {}
          : { changeType: changeType(request.data.changeType) }),
        ...(request.data.search === undefined ? {} : { search: request.data.search }),
      });
      if (!response) return json(404, { error: "Recipe comparison not found." });
      return json(200, recipeChangesResponseSchema.parse(response));
    } catch {
      return json(503, { error: "Recipe changes are temporarily unavailable." });
    }
  }

  if (normalizedPath === "/recipe-changes/summary") {
    const request = recipeChangesSummaryQuerySchema.safeParse({
      comparison: optionalQueryValue(query.comparison),
      profession: optionalQueryValue(query.profession),
    });
    if (!request.success) {
      return json(400, { error: "Invalid recipe-change summary filters." });
    }
    if (!dependencies.changes) {
      return json(503, { error: "Recipe changes are not configured." });
    }
    try {
      const response = await dependencies.changes.getSummary({
        comparisonType: comparisonType(request.data.comparison),
        ...(request.data.profession === undefined
          ? {}
          : { professionId: request.data.profession }),
      });
      if (!response) return json(404, { error: "Recipe comparison not found." });
      return json(200, recipeChangesSummaryResponseSchema.parse(response));
    } catch {
      return json(503, { error: "Recipe changes are temporarily unavailable." });
    }
  }

  const professionMatch = normalizedPath.match(/^\/professions\/([^/]+)$/);
  if (professionMatch) {
    try {
      const profession = await findProfession(
        decodeURIComponent(professionMatch[1]!),
        dependencies,
      );
      if (!profession) return json(404, { error: "Profession not found." });
      return json(200, professionFixtureSchema.parse(profession));
    } catch {
      return json(503, { error: "Recipe catalog is temporarily unavailable." });
    }
  }

  const professionRecipesMatch = normalizedPath.match(
    /^\/professions\/([^/]+)\/recipes$/,
  );
  if (professionRecipesMatch) {
    try {
      const profession = await findProfession(
        decodeURIComponent(professionRecipesMatch[1]!),
        dependencies,
      );
      if (!profession) return json(404, { error: "Profession not found." });
      return json(200, recipesResponseSchema.parse(profession.recipes));
    } catch {
      return json(503, { error: "Recipe catalog is temporarily unavailable." });
    }
  }

  const recipeMatch = normalizedPath.match(/^\/recipes\/([^/]+)$/);
  if (recipeMatch) {
    const requestedId = decodeURIComponent(recipeMatch[1]!);
    try {
      const recipe = await findRecipe(requestedId, dependencies);
      if (!recipe) return json(404, { error: "Recipe not found." });
      return json(200, recipeSchema.parse(recipe));
    } catch {
      return json(503, { error: "Recipe catalog is temporarily unavailable." });
    }
  }

  if (normalizedPath === "/auction/markets") {
    if (!dependencies.pricing) {
      return json(503, { error: "Auction pricing is not configured." });
    }
    try {
      return json(
        200,
        auctionMarketsResponseSchema.parse({
          markets: await dependencies.pricing.listMarkets(),
        }),
      );
    } catch {
      return json(503, { error: "Auction pricing is temporarily unavailable." });
    }
  }

  if (normalizedPath === "/auction/prices") {
    if (!dependencies.pricing) {
      return json(503, { error: "Auction pricing is not configured." });
    }
    const gameItemIds = (query.itemIds ?? "")
      .split(",")
      .filter((value) => value.length > 0)
      .map(Number);
    if (gameItemIds.length > 100) {
      return json(400, { error: "At most 100 item IDs may be requested." });
    }
    const request = auctionPriceRequestSchema.safeParse({
      marketId: query.marketId,
      gameItemIds,
    });
    if (!request.success) {
      return json(400, {
        error: "marketId and a comma-separated list of positive integer itemIds are required.",
      });
    }
    try {
      return json(
        200,
        auctionPricesResponseSchema.parse({
          marketId: request.data.marketId,
          observations: await dependencies.pricing.getCurrentPrices(request.data),
        }),
      );
    } catch {
      return json(503, { error: "Auction pricing is temporarily unavailable." });
    }
  }

  return json(404, { error: "Route not found." });
}
