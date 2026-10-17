import {
  auctionMarketsResponseSchema,
  auctionPricesResponseSchema,
  healthResponseSchema,
  professionFixtureSchema,
  professionsResponseSchema,
  readinessResponseSchema,
  recipeChangesResponseSchema,
  recipeChangesSummaryResponseSchema,
  recipeSchema,
  recipesResponseSchema,
  routeOptimizationResponseSchema,
  shoppingListResponseSchema,
  type Recipe,
} from "@forever-professions/contracts";

interface ResponseSchema<T> {
  parse(value: unknown): T;
}

interface SmokeResult {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly status: number;
}

const baseUrl = (
  process.argv[2] ??
  process.env.API_BASE_URL ??
  "http://127.0.0.1:3001"
).replace(/\/$/, "");
const results: SmokeResult[] = [];

async function request<T>(
  method: "GET" | "POST",
  path: string,
  schema: ResponseSchema<T>,
  body?: unknown,
): Promise<T> {
  const response = await fetch(new URL(path, `${baseUrl}/`), {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const responseBody: unknown = await response.json();
  results.push({ method, path, status: response.status });
  if (!response.ok) {
    throw new Error(
      `${method} ${path} returned HTTP ${response.status}: ${JSON.stringify(responseBody)}`,
    );
  }
  return schema.parse(responseBody);
}

function findOnePointRouteRecipe(recipes: readonly Recipe[]): Recipe {
  const candidate = recipes.find((recipe) => {
    if (recipe.learnSkill === null || recipe.availability === "unavailable") return false;
    if (recipe.specializationSpellId !== null || recipe.cooldownSeconds !== null) return false;
    const startSkill = Math.max(recipe.learnSkill, recipe.thresholds.orange);
    return startSkill < Math.min(recipe.thresholds.gray, 300);
  });
  if (candidate === undefined) {
    throw new Error("The catalog has no ordinary recipe suitable for a one-point route smoke test.");
  }
  return candidate;
}

await request("GET", "/api/health", healthResponseSchema);
await request("GET", "/api/ready", readinessResponseSchema);

const professions = await request(
  "GET",
  "/api/professions",
  professionsResponseSchema,
);
const profession = professions[0];
if (profession === undefined) throw new Error("The deployed catalog contains no professions.");

const professionPath = `/api/professions/${encodeURIComponent(profession.id)}`;
const fullProfession = await request(
  "GET",
  professionPath,
  professionFixtureSchema,
);
const recipes = await request(
  "GET",
  `${professionPath}/recipes`,
  recipesResponseSchema,
);
if (recipes.length === 0) throw new Error("The deployed profession contains no recipes.");

const routeRecipe = findOnePointRouteRecipe(recipes);
await request(
  "GET",
  `/api/recipes/${encodeURIComponent(routeRecipe.id)}`,
  recipeSchema,
);

const changeQuery = `comparison=classic-forever&profession=${encodeURIComponent(profession.id)}`;
await request(
  "GET",
  `/api/recipe-changes?${changeQuery}`,
  recipeChangesResponseSchema,
);
await request(
  "GET",
  `/api/recipe-changes/summary?${changeQuery}`,
  recipeChangesSummaryResponseSchema,
);

const markets = await request(
  "GET",
  "/api/auction/markets",
  auctionMarketsResponseSchema,
);
const marketId = markets.markets[0]?.id ?? "phase4.smoke.unconfigured";
const gameItemIds = [
  ...new Set(
    fullProfession.recipes.flatMap((recipe) =>
      recipe.reagents.flatMap(({ gameItemId }) =>
        gameItemId === undefined ? [] : [gameItemId],
      ),
    ),
  ),
].slice(0, 10);
if (gameItemIds.length === 0) {
  throw new Error("The deployed catalog contains no reagent game item IDs to price.");
}
await request(
  "GET",
  `/api/auction/prices?marketId=${encodeURIComponent(marketId)}&itemIds=${gameItemIds.join(",")}`,
  auctionPricesResponseSchema,
);

const startSkill = Math.max(routeRecipe.learnSkill ?? 0, routeRecipe.thresholds.orange);
const route = await request(
  "POST",
  "/api/routes/optimize",
  routeOptimizationResponseSchema,
  {
    professionId: profession.id,
    startSkill,
    targetSkill: startSkill + 1,
    objective: "crafts",
    constraints: {
      knownRecipeIds: [routeRecipe.id],
      allowUnknownAvailability: true,
      allowUnknownFaction: true,
    },
  },
);
if (route.result.status !== "complete" || route.result.segments.length === 0) {
  throw new Error(`The one-point route smoke test was blocked: ${JSON.stringify(route.result)}`);
}

const routeCrafts = new Map<string, number>();
for (const segment of route.result.segments) {
  routeCrafts.set(
    segment.recipeId,
    (routeCrafts.get(segment.recipeId) ?? 0) + segment.expectedCrafts,
  );
}
await request(
  "POST",
  "/api/shopping-list",
  shoppingListResponseSchema,
  {
    professionId: profession.id,
    marketId,
    route: [...routeCrafts].map(([recipeId, expectedCrafts]) => ({
      recipeId,
      expectedCrafts,
    })),
    strategy: "cheapest",
    knownRecipeIds: [...routeCrafts.keys()],
  },
);

process.stdout.write(
  `${JSON.stringify(
    {
      baseUrl,
      professionId: profession.id,
      recipeId: routeRecipe.id,
      marketId,
      checks: results,
    },
    null,
    2,
  )}\n`,
);
