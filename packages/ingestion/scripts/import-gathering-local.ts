import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { applySqlMigrations, createPostgresTransactionRunner, gatheringHash, ingestGatheringDataset, loadSqlMigrations, normalizeScriptArguments } from "../src/index.js";
const [file] = normalizeScriptArguments(process.argv.slice(2));
if (!file) throw new Error("Pass a gathering dataset JSON path.");
const root = process.env.INIT_CWD ?? process.cwd();
const connectionString = process.env.LOCAL_DATABASE_URL ?? "postgresql://forever_professions:local-only@127.0.0.1:55432/forever_professions_local";
const url = new URL(connectionString);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/forever_professions_local") throw new Error("Gathering local import requires the disposable loopback catalog.");
const runner = createPostgresTransactionRunner({ connectionString });
try {
  await applySqlMigrations(runner, { dialect: "postgres", scope: "catalog", migrations: await loadSqlMigrations(new URL("../sql/", import.meta.url)) });
  const result = await ingestGatheringDataset({ runner, rawBytes: await readFile(resolve(root, file)), rawStore: {
    async putIfAbsent(input) {
      const path = resolve(root, ".local-data", input.key);
      if (!path.startsWith(resolve(root, ".local-data") + "/") && !path.startsWith(resolve(root, ".local-data") + "\\")) throw new Error("Raw key escaped local storage.");
      await mkdir(dirname(path), { recursive: true });
      try { await writeFile(path, input.body, { flag: "wx" }); return "created"; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (gatheringHash(await readFile(path)) !== input.sha256) throw new Error("Raw gathering hash conflict.");
        return "already-exists";
      }
    },
  } });
  console.log(JSON.stringify(result));
} finally { await runner.end(); }
