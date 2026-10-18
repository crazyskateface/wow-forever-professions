import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Pool } from "pg";
import { normalizeScriptArguments, parseRawDatasetBytes } from "../src/index.js";

const defaultConnectionUrl =
  "postgresql://forever_professions:local-only@127.0.0.1:55432/forever_professions_local";

function localConnectionUrl(): string {
  const value = process.env.LOCAL_DATABASE_URL ?? defaultConnectionUrl;
  const parsed = new URL(value);
  if (
    !new Set(["127.0.0.1", "localhost", "::1"]).has(parsed.hostname) ||
    parsed.pathname !== "/forever_professions_local"
  ) {
    throw new Error("The local status check only connects to forever_professions_local on localhost.");
  }
  return value;
}

const [classicPath, foreverPath] = normalizeScriptArguments(process.argv.slice(2));
if (!classicPath || !foreverPath) {
  throw new Error("Usage: status-local <classic.json> <forever.json>");
}

const invocationDirectory = process.env.INIT_CWD
  ? resolve(process.env.INIT_CWD)
  : process.cwd();
const statusPath = resolve(
  invocationDirectory,
  ".local-data/admin-sources/local-catalog-status.json",
);
const expected = await Promise.all(
  [classicPath, foreverPath].map(async (path) => {
    const bytes = await readFile(resolve(invocationDirectory, path));
    return {
      buildId: parseRawDatasetBytes(bytes).build.id,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }),
);

const pool = new Pool({ connectionString: localConnectionUrl(), max: 1 });
let current = false;
let reason = "local catalog schema is missing";
try {
  const tables = await pool.query<{ wow_build: string | null; recipe_comparison: string | null }>(
    "SELECT to_regclass('public.wow_build')::text AS wow_build, to_regclass('public.recipe_comparison')::text AS recipe_comparison",
  );
  const schemaReady =
    typeof tables.rows[0]?.wow_build === "string" &&
    typeof tables.rows[0]?.recipe_comparison === "string";
  if (!schemaReady) {
    process.stdout.write("Local catalog is empty; an initial import is required.\n");
  } else {
    const builds = await pool.query<{ build_id: string; raw_sha256: string }>(
      "SELECT build_id, raw_sha256 FROM wow_build WHERE build_id = ANY($1::text[])",
      [expected.map(({ buildId }) => buildId)],
    );
    const storedHashes = new Map(
      builds.rows.map(({ build_id, raw_sha256 }) => [build_id, raw_sha256] as const),
    );
    const hashesMatch = expected.every(
      ({ buildId, sha256 }) => storedHashes.get(buildId) === sha256,
    );
    const comparison = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM recipe_comparison WHERE base_build_id = $1 AND target_build_id = $2 AND comparison_type = 'CLASSIC_TO_FOREVER'",
      [expected[0]!.buildId, expected[1]!.buildId],
    );
    const comparisonReady = comparison.rows[0]?.count === "1";

    if (hashesMatch && comparisonReady) {
      current = true;
      reason = "exact dataset hashes and comparison are present";
      process.stdout.write("Local catalog already matches both exact source snapshots.\n");
    } else {
      reason = [
        ...(hashesMatch ? [] : ["dataset hash mismatch"]),
        ...(comparisonReady ? [] : ["comparison missing"]),
      ].join(", ");
      process.stdout.write(
        `Local catalog requires an update: ${reason}.\n`,
      );
    }
  }
} finally {
  await pool.end();
}

await mkdir(dirname(statusPath), { recursive: true });
await writeFile(statusPath, `${JSON.stringify({ current, reason }, null, 2)}\n`, "utf8");
