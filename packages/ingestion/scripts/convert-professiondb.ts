import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { convertProfessionDbSnapshot, normalizeScriptArguments } from "../src/index.js";

const [professionDbRoot, itemDbRoot, outputPath] = normalizeScriptArguments(
  process.argv.slice(2),
);
if (!professionDbRoot || !itemDbRoot || !outputPath) {
  throw new Error(
    "Usage: convert-professiondb <ProfessionDB root> <ItemDB root> <output JSON path>",
  );
}

const resolvedProfessionDbRoot = resolve(professionDbRoot);
const resolvedItemDbRoot = resolve(itemDbRoot);
const invocationDirectory = process.env.INIT_CWD
  ? resolve(process.env.INIT_CWD)
  : process.cwd();
const resolvedOutputPath = resolve(invocationDirectory, outputPath);
const [coreLua, recipeNamesLua, itemNamesLua] = await Promise.all([
  readFile(join(resolvedProfessionDbRoot, "Data", "Forever", "_core", "Leatherworking.lua"), "utf8"),
  readFile(join(resolvedProfessionDbRoot, "Data", "Forever", "enUS", "Leatherworking.lua"), "utf8"),
  readFile(join(resolvedItemDbRoot, "Data", "Forever", "enUS", "Names.lua"), "utf8"),
]);

const converted = convertProfessionDbSnapshot({
  coreLua,
  recipeNamesLua,
  itemNamesLua,
  profession: { id: "leatherworking", name: "Leatherworking", skillLineId: 165 },
  professionDbVersion: "v1.9.1",
  itemDbVersion: "v1.3.0",
  sourceUrl: "https://www.curseforge.com/wow/addons/libprofessiondb/files/9095167",
});

await mkdir(dirname(resolvedOutputPath), { recursive: true });
await writeFile(resolvedOutputPath, `${JSON.stringify(converted.dataset, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ outputPath: resolvedOutputPath, ...converted.report }, null, 2)}\n`);
