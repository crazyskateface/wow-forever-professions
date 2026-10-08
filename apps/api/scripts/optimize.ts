export {};

const startSkill = Number(process.argv[2] ?? 150);
const targetSkill = Number(process.argv[3] ?? 180);
const objective = process.argv[4] ?? "cost";
const baseUrl =
  process.argv[5] ?? process.env.API_BASE_URL ?? "http://127.0.0.1:3001";

const response = await fetch(new URL("/api/routes/optimize", baseUrl), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    professionId: "leatherworking",
    marketId: "forever.pvp.horde.us",
    startSkill,
    targetSkill,
    objective,
  }),
});
const body = await response.json();
process.stdout.write(`${response.status} ${response.statusText}\n`);
process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
if (!response.ok) process.exitCode = 1;
