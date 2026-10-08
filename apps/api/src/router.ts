import {
  auctionMarketsResponseSchema,
  auctionPriceRequestSchema,
  auctionPricesResponseSchema,
  healthResponseSchema,
  professionsResponseSchema,
  recipeSchema,
  recipesResponseSchema,
  routeOptimizationRequestSchema,
  shoppingListRequestSchema,
} from "@forever-professions/contracts";
import { professionFixtures } from "@forever-professions/fixtures";
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
  readonly pricing?: CurrentAuctionPriceReader;
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
    const profession = professionFixtures.find(
      ({ id }) => id === request.data.professionId,
    );
    if (!profession) return json(404, { error: "Profession not found." });
    try {
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
    const profession = professionFixtures.find(
      ({ id }) => id === request.data.professionId,
    );
    if (!profession) return json(404, { error: "Profession not found." });
    try {
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
    return json(
      200,
      professionsResponseSchema.parse(
        professionFixtures.map(({ id, name }) => ({ id, name })),
      ),
    );
  }

  const professionRecipesMatch = normalizedPath.match(
    /^\/professions\/([^/]+)\/recipes$/,
  );
  if (professionRecipesMatch) {
    const profession = professionFixtures.find(
      ({ id }) => id === decodeURIComponent(professionRecipesMatch[1]!),
    );
    if (!profession) return json(404, { error: "Profession not found." });
    return json(200, recipesResponseSchema.parse(profession.recipes));
  }

  const recipeMatch = normalizedPath.match(/^\/recipes\/([^/]+)$/);
  if (recipeMatch) {
    const requestedId = decodeURIComponent(recipeMatch[1]!);
    const recipe = professionFixtures
      .flatMap(({ recipes }) => recipes)
      .find(({ id }) => id === requestedId);
    if (!recipe) return json(404, { error: "Recipe not found." });
    return json(200, recipeSchema.parse(recipe));
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
