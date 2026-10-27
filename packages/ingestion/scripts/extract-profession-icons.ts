import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, delimiter } from "node:path";
import { promisify } from "node:util";
import { PROFESSIONS } from "@forever-professions/contracts";
import { clientProduct, normalizeScriptArguments } from "../src/index.js";

const [clientRoot, requestedBuild, outputDirectory = "apps/web/public/icons/professions"] = normalizeScriptArguments(process.argv.slice(2));
if (!clientRoot || !requestedBuild) {
  throw new Error("Usage: extract-profession-icons <WoW installation root> <client build> [output directory]");
}
const invocationDirectory = process.env.INIT_CWD ?? process.cwd();
const product = clientProduct();
// Node cannot execute the standard Windows npm PowerShell shim directly.
const executable = process.env.WOWDATA_PATH ?? (process.platform === "win32"
  ? (process.env.PATH ?? "").split(delimiter).flatMap((directory) => [join(directory, "wowdata.exe"), join(directory, "wowdata.ps1")]).find(existsSync)
  : "wowdata");
if (executable === undefined) throw new Error("wowdata is missing from PATH. Install the CLI or set WOWDATA_PATH.");
const command = executable.endsWith(".ps1") ? "pwsh" : executable;
const commandPrefix = executable.endsWith(".ps1") ? ["-NoProfile", "-NonInteractive", "-File", executable] : [];
const execute = promisify(execFile);
const target = (build: string) => ["--source", "local", "--path", resolve(invocationDirectory, clientRoot), "--region", "us", "--product", product, "--build", build, "--locale", "enUS"];
async function run(arguments_: readonly string[]): Promise<Record<string, unknown>> {
  const pending = execute(command, [...commandPrefix, ...arguments_], { encoding: "utf8", windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  pending.child.stdin?.end();
  const { stdout } = await pending;
  const result = JSON.parse(stdout) as { ok?: boolean; data?: Record<string, unknown>; error?: { code?: string; message?: string } };
  if (result.ok !== true || result.data === undefined) throw new Error(`wowdata: ${result.error?.code ?? "invalid_response"}: ${result.error?.message ?? "Missing data"}`);
  return result.data;
}

const info = await run(["casc", "info", ...target(requestedBuild)]);
if (typeof info.buildName !== "string" || !info.buildName.startsWith("1.60.")) throw new Error("Profession icons require a resolved Forever 1.60 client build.");
const build = info.buildName;
const result = await run(["db2", "rows", "SkillLine", "--ids", PROFESSIONS.map(({ skillLineId }) => skillLineId).join(","), "--fields", "ID,DisplayName_lang,SpellIconFileID", ...target(build)]);
if (!Array.isArray(result.rows)) throw new Error("SkillLine response is missing rows.");
const destination = resolve(invocationDirectory, outputDirectory);
await mkdir(destination, { recursive: true });
const icons: Record<string, { skillLineId: number; displayName: string; fileDataId: number; path: string; sha256: string }> = {};
for (const profession of PROFESSIONS) {
  const rows = result.rows.filter((row: unknown) => typeof row === "object" && row !== null && (row as Record<string, unknown>).ID === profession.skillLineId) as Record<string, unknown>[];
  const row = rows[0];
  if (rows.length !== 1 || row === undefined || typeof row.SpellIconFileID !== "number" || !Number.isSafeInteger(row.SpellIconFileID) || row.SpellIconFileID <= 0 || typeof row.DisplayName_lang !== "string") {
    throw new Error(`Missing or invalid SkillLine icon for ${profession.id}.`);
  }
  const path = join(destination, `${profession.id}.webp`);
  await run(["icon", "export", "--file-data-id", String(row.SpellIconFileID), "--format", "webp", "--output", path, ...target(build)]);
  icons[profession.id] = {
    skillLineId: profession.skillLineId, displayName: row.DisplayName_lang,
    fileDataId: row.SpellIconFileID, path: `/icons/professions/${profession.id}.webp`,
    sha256: createHash("sha256").update(await readFile(path)).digest("hex"),
  };
}
await writeFile(join(destination, "manifest.json"), `${JSON.stringify({ schemaVersion: 1, source: { product, build, region: "us", locale: "enUS", table: "SkillLine", iconField: "SpellIconFileID" }, icons }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ product, build, icons: Object.keys(icons).length, outputDirectory: destination }));
