import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  enrichItemClientData,
  normalizeScriptArguments,
  parseRawDatasetBytes,
} from "../src/index.js";

const [datasetPath, requestedWowInstallationRoot] = normalizeScriptArguments(
  process.argv.slice(2),
);
if (!datasetPath) {
  throw new Error(
    "Usage: enrich-client-data <dataset JSON path> [WoW installation root]",
  );
}

const invocationDirectory = process.env.INIT_CWD
  ? resolve(process.env.INIT_CWD)
  : process.cwd();
const resolvedDatasetPath = resolve(invocationDirectory, datasetPath);
const wowInstallationRoot = requestedWowInstallationRoot ?? process.env.WOW_CLIENT_ROOT;
if (!wowInstallationRoot) {
  throw new Error(
    "A WoW installation root is required as the second argument or WOW_CLIENT_ROOT.",
  );
}

const dataset = parseRawDatasetBytes(await readFile(resolvedDatasetPath));
const result = await enrichItemClientData({
  dataset,
  wowInstallationRoot,
});
await writeFile(
  resolvedDatasetPath,
  `${JSON.stringify(result.dataset, null, 2)}\n`,
  "utf8",
);

process.stdout.write(
  `${JSON.stringify({
    outputPath: resolvedDatasetPath,
    assetBuild: result.assetBuild,
    enrichedItems: result.enrichedItems,
    classifiedItems: result.classifiedItems,
    classificationLabels: result.classificationLabels,
  }, null, 2)}\n`,
);
