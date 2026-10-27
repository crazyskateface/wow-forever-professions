import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";
import { gatheringDatasetSchema } from "@forever-professions/contracts";
import { addGatherLite, convertGatheringClient, gatheringHash, renderGatheringAudit } from "../src/gathering-conversion.js";
import { normalizeScriptArguments } from "../src/cli.js";

const [clientRoot, build, output = "data/imports/forever-1.60.1.70630-gathering.json", observationsPath] = normalizeScriptArguments(process.argv.slice(2));
if (!clientRoot || !build || !/^1\.60\.\d+\.\d+$/.test(build)) throw new Error("Usage: convert-gathering <client root> <exact Forever build> [output JSON] [reviewed observation dataset]");
const root = process.env.INIT_CWD ?? process.cwd();
const executable = process.env.WOWDATA_PATH ?? (process.platform === "win32"
  ? (process.env.PATH ?? "").split(delimiter).map(path => join(path, "wowdata.ps1")).find(existsSync) : "wowdata");
if (!executable) throw new Error("wowdata is missing from PATH.");
const execute = promisify(execFile);
const target = ["--source", "local", "--path", resolve(root, clientRoot), "--region", "us", "--product", "wowf", "--build", build, "--locale", "enUS"];
async function run(args: string[]) {
  const ps = executable!.endsWith(".ps1");
  const pending = execute(ps ? "pwsh" : executable!, [...(ps ? ["-NoProfile", "-NonInteractive", "-File", executable!] : []), ...args, ...target], { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  pending.child.stdin?.end();
  const result = JSON.parse((await pending).stdout);
  if (result.ok !== true) throw new Error(JSON.stringify(result.error));
  return result.data;
}
async function sql(query: string): Promise<Record<string, unknown>[]> {
  const result = await run(["sql", query]);
  if (!Array.isArray(result.rows)) throw new Error("Missing wowdata SQL rows.");
  return result.rows;
}
const resolved = await run(["casc", "info"]);
if (resolved.buildName !== build) throw new Error("Resolved client build differs from the requested snapshot.");
const condition = "a.SkillLine IN (182,186,393)";
const abilities = await sql(`SELECT a.ID, a.SkillLine, a.Spell, a.MinSkillLineRank, a.TrivialSkillLineRankLow, a.TrivialSkillLineRankHigh FROM SkillLineAbility a WHERE ${condition} ORDER BY a.ID`);
const spells = await sql(`SELECT n.ID, n.Name_lang, s.Description_lang FROM SkillLineAbility a JOIN SpellName n ON n.ID=a.Spell JOIN Spell s ON s.ID=a.Spell WHERE ${condition} ORDER BY n.ID`);
const reagents = await sql(`SELECT r.SpellID, r.Reagent, r.ReagentCount FROM SkillLineAbility a JOIN SpellReagents r ON r.SpellID=a.Spell WHERE ${condition} ORDER BY r.SpellID`);
const effects = await sql(`SELECT e.ID, e.SpellID, e.Effect, e.EffectItemType FROM SkillLineAbility a JOIN SpellEffect e ON e.SpellID=a.Spell WHERE ${condition} ORDER BY e.ID`);
const itemIds = [...new Set([...reagents.flatMap(row => row.Reagent as number[]), ...effects.filter(row => row.Effect === 24).map(row => row.EffectItemType as number)].filter(id => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b);
const items = itemIds.length ? (await run(["db2", "rows", "ItemSparse", "--ids", itemIds.join(","), "--fields", "ID,Display_lang"])).rows : [];
let dataset = convertGatheringClient({ build, abilities, spells, reagents, effects, items });
const lock = JSON.parse(await readFile(resolve(root, "data/imports/gathering-sources.json"), "utf8"));
const sourceRoot = resolve(root, ".local-data/gathering-sources");
await mkdir(sourceRoot, { recursive: true });
async function sourceFile(path: string): Promise<string> {
  const expected = lock.gatherLite.files[path];
  if (typeof expected !== "string") throw new Error(`Unpinned gathering source ${path}.`);
  const file = join(sourceRoot, path.replaceAll("/", "_"));
  let bytes: Uint8Array;
  try { bytes = await readFile(file); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const response = await fetch(`https://raw.githubusercontent.com/Wuild/GatherLite/${lock.gatherLite.revision}/${path}`);
    if (!response.ok) throw new Error(`GatherLite download failed: ${response.status}`);
    bytes = new Uint8Array(await response.arrayBuffer());
    if (gatheringHash(bytes) !== expected) throw new Error(`Source hash mismatch: ${path}`);
    await writeFile(file, bytes);
  }
  if (gatheringHash(bytes) !== expected) throw new Error(`Source hash mismatch: ${path}`);
  return new TextDecoder().decode(bytes);
}
const license = await sourceFile("LICENSE");
if (!license.includes("MIT License")) throw new Error("Unexpected GatherLite license.");
const mapManifest = JSON.parse(await sourceFile("tools/maps/forever-1.60.1.70009/manifest.json"));
const maps = await sql("SELECT ID, Name_lang FROM UiMap ORDER BY ID");
dataset = addGatherLite(dataset, { nodes: await sourceFile("scripts/nodes.lua"), coordinates: await sourceFile("plugins/database/data/forever.lua"),
  revision: lock.gatherLite.revision, mapProjectionBuild: mapManifest.build, mapNames: new Map(maps.map(row => [Number(row.ID), String(row.Name_lang)])) });
if (observationsPath) {
  const observed = gatheringDatasetSchema.parse(JSON.parse(await readFile(resolve(root, observationsPath), "utf8")));
  if (observed.client.build !== build) throw new Error("Reviewed observation client build does not match.");
  if (observed.evidence.some(e => e.kind !== "observed-in-game" || !e.license || !e.revision)) throw new Error("Observations need explicit reuse permission/license and an export revision.");
  dataset = gatheringDatasetSchema.parse({ ...dataset,
    evidence: [...dataset.evidence, ...observed.evidence], sources: [...dataset.sources, ...observed.sources],
    locations: [...dataset.locations, ...observed.locations], yields: observed.yields,
  });
}
const destination = resolve(root, output);
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify(dataset) + "\n", "utf8");
await writeFile(destination.replace(/\.json$/, ".quality.md"), renderGatheringAudit(dataset), "utf8");
console.log(JSON.stringify({ build, abilities: dataset.abilities.length, sources: dataset.sources.length, locations: dataset.locations.length, yields: dataset.yields.length, output: destination }));
