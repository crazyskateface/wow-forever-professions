export {};

const expectedCrafts = Number(process.argv[2] ?? 33.375);
const strategy = process.argv[3] ?? "cheapest";
const baseUrl =
  process.argv[4] ?? process.env.API_BASE_URL ?? "http://127.0.0.1:3001";

const response = await fetch(new URL("/api/shopping-list", baseUrl), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    professionId: "leatherworking",
    marketId: "forever.pvp.horde.us",
    route: [{ recipeId: "heavy-armor-kit", expectedCrafts }],
    strategy,
    knownRecipeIds: ["heavy-armor-kit", "nightscape-headband"],
  }),
});
const body = await response.json();
process.stdout.write(`${response.status} ${response.statusText}\n`);
process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
if (!response.ok) process.exitCode = 1;
