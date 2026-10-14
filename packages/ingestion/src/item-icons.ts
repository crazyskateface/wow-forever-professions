import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  importedBuildDatasetSchema,
  type ImportedBuildDataset,
  type ItemClassification,
} from "@forever-professions/contracts";

const execFileAsync = promisify(execFile);
const DEFAULT_CONCURRENCY = 4;
const ITEM_QUERY_BATCH_SIZE = 400;
const WOWDATA_ATTEMPTS = 3;

function defaultWowdataExecutable(): string {
  return process.env.WOWDATA_PATH ?? (process.platform === "win32"
    ? join(homedir(), ".wowdata", "bin", "wowdata.exe")
    : "wowdata");
}

interface WowdataEnvelope<Data> {
  readonly ok: boolean;
  readonly data: Data | null;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

interface WowdataCascInfo {
  readonly buildName: string;
}

interface WowdataItemRow {
  readonly ID: number;
  readonly IconFileDataID: number;
}

interface WowdataRowsResult {
  readonly rows: readonly Record<string, unknown>[];
}

interface WowdataModifiedAppearanceRow {
  readonly ItemID: number;
  readonly ItemAppearanceID: number;
  readonly ItemAppearanceModifierID: number;
}

interface WowdataAppearanceRow {
  readonly ID: number;
  readonly DefaultIconFileDataID: number;
}

interface WowdataItemClassificationReferenceRow {
  readonly ID: number;
  readonly ItemNameDescriptionID: number;
}

interface WowdataItemNameDescriptionRow {
  readonly ID: number;
  readonly Description_lang: string;
  readonly Color: number;
}

export interface ItemIconManifestEntry {
  readonly fileDataId: number;
  readonly path: string;
}

export interface ItemIconManifest {
  readonly schemaVersion: 1;
  readonly recipeBuild: string;
  readonly assetBuild: string;
  readonly product: "wow_classic_beta";
  readonly locale: "enUS";
  readonly format: "webp";
  readonly icons: Readonly<Record<string, ItemIconManifestEntry>>;
  readonly missingItemIds: readonly number[];
}

export interface ExtractItemIconsOptions {
  readonly dataset: ImportedBuildDataset;
  readonly wowInstallationRoot: string;
  readonly outputDirectory: string;
  readonly wowdataExecutable?: string;
  readonly concurrency?: number;
  readonly onProgress?: (completed: number, total: number) => void;
}

export interface ExtractItemIconsResult {
  readonly assetBuild: string;
  readonly requestedItems: number;
  readonly exportedIcons: number;
  readonly reusedIcons: number;
  readonly missingItems: number;
  readonly outputDirectory: string;
  readonly manifestPath: string;
}

export interface EnrichItemClassificationsOptions {
  readonly dataset: ImportedBuildDataset;
  readonly wowInstallationRoot: string;
  readonly wowdataExecutable?: string;
}

export interface EnrichItemClassificationsResult {
  readonly dataset: ImportedBuildDataset;
  readonly assetBuild: string;
  readonly classifiedItems: number;
  readonly classificationLabels: readonly string[];
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function collectDatasetGameItemIds(dataset: ImportedBuildDataset): number[] {
  const result = new Set<number>();
  for (const profession of dataset.professions) {
    for (const recipe of profession.recipes) {
      for (const entry of [...recipe.reagents, ...recipe.outputs]) {
        if (entry.item.gameId !== undefined) result.add(entry.item.gameId);
      }
    }
  }
  return [...result].sort((left, right) => left - right);
}

export function parseWowdataItemRows(value: unknown): Map<number, number> {
  if (typeof value !== "object" || value === null || !("rows" in value)) {
    throw new Error("wowdata Item query did not return a rows array.");
  }
  const rows = (value as { readonly rows?: unknown }).rows;
  if (!Array.isArray(rows)) {
    throw new Error("wowdata Item query did not return a rows array.");
  }

  const result = new Map<number, number>();
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const { ID, IconFileDataID } = row as Partial<WowdataItemRow>;
    if (positiveInteger(ID) && positiveInteger(IconFileDataID)) {
      result.set(ID, IconFileDataID);
    }
  }
  return result;
}

export function parseWowdataItemClassifications(
  itemRowsValue: unknown,
  descriptionRowsValue: unknown,
  source: ItemClassification["source"],
): Map<number, ItemClassification> {
  if (
    typeof itemRowsValue !== "object" ||
    itemRowsValue === null ||
    !("rows" in itemRowsValue) ||
    !Array.isArray((itemRowsValue as { readonly rows?: unknown }).rows)
  ) {
    throw new Error("wowdata ItemSparse query did not return a rows array.");
  }
  if (
    typeof descriptionRowsValue !== "object" ||
    descriptionRowsValue === null ||
    !("rows" in descriptionRowsValue) ||
    !Array.isArray((descriptionRowsValue as { readonly rows?: unknown }).rows)
  ) {
    throw new Error("wowdata ItemNameDescription query did not return a rows array.");
  }

  const descriptions = new Map<number, Omit<ItemClassification, "source">>();
  for (const value of (descriptionRowsValue as WowdataRowsResult).rows) {
    const row = value as Partial<WowdataItemNameDescriptionRow>;
    if (
      positiveInteger(row.ID) &&
      typeof row.Description_lang === "string" &&
      row.Description_lang.trim().length > 0 &&
      integer(row.Color)
    ) {
      descriptions.set(row.ID, {
        id: row.ID,
        label: row.Description_lang.trim(),
        color: row.Color,
      });
    }
  }

  const classifications = new Map<number, ItemClassification>();
  for (const value of (itemRowsValue as WowdataRowsResult).rows) {
    const row = value as Partial<WowdataItemClassificationReferenceRow>;
    if (!positiveInteger(row.ID) || !positiveInteger(row.ItemNameDescriptionID)) continue;
    const description = descriptions.get(row.ItemNameDescriptionID);
    if (description !== undefined) {
      classifications.set(row.ID, { ...description, source });
    }
  }
  return classifications;
}

function parseWowdataEnvelope<Data>(stdout: string, command: string): Data {
  let envelope: WowdataEnvelope<Data>;
  try {
    envelope = JSON.parse(stdout) as WowdataEnvelope<Data>;
  } catch {
    throw new Error(`${command} returned invalid JSON.`);
  }
  if (!envelope.ok || envelope.data === null) {
    throw new Error(
      `${command} failed${envelope.error?.message ? `: ${envelope.error.message}` : "."}`,
    );
  }
  return envelope.data;
}

function wowdataTargetArguments(
  wowInstallationRoot: string,
  build = "latest",
): string[] {
  return [
    "--source",
    "local",
    "--region",
    "us",
    "--product",
    "wow_classic_beta",
    "--build",
    build,
    "--locale",
    "enUS",
    "--path",
    wowInstallationRoot,
  ];
}

async function runWowdata<Data>(
  executable: string,
  arguments_: readonly string[],
  command: string,
): Promise<Data> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= WOWDATA_ATTEMPTS; attempt += 1) {
    try {
      const { stdout } = await execFileAsync(executable, arguments_, {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      });
      return parseWowdataEnvelope<Data>(stdout, command);
    } catch (error) {
      lastError = error;
      if (attempt < WOWDATA_ATTEMPTS) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 150));
      }
    }
  }
  throw lastError;
}

