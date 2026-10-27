import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import {
  applyRecipeOverrides,
  bundleProfessionDbSnapshots,
  convertProfessionDbSnapshot,
  enrichItemClientData,
  extractItemIcons,
  normalizeScriptArguments,
  parseRawDatasetBytes,
} from "../src/index.js";
import {
  importedRecipeOverridesSchema,
  PROFESSIONS,
  type ImportedRecipeOverrides,
} from "@forever-professions/contracts";

interface PinnedSourceProject {
  readonly version: string;
  readonly pageUrl: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readPinnedSources(path: string): Promise<{
  readonly professionDb: PinnedSourceProject;
  readonly itemDb: PinnedSourceProject;
}> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(value) || !isRecord(value.projects)) {
    throw new Error(`Source release lock is missing projects: ${path}`);
  }
  const project = (key: "professionDb" | "itemDb"): PinnedSourceProject => {
    const candidate = value.projects[key];
    if (
      !isRecord(candidate) ||
      typeof candidate.version !== "string" ||
      candidate.version.trim() === "" ||
      typeof candidate.pageUrl !== "string" ||
      candidate.pageUrl.trim() === ""
    ) {
      throw new Error(`Source release lock has an invalid ${key} record: ${path}`);
    }
    return { version: candidate.version, pageUrl: candidate.pageUrl };
  };
  return { professionDb: project("professionDb"), itemDb: project("itemDb") };
}

const [
  professionDbRoot,
  itemDbRoot,
  outputPath,
  requestedGameVersion,
  canonicalItemDatasetPath,
  recipeOverridesPath,
  requestedWowInstallationRoot,
  requestedIconOutputDirectory,
] = normalizeScriptArguments(process.argv.slice(2));
if (!professionDbRoot || !itemDbRoot || !outputPath) {
  throw new Error(
    "Usage: convert-professiondb <ProfessionDB root> <ItemDB root> <output JSON path> [Forever|Vanilla] [canonical item dataset JSON|-] [recipe overrides JSON] [WoW installation root] [item icon output directory]",
  );
}
if (
  requestedGameVersion !== undefined &&
  requestedGameVersion !== "Forever" &&
  requestedGameVersion !== "Vanilla"
) {
  throw new Error("Game version must be Forever or Vanilla.");
}
const gameVersion = requestedGameVersion ?? "Forever";

const invocationDirectory = process.env.INIT_CWD
  ? resolve(process.env.INIT_CWD)
  : process.cwd();
const pinnedSources = await readPinnedSources(
  resolve(invocationDirectory, "data/imports/source-releases.json"),
);
const resolvedProfessionDbRoot = resolve(invocationDirectory, professionDbRoot);
const resolvedItemDbRoot = resolve(invocationDirectory, itemDbRoot);
const resolvedOutputPath = resolve(invocationDirectory, outputPath);
const requestedClientRoot = requestedWowInstallationRoot ?? process.env.WOW_CLIENT_ROOT;
const wowInstallationRoot = requestedClientRoot === undefined
  ? undefined
  : resolve(invocationDirectory, requestedClientRoot);
const resolvedIconOutputDirectory = resolve(
  invocationDirectory,
  requestedIconOutputDirectory ??
    process.env.ITEM_ICON_OUTPUT_DIR ??
    "apps/web/public/icons/items",
);
const recipeOverrides = recipeOverridesPath === undefined
  ? undefined
  : readFile(resolve(invocationDirectory, recipeOverridesPath), "utf8").then((contents) =>
      importedRecipeOverridesSchema.parse(JSON.parse(contents)) as ImportedRecipeOverrides,
    );
const canonicalItemNames = canonicalItemDatasetPath === undefined || canonicalItemDatasetPath === "-"
  ? undefined
  : (() => {
      const values = new Map<number, string>();
      return readFile(resolve(invocationDirectory, canonicalItemDatasetPath)).then((bytes) => {
        const dataset = parseRawDatasetBytes(bytes);
        for (const profession of dataset.professions) {
          for (const recipe of profession.recipes) {
            for (const entry of [...recipe.reagents, ...recipe.outputs]) {
              if (entry.item.gameId !== undefined) {
                values.set(entry.item.gameId, entry.item.name);
              }
            }
          }
        }
        return values;
      });
    })();
