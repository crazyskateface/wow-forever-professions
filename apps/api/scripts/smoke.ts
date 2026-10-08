export {};

const baseUrl = process.argv[2] ?? process.env.API_BASE_URL ?? "http://127.0.0.1:3001";
const requests = [
  { method: "GET", path: "/api/health" },
  { method: "GET", path: "/api/professions" },
  { method: "GET", path: "/api/professions/leatherworking/recipes" },
  { method: "GET", path: "/api/recipes/heavy-armor-kit" },
  { method: "GET", path: "/api/auction/markets" },
  {
    method: "GET",
    path: "/api/auction/prices?marketId=forever.pvp.horde.us&itemIds=4234,2321,4304,4291",
  },
  {
    method: "POST",
    path: "/api/routes/optimize",
    body: {
      professionId: "leatherworking",
      marketId: "forever.pvp.horde.us",
      startSkill: 150,
      targetSkill: 180,
      objective: "cost",
      constraints: { knownRecipeIds: ["heavy-armor-kit"] },
    },
  },
  {
    method: "POST",
    path: "/api/shopping-list",
    body: {
      professionId: "leatherworking",
      marketId: "forever.pvp.horde.us",
      route: [{ recipeId: "heavy-armor-kit", expectedCrafts: 33.375 }],
      strategy: "cheapest",
      knownRecipeIds: ["heavy-armor-kit", "nightscape-headband"],
    },
  },
] as const;

const results = [];
for (const request of requests) {
  const response = await fetch(new URL(request.path, baseUrl), {
    method: request.method,
    ...(request.method === "POST"
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request.body),
        }
      : {}),
  });
  const body = await response.json();
  results.push({
    method: request.method,
    path: request.path,
    status: response.status,
    body,
  });
  if (!response.ok) {
    throw new Error(`${request.method} ${request.path} returned HTTP ${response.status}.`);
  }
}

process.stdout.write(`${JSON.stringify({ baseUrl, results }, null, 2)}\n`);
