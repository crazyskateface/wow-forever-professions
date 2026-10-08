export {};

const path = process.argv[2];
if (!path?.startsWith("/")) {
  throw new Error("Usage: pnpm api:request -- /api/health [base-url]");
}
const baseUrl = process.argv[3] ?? process.env.API_BASE_URL ?? "http://127.0.0.1:3001";
const response = await fetch(new URL(path, baseUrl));
const text = await response.text();
process.stdout.write(`${response.status} ${response.statusText}\n`);
try {
  process.stdout.write(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
} catch {
  process.stdout.write(`${text}\n`);
}
if (!response.ok) process.exitCode = 1;
