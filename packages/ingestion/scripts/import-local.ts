import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  applySqlMigrations,
  createPostgresTransactionRunner,
  ingestBuildDataset,
  loadSqlMigrations,
  normalizeBuildDataset,
  parseBuildImportScriptArguments,
  parseRawDatasetBytes,
  type RawDatasetPutInput,
  type RawDatasetPutStatus,
  type RawDatasetStore,
} from "../src/index.js";

const defaultConnectionUrl =
  "postgresql://forever_professions:local-only@127.0.0.1:55432/forever_professions_local";

function localConnectionUrl(): string {
  const value = process.env.LOCAL_DATABASE_URL ?? defaultConnectionUrl;
  const parsed = new URL(value);
  if (
    !new Set(["127.0.0.1", "localhost", "::1"]).has(parsed.hostname) ||
    parsed.pathname !== "/forever_professions_local"
  ) {
    throw new Error("The local importer only connects to forever_professions_local on localhost.");
  }
  return value;
}

class FileRawDatasetStore implements RawDatasetStore {
  constructor(private readonly rootDirectory: string) {}

  async putIfAbsent(input: RawDatasetPutInput): Promise<RawDatasetPutStatus> {
    const path = resolve(this.rootDirectory, input.key);
    const relativePath = relative(resolve(this.rootDirectory), path);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error("Raw dataset key escaped its local root.");
    }
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(path, input.body, { flag: "wx" });
      return "created";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await readFile(path);
      const existingSha = createHash("sha256").update(existing).digest("hex");
      if (existingSha !== input.sha256) {
        throw new Error(`Existing raw object ${input.key} does not match its content hash.`);
      }
      return "already-exists";
    }
  }
}

const { inputPath, compareAgainst } = parseBuildImportScriptArguments(process.argv.slice(2));
const invocationDirectory = process.env.INIT_CWD
  ? resolve(process.env.INIT_CWD)
  : process.cwd();
const resolvedInputPath = resolve(invocationDirectory, inputPath);
const rawBytes = await readFile(resolvedInputPath);
const comparisonBase = compareAgainst
  ? normalizeBuildDataset(
      parseRawDatasetBytes(await readFile(resolve(invocationDirectory, compareAgainst.path))),
    )
  : undefined;
const runner = createPostgresTransactionRunner({
  connectionString: localConnectionUrl(),
  maxConnections: 3,
});

try {
  const migrations = await applySqlMigrations(runner, {
    dialect: "postgres",
    scope: "catalog",
    migrations: await loadSqlMigrations(new URL("../sql/", import.meta.url)),
  });
  const result = await ingestBuildDataset({
    rawBytes,
    rawStore: new FileRawDatasetStore(resolve(invocationDirectory, ".local-data")),
    transactionRunner: runner,
    ...(comparisonBase === undefined || compareAgainst === undefined
      ? {}
      : {
          compareAgainst: [
            { build: comparisonBase, comparisonType: compareAgainst.comparisonType },
          ],
        }),
  });
  const counts = await runner.query(
    "SELECT (SELECT COUNT(*) FROM recipe_version) AS recipe_versions, (SELECT COUNT(*) FROM recipe_metadata) AS recipe_metadata, (SELECT COUNT(*) FROM item) AS items, (SELECT COUNT(*) FROM provenance) AS provenance_records",
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        sourceFile: resolvedInputPath,
        migrations,
        ...result,
        stored: counts.rows[0],
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await runner.end();
}