const professionCoreDirectory = join(resolvedProfessionDbRoot, "Data", gameVersion, "_core");
const itemCoreDirectory = join(resolvedItemDbRoot, "Data", gameVersion, "_core");
const itemCoreFiles = (await readdir(itemCoreDirectory)).filter((name) => name.endsWith(".lua"));
const [
  acquireMethodsLua,
  recipeItemsLua,
  sourcesLua,
  hiddenRecipesLua,
  itemNamesLua,
  itemCoreSources,
] = await Promise.all([
  readFile(join(resolvedProfessionDbRoot, "Data", gameVersion, "_core", "AcquireMethods.lua"), "utf8"),
  readFile(join(professionCoreDirectory, "RecipeItems.lua"), "utf8"),
  readFile(join(professionCoreDirectory, "Sources.lua"), "utf8"),
  readFile(join(professionCoreDirectory, "HiddenRecipes.lua"), "utf8"),
  readFile(join(resolvedItemDbRoot, "Data", gameVersion, "enUS", "Names.lua"), "utf8"),
  Promise.all(itemCoreFiles.map((name) => readFile(join(itemCoreDirectory, name), "utf8"))),
]);
const itemCoreLua = itemCoreSources.filter((source) => source.includes("lib:LoadCore("));
const resolvedCanonicalItemNames = await canonicalItemNames;

const convertedProfessions = await Promise.all(PROFESSIONS.map(async (profession) => convertProfessionDbSnapshot({
  coreLua: await readFile(join(professionCoreDirectory, `${profession.sourceName}.lua`), "utf8"),
  acquireMethodsLua,
  recipeItemsLua,
  sourcesLua,
  hiddenRecipesLua,
  recipeNamesLua: await readFile(join(resolvedProfessionDbRoot, "Data", gameVersion, "enUS", `${profession.sourceName}.lua`), "utf8"),
  itemNamesLua,
  itemCoreLua,
  profession,
  professionDbVersion: process.env.PROFESSION_DB_VERSION?.trim() || pinnedSources.professionDb.version,
  itemDbVersion: process.env.ITEM_DB_VERSION?.trim() || pinnedSources.itemDb.version,
  sourceUrl:
    process.env.PROFESSION_DB_SOURCE_URL?.trim() ||
    pinnedSources.professionDb.pageUrl,
  gameVersion,
  ...(resolvedCanonicalItemNames === undefined
    ? {}
    : { canonicalItemNames: resolvedCanonicalItemNames }),
})));
const converted = {
  dataset: bundleProfessionDbSnapshots(convertedProfessions.map(({ dataset }) => dataset)),
  report: { professions: convertedProfessions.map(({ dataset, report }) => ({ professionId: dataset.professions[0]!.id, ...report })) },
};
const resolvedRecipeOverrides = await recipeOverrides;
const overridden = resolvedRecipeOverrides === undefined
  ? { dataset: converted.dataset, appliedRecipeIds: [] }
  : applyRecipeOverrides(converted.dataset, resolvedRecipeOverrides);
const clientDataResult = wowInstallationRoot === undefined
  ? undefined
  : await enrichItemClientData({
      dataset: overridden.dataset,
      wowInstallationRoot,
    });
const finalDataset = clientDataResult?.dataset ?? overridden.dataset;
const finalRecipes = finalDataset.professions.flatMap(({ recipes }) => recipes);

await mkdir(dirname(resolvedOutputPath), { recursive: true });
await writeFile(resolvedOutputPath, `${JSON.stringify(finalDataset, null, 2)}\n`, "utf8");
const iconResult = wowInstallationRoot === undefined
  ? undefined
  : await extractItemIcons({
      dataset: finalDataset,
      wowInstallationRoot,
      outputDirectory: resolvedIconOutputDirectory,
      onProgress(completed, total) {
        if (completed === total || completed % 100 < 6) {
          process.stderr.write(`Item icons: ${completed}/${total}\n`);
        }
      },
    });
process.stdout.write(
  `${JSON.stringify({
    outputPath: resolvedOutputPath,
    ...converted.report,
    knownLearnSkillRecipes: finalRecipes.filter(({ metadata }) => metadata.learnSkill !== null)
      .length,
    provisionalOutputQuantityRecipes: finalRecipes.filter(({ verification }) =>
      verification.notes?.includes("Output quantity is provisionally one") ?? false,
    ).length,
    appliedRecipeOverrides: overridden.appliedRecipeIds.length,
    ...(clientDataResult === undefined
      ? {}
      : {
          itemClientData: {
            assetBuild: clientDataResult.assetBuild,
            enrichedItems: clientDataResult.enrichedItems,
            classifiedItems: clientDataResult.classifiedItems,
            classificationLabels: clientDataResult.classificationLabels,
          },
        }),
    ...(iconResult === undefined ? {} : { itemIcons: iconResult }),
  }, null, 2)}\n`,
);