function chunks<Item>(values: readonly Item[], size: number): Item[][] {
  const result: Item[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function mapConcurrent<Item>(
  values: readonly Item[],
  concurrency: number,
  operation: (value: Item) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    async () => {
      while (nextIndex < values.length) {
        const value = values[nextIndex];
        nextIndex += 1;
        if (value !== undefined) await operation(value);
      }
    },
  );
  await Promise.all(workers);
}

async function readExistingManifest(path: string): Promise<ItemIconManifest | undefined> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<ItemIconManifest>;
    return value.schemaVersion === 1 ? value as ItemIconManifest : undefined;
  } catch {
    return undefined;
  }
}

export async function enrichItemClassifications({
  dataset,
  wowInstallationRoot,
  wowdataExecutable = defaultWowdataExecutable(),
}: EnrichItemClassificationsOptions): Promise<EnrichItemClassificationsResult> {
  const resolvedClientRoot = resolve(wowInstallationRoot);
  const targetArguments = wowdataTargetArguments(resolvedClientRoot);
  const itemIds = collectDatasetGameItemIds(dataset);
  if (itemIds.length === 0) throw new Error("The converted dataset has no game item IDs.");

  const cascInfo = await runWowdata<WowdataCascInfo>(
    wowdataExecutable,
    ["casc", "info", ...targetArguments],
    "wowdata casc info",
  );
  const pinnedTargetArguments = wowdataTargetArguments(
    resolvedClientRoot,
    cascInfo.buildName,
  );
  const itemRows: Record<string, unknown>[] = [];
  const descriptionIds = new Set<number>();
  for (const batch of chunks(itemIds, ITEM_QUERY_BATCH_SIZE)) {
    const result = await runWowdata<WowdataRowsResult>(
      wowdataExecutable,
      [
        "db2",
        "rows",
        "ItemSparse",
        "--ids",
        batch.join(","),
        "--fields",
        "ID,ItemNameDescriptionID",
        ...pinnedTargetArguments,
      ],
      "wowdata db2 rows ItemSparse",
    );
    itemRows.push(...result.rows);
    for (const value of result.rows) {
      const row = value as Partial<WowdataItemClassificationReferenceRow>;
      if (positiveInteger(row.ItemNameDescriptionID)) {
        descriptionIds.add(row.ItemNameDescriptionID);
      }
    }
  }

  const descriptionRows: Record<string, unknown>[] = [];
  for (const batch of chunks([...descriptionIds], ITEM_QUERY_BATCH_SIZE)) {
    const result = await runWowdata<WowdataRowsResult>(
      wowdataExecutable,
      [
        "db2",
        "rows",
        "ItemNameDescription",
        "--ids",
        batch.join(","),
        "--fields",
        "ID,Description_lang,Color",
        ...pinnedTargetArguments,
      ],
      "wowdata db2 rows ItemNameDescription",
    );
    descriptionRows.push(...result.rows);
  }

  const source = {
    product: "wow_classic_beta",
    build: cascInfo.buildName,
    locale: "enUS",
  } as const;
  const classifications = parseWowdataItemClassifications(
    { rows: itemRows },
    { rows: descriptionRows },
    source,
  );
  const enriched = importedBuildDatasetSchema.parse({
    ...dataset,
    professions: dataset.professions.map((profession) => ({
      ...profession,
      recipes: profession.recipes.map((recipe) => ({
        ...recipe,
        reagents: recipe.reagents.map((entry) => ({
          ...entry,
          item: entry.item.gameId === undefined
            ? entry.item
            : {
                ...entry.item,
                ...(classifications.get(entry.item.gameId) === undefined
                  ? {}
                  : { classification: classifications.get(entry.item.gameId) }),
              },
        })),
        outputs: recipe.outputs.map((entry) => ({
          ...entry,
          item: entry.item.gameId === undefined
            ? entry.item
            : {
                ...entry.item,
                ...(classifications.get(entry.item.gameId) === undefined
                  ? {}
                  : { classification: classifications.get(entry.item.gameId) }),
              },
        })),
      })),
    })),
  });

  return {
    dataset: enriched,
    assetBuild: cascInfo.buildName,
    classifiedItems: classifications.size,
    classificationLabels: [...new Set(
      [...classifications.values()].map(({ label }) => label),
    )].sort(),
  };
}

export async function extractItemIcons({
  dataset,
  wowInstallationRoot,
  outputDirectory,
  wowdataExecutable = defaultWowdataExecutable(),
  concurrency = DEFAULT_CONCURRENCY,
  onProgress,
}: ExtractItemIconsOptions): Promise<ExtractItemIconsResult> {
  const resolvedClientRoot = resolve(wowInstallationRoot);
  const resolvedOutputDirectory = resolve(outputDirectory);
  const targetArguments = wowdataTargetArguments(resolvedClientRoot);
  const itemIds = collectDatasetGameItemIds(dataset);
  if (itemIds.length === 0) throw new Error("The converted dataset has no game item IDs.");

  const cascInfo = await runWowdata<WowdataCascInfo>(
    wowdataExecutable,
    ["casc", "info", ...targetArguments],
    "wowdata casc info",
  );
  const pinnedTargetArguments = wowdataTargetArguments(
    resolvedClientRoot,
    cascInfo.buildName,
  );
  const iconFileDataIds = new Map<number, number>();
  for (const batch of chunks(itemIds, ITEM_QUERY_BATCH_SIZE)) {
    const rows = await runWowdata<WowdataRowsResult>(
      wowdataExecutable,
      [
        "db2",
        "rows",
        "Item",
        "--ids",
        batch.join(","),
        "--fields",
        "ID,IconFileDataID",
        ...pinnedTargetArguments,
      ],
      "wowdata db2 rows Item",
    );
    for (const [itemId, fileDataId] of parseWowdataItemRows(rows)) {
      iconFileDataIds.set(itemId, fileDataId);
    }
  }

  const unresolvedItemIds = new Set(
    itemIds.filter((itemId) => !iconFileDataIds.has(itemId)),
  );
  if (unresolvedItemIds.size > 0) {
    const modifiedAppearances = await runWowdata<WowdataRowsResult>(
      wowdataExecutable,
      [
        "db2",
        "stream",
        "ItemModifiedAppearance",
        "--limit",
        "1000000",
        "--fields",
        "ItemID,ItemAppearanceID,ItemAppearanceModifierID",
        "--format",
        "json",
        ...pinnedTargetArguments,
      ],
      "wowdata db2 stream ItemModifiedAppearance",
    );
    const appearanceByItemId = new Map<number, number>();
    for (const value of modifiedAppearances.rows) {
      const row = value as Partial<WowdataModifiedAppearanceRow>;
      if (
        positiveInteger(row.ItemID) &&
        positiveInteger(row.ItemAppearanceID) &&
        unresolvedItemIds.has(row.ItemID) &&
        (row.ItemAppearanceModifierID === 0 || !appearanceByItemId.has(row.ItemID))
      ) {
        appearanceByItemId.set(row.ItemID, row.ItemAppearanceID);
      }
    }

    const appearanceIds = [...new Set(appearanceByItemId.values())];
    const iconByAppearanceId = new Map<number, number>();
    for (const batch of chunks(appearanceIds, ITEM_QUERY_BATCH_SIZE)) {
      const appearances = await runWowdata<WowdataRowsResult>(
        wowdataExecutable,
        [
          "db2",
          "rows",
          "ItemAppearance",
          "--ids",
          batch.join(","),
          "--fields",
          "ID,DefaultIconFileDataID",
          ...pinnedTargetArguments,
        ],
        "wowdata db2 rows ItemAppearance",
      );
      for (const value of appearances.rows) {
        const row = value as Partial<WowdataAppearanceRow>;
        if (positiveInteger(row.ID) && positiveInteger(row.DefaultIconFileDataID)) {
          iconByAppearanceId.set(row.ID, row.DefaultIconFileDataID);
        }
      }
    }
    for (const [itemId, appearanceId] of appearanceByItemId) {
      const fileDataId = iconByAppearanceId.get(appearanceId);
      if (fileDataId !== undefined) iconFileDataIds.set(itemId, fileDataId);
    }
  }

  await mkdir(resolvedOutputDirectory, { recursive: true });
  const manifestPath = join(resolvedOutputDirectory, "manifest.json");
  const existingManifest = await readExistingManifest(manifestPath);
  const canReuseExisting = existingManifest?.assetBuild === cascInfo.buildName;
  const entries = new Map<number, ItemIconManifestEntry>();
  const missingItemIds = itemIds.filter((itemId) => !iconFileDataIds.has(itemId));
  const itemsByFileDataId = new Map<number, number[]>();
  for (const [itemId, fileDataId] of iconFileDataIds) {
    const itemGroup = itemsByFileDataId.get(fileDataId) ?? [];
    itemGroup.push(itemId);
    itemsByFileDataId.set(fileDataId, itemGroup);
  }

  let completed = 0;
  let reusedIcons = 0;
  const groups = [...itemsByFileDataId.entries()];
  await mapConcurrent(groups, concurrency, async ([fileDataId, groupedItemIds]) => {
    const canonicalItemId = groupedItemIds[0]!;
    const canonicalOutputPath = join(resolvedOutputDirectory, `${canonicalItemId}.webp`);
    const reusableEntry = existingManifest?.icons[String(canonicalItemId)];
    const canReuse = canReuseExisting && reusableEntry?.fileDataId === fileDataId;
    if (canReuse) {
      try {
        await readFile(canonicalOutputPath);
        reusedIcons += 1;
      } catch {
        await runWowdata(
          wowdataExecutable,
          [
            "icon",
            "export",
            "--file-data-id",
            String(fileDataId),
            "--format",
            "webp",
            "--output",
            canonicalOutputPath,
            ...pinnedTargetArguments,
          ],
          `wowdata icon export ${fileDataId}`,
        );
      }
    } else {
      await runWowdata(
        wowdataExecutable,
        [
          "icon",
          "export",
          "--file-data-id",
          String(fileDataId),
          "--format",
          "webp",
          "--output",
          canonicalOutputPath,
          ...pinnedTargetArguments,
        ],
        `wowdata icon export ${fileDataId}`,
      );
    }

    for (const itemId of groupedItemIds) {
      const outputPath = join(resolvedOutputDirectory, `${itemId}.webp`);
      if (itemId !== canonicalItemId) await copyFile(canonicalOutputPath, outputPath);
      entries.set(itemId, {
        fileDataId,
        path: `/icons/items/${itemId}.webp`,
      });
    }
    completed += groupedItemIds.length;
    onProgress?.(completed, itemIds.length);
  });

  const manifest: ItemIconManifest = {
    schemaVersion: 1,
    recipeBuild: dataset.build.id,
    assetBuild: cascInfo.buildName,
    product: "wow_classic_beta",
    locale: "enUS",
    format: "webp",
    icons: Object.fromEntries(
      [...entries].sort(([left], [right]) => left - right).map(([itemId, entry]) => [
        String(itemId),
        entry,
      ]),
    ),
    missingItemIds,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    assetBuild: cascInfo.buildName,
    requestedItems: itemIds.length,
    exportedIcons: entries.size,
    reusedIcons,
    missingItems: missingItemIds.length,
    outputDirectory: resolvedOutputDirectory,
    manifestPath,
  };
}
