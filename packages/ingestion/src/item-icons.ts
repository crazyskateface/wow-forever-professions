import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  importedBuildDatasetSchema,
  type ImportedBuildDataset,
  type ItemClientData,
  type ItemClientSource,
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

interface WowdataItemIconRow {
  readonly ID: number;
  readonly IconFileDataID: number;
}

interface WowdataItemMetadataRow {
  readonly ID: number;
  readonly ClassID: number;
  readonly SubclassID: number;
  readonly InventoryType: number;
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
  readonly Display_lang: string;
  readonly InventoryType: number;
  readonly ItemLevel: number;
  readonly OverallQualityID: number;
  readonly RequiredLevel: number;
  readonly SellPrice: number;
}

interface WowdataItemNameDescriptionRow {
  readonly ID: number;
  readonly Description_lang: string;
  readonly Color: number;
}

interface WowdataItemArmorTotalRow {
  readonly ItemLevel: number;
  readonly Cloth: number;
  readonly Leather: number;
  readonly Mail: number;
  readonly Plate: number;
}

interface WowdataItemArmorQualityRow {
  readonly ID: number;
  readonly Qualitymod: readonly number[];
}

interface WowdataArmorLocationRow {
  readonly ID: number;
  readonly Clothmodifier: number;
  readonly Leathermodifier: number;
  readonly Chainmodifier: number;
  readonly Platemodifier: number;
}

interface WowdataItemArmorShieldRow {
  readonly ItemLevel: number;
  readonly Quality: readonly number[];
}

export interface EnrichedItemClientRecord {
  readonly itemClassId: number;
  readonly itemSubClassId: number;
  readonly inventoryType: string;
  readonly clientData: ItemClientData;
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

export interface EnrichItemClientDataOptions {
  readonly dataset: ImportedBuildDataset;
  readonly wowInstallationRoot: string;
  readonly wowdataExecutable?: string;
}

export interface EnrichItemClientDataResult {
  readonly dataset: ImportedBuildDataset;
  readonly assetBuild: string;
  readonly enrichedItems: number;
  readonly classifiedItems: number;
  readonly classificationLabels: readonly string[];
}

const INVENTORY_TYPES: Readonly<Record<number, {
  readonly token: string;
  readonly equipmentSlot?: string;
}>> = {
  0: { token: "INVTYPE_NON_EQUIP_IGNORE" },
  1: { token: "INVTYPE_HEAD", equipmentSlot: "Head" },
  2: { token: "INVTYPE_NECK", equipmentSlot: "Neck" },
  3: { token: "INVTYPE_SHOULDER", equipmentSlot: "Shoulder" },
  4: { token: "INVTYPE_BODY", equipmentSlot: "Shirt" },
  5: { token: "INVTYPE_CHEST", equipmentSlot: "Chest" },
  6: { token: "INVTYPE_WAIST", equipmentSlot: "Waist" },
  7: { token: "INVTYPE_LEGS", equipmentSlot: "Legs" },
  8: { token: "INVTYPE_FEET", equipmentSlot: "Feet" },
  9: { token: "INVTYPE_WRIST", equipmentSlot: "Wrist" },
  10: { token: "INVTYPE_HAND", equipmentSlot: "Hands" },
  11: { token: "INVTYPE_FINGER", equipmentSlot: "Finger" },
  12: { token: "INVTYPE_TRINKET", equipmentSlot: "Trinket" },
  13: { token: "INVTYPE_WEAPON", equipmentSlot: "One-Hand" },
  14: { token: "INVTYPE_SHIELD", equipmentSlot: "Off Hand" },
  15: { token: "INVTYPE_RANGED", equipmentSlot: "Ranged" },
  16: { token: "INVTYPE_CLOAK", equipmentSlot: "Back" },
  17: { token: "INVTYPE_2HWEAPON", equipmentSlot: "Two-Hand" },
  18: { token: "INVTYPE_BAG", equipmentSlot: "Bag" },
  19: { token: "INVTYPE_TABARD", equipmentSlot: "Tabard" },
  20: { token: "INVTYPE_ROBE", equipmentSlot: "Chest" },
  21: { token: "INVTYPE_WEAPONMAINHAND", equipmentSlot: "Main Hand" },
  22: { token: "INVTYPE_WEAPONOFFHAND", equipmentSlot: "Off Hand" },
  23: { token: "INVTYPE_HOLDABLE", equipmentSlot: "Held In Off-hand" },
  24: { token: "INVTYPE_AMMO", equipmentSlot: "Ammo" },
  25: { token: "INVTYPE_THROWN", equipmentSlot: "Thrown" },
  26: { token: "INVTYPE_RANGEDRIGHT", equipmentSlot: "Ranged" },
  27: { token: "INVTYPE_QUIVER", equipmentSlot: "Quiver" },
  28: { token: "INVTYPE_RELIC", equipmentSlot: "Relic" },
  29: { token: "INVTYPE_PROFESSION_TOOL", equipmentSlot: "Profession Tool" },
  30: { token: "INVTYPE_PROFESSION_ACCESSORY", equipmentSlot: "Profession Accessory" },
  31: { token: "INVTYPE_PROFESSION_GEAR", equipmentSlot: "Profession Gear" },
  32: { token: "INVTYPE_EQUIPABLESPELL_OFFENSIVE", equipmentSlot: "Offensive Spell" },
  33: { token: "INVTYPE_EQUIPABLESPELL_UTILITY", equipmentSlot: "Utility Spell" },
  34: { token: "INVTYPE_EQUIPABLESPELL_DEFENSIVE", equipmentSlot: "Defensive Spell" },
  35: { token: "INVTYPE_EQUIPABLESPELL_WEAPON", equipmentSlot: "Weapon Spell" },
};

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function nonnegativeInteger(value: unknown): value is number {
  return integer(value) && value >= 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function rowsFromWowdata(value: unknown, table: string): readonly Record<string, unknown>[] {
  if (
    typeof value !== "object" ||
    value === null ||
    !("rows" in value) ||
    !Array.isArray((value as { readonly rows?: unknown }).rows)
  ) {
    throw new Error(`wowdata ${table} query did not return a rows array.`);
  }
  return (value as WowdataRowsResult).rows;
}

function numberArray(value: unknown): readonly number[] | undefined {
  return Array.isArray(value) && value.every(finiteNumber) ? value : undefined;
}

function calculateItemArmor(
  item: Pick<WowdataItemMetadataRow, "ClassID" | "SubclassID" | "InventoryType">,
  sparse: Pick<WowdataItemClassificationReferenceRow, "ItemLevel" | "OverallQualityID">,
  armorTotalByLevel: ReadonlyMap<number, WowdataItemArmorTotalRow>,
  armorQualityByLevel: ReadonlyMap<number, WowdataItemArmorQualityRow>,
  armorLocationByInventoryType: ReadonlyMap<number, WowdataArmorLocationRow>,
  shieldArmorByLevel: ReadonlyMap<number, WowdataItemArmorShieldRow>,
): number | undefined {
  if (item.ClassID !== 4) return undefined;

  if (item.SubclassID === 6) {
    const shieldArmor = shieldArmorByLevel.get(sparse.ItemLevel)?.Quality[
      sparse.OverallQualityID
    ];
    return finiteNumber(shieldArmor) && shieldArmor > 0
      ? Math.floor(shieldArmor + 0.5)
      : undefined;
  }

  const armorColumn = {
    1: "Cloth",
    2: "Leather",
    3: "Mail",
    4: "Plate",
  }[item.SubclassID] as keyof Pick<
    WowdataItemArmorTotalRow,
    "Cloth" | "Leather" | "Mail" | "Plate"
  > | undefined;
  const locationColumn = {
    1: "Clothmodifier",
    2: "Leathermodifier",
    3: "Chainmodifier",
    4: "Platemodifier",
  }[item.SubclassID] as keyof Pick<
    WowdataArmorLocationRow,
    "Clothmodifier" | "Leathermodifier" | "Chainmodifier" | "Platemodifier"
  > | undefined;
  if (armorColumn === undefined || locationColumn === undefined) return undefined;

  const totalArmor = armorTotalByLevel.get(sparse.ItemLevel)?.[armorColumn];
  const qualityModifier = armorQualityByLevel.get(sparse.ItemLevel)?.Qualitymod[
    sparse.OverallQualityID
  ];
  const armorLocationInventoryType = item.InventoryType === 20
    ? 5
    : item.InventoryType;
  const locationModifier = armorLocationByInventoryType.get(armorLocationInventoryType)?.[
    locationColumn
  ];
  if (
    !finiteNumber(totalArmor) ||
    !finiteNumber(qualityModifier) ||
    !finiteNumber(locationModifier)
  ) {
    return undefined;
  }
  const armor = totalArmor * qualityModifier * locationModifier;
  return armor > 0 ? Math.floor(armor + 0.5) : undefined;
}

export function parseWowdataItemClientData(
  itemRowsValue: unknown,
  sparseRowsValue: unknown,
  armorTotalRowsValue: unknown,
  armorQualityRowsValue: unknown,
  armorLocationRowsValue: unknown,
  shieldArmorRowsValue: unknown,
  source: ItemClientSource,
): Map<number, EnrichedItemClientRecord> {
  const items = new Map<number, WowdataItemMetadataRow>();
  for (const value of rowsFromWowdata(itemRowsValue, "Item")) {
    const row = value as Partial<WowdataItemMetadataRow>;
    if (
      positiveInteger(row.ID) &&
      nonnegativeInteger(row.ClassID) &&
      nonnegativeInteger(row.SubclassID) &&
      nonnegativeInteger(row.InventoryType)
    ) {
      items.set(row.ID, row as WowdataItemMetadataRow);
    }
  }

  const armorTotalByLevel = new Map<number, WowdataItemArmorTotalRow>();
  for (const value of rowsFromWowdata(armorTotalRowsValue, "ItemArmorTotal")) {
    const row = value as Partial<WowdataItemArmorTotalRow>;
    if (
      nonnegativeInteger(row.ItemLevel) &&
      finiteNumber(row.Cloth) &&
      finiteNumber(row.Leather) &&
      finiteNumber(row.Mail) &&
      finiteNumber(row.Plate)
    ) {
      armorTotalByLevel.set(row.ItemLevel, row as WowdataItemArmorTotalRow);
    }
  }

  const armorQualityByLevel = new Map<number, WowdataItemArmorQualityRow>();
  for (const value of rowsFromWowdata(armorQualityRowsValue, "ItemArmorQuality")) {
    const row = value as Partial<WowdataItemArmorQualityRow>;
    const qualityModifiers = numberArray(row.Qualitymod);
    if (nonnegativeInteger(row.ID) && qualityModifiers !== undefined) {
      armorQualityByLevel.set(row.ID, {
        ID: row.ID,
        Qualitymod: qualityModifiers,
      });
    }
  }

  const armorLocationByInventoryType = new Map<number, WowdataArmorLocationRow>();
  for (const value of rowsFromWowdata(armorLocationRowsValue, "ArmorLocation")) {
    const row = value as Partial<WowdataArmorLocationRow>;
    if (
      nonnegativeInteger(row.ID) &&
      finiteNumber(row.Clothmodifier) &&
      finiteNumber(row.Leathermodifier) &&
      finiteNumber(row.Chainmodifier) &&
      finiteNumber(row.Platemodifier)
    ) {
      armorLocationByInventoryType.set(row.ID, row as WowdataArmorLocationRow);
    }
  }

  const shieldArmorByLevel = new Map<number, WowdataItemArmorShieldRow>();
  for (const value of rowsFromWowdata(shieldArmorRowsValue, "ItemArmorShield")) {
    const row = value as Partial<WowdataItemArmorShieldRow>;
    const qualityValues = numberArray(row.Quality);
    if (nonnegativeInteger(row.ItemLevel) && qualityValues !== undefined) {
      shieldArmorByLevel.set(row.ItemLevel, {
        ItemLevel: row.ItemLevel,
        Quality: qualityValues,
      });
    }
  }

  const result = new Map<number, EnrichedItemClientRecord>();
  for (const value of rowsFromWowdata(sparseRowsValue, "ItemSparse")) {
    const row = value as Partial<WowdataItemClassificationReferenceRow>;
    const displayName = typeof row.Display_lang === "string" ? row.Display_lang.trim() : "";
    const item = positiveInteger(row.ID) ? items.get(row.ID) : undefined;
    if (
      item === undefined ||
      displayName.length === 0 ||
      !nonnegativeInteger(row.ItemLevel) ||
      !nonnegativeInteger(row.OverallQualityID) ||
      !nonnegativeInteger(row.RequiredLevel) ||
      !nonnegativeInteger(row.SellPrice)
    ) {
      continue;
    }
    const inventory = INVENTORY_TYPES[item.InventoryType] ?? {
      token: `INVTYPE_${item.InventoryType}`,
    };
    const sparse = row as WowdataItemClassificationReferenceRow;
    const armor = calculateItemArmor(
      item,
      sparse,
      armorTotalByLevel,
      armorQualityByLevel,
      armorLocationByInventoryType,
      shieldArmorByLevel,
    );
    result.set(item.ID, {
      itemClassId: item.ClassID,
      itemSubClassId: item.SubclassID,
      inventoryType: inventory.token,
      clientData: {
        displayName,
        qualityId: sparse.OverallQualityID,
        ...(inventory.equipmentSlot === undefined
          ? {}
          : { equipmentSlot: inventory.equipmentSlot }),
        ...(armor === undefined ? {} : { armor }),
        requiredLevel: sparse.RequiredLevel,
        sellPriceCopper: sparse.SellPrice,
        source,
      },
    });
  }
  return result;
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
    const { ID, IconFileDataID } = row as Partial<WowdataItemIconRow>;
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

export async function enrichItemClientData({
  dataset,
  wowInstallationRoot,
  wowdataExecutable = defaultWowdataExecutable(),
}: EnrichItemClientDataOptions): Promise<EnrichItemClientDataResult> {
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
  const clientItemRows: Record<string, unknown>[] = [];
  const itemRows: Record<string, unknown>[] = [];
  const descriptionIds = new Set<number>();
  for (const batch of chunks(itemIds, ITEM_QUERY_BATCH_SIZE)) {
    const sparseResult = await runWowdata<WowdataRowsResult>(
      wowdataExecutable,
      [
        "db2",
        "rows",
        "ItemSparse",
        "--ids",
        batch.join(","),
        "--fields",
        "ID,Display_lang,InventoryType,ItemLevel,OverallQualityID,RequiredLevel,SellPrice,ItemNameDescriptionID",
        ...pinnedTargetArguments,
      ],
      "wowdata db2 rows ItemSparse",
    );
    itemRows.push(...sparseResult.rows);
    for (const value of sparseResult.rows) {
      const row = value as Partial<WowdataItemClassificationReferenceRow>;
      if (positiveInteger(row.ItemNameDescriptionID)) {
        descriptionIds.add(row.ItemNameDescriptionID);
      }
    }
    const itemResult = await runWowdata<WowdataRowsResult>(
      wowdataExecutable,
      [
        "db2",
        "rows",
        "Item",
        "--ids",
        batch.join(","),
        "--fields",
        "ID,ClassID,SubclassID,InventoryType",
        ...pinnedTargetArguments,
      ],
      "wowdata db2 rows Item",
    );
    clientItemRows.push(...itemResult.rows);
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
  const armorTotalRows = await runWowdata<WowdataRowsResult>(
    wowdataExecutable,
    [
      "db2",
      "stream",
      "ItemArmorTotal",
      "--limit",
      "1000000",
      "--fields",
      "ID,ItemLevel,Cloth,Leather,Mail,Plate",
      "--format",
      "json",
      ...pinnedTargetArguments,
    ],
    "wowdata db2 stream ItemArmorTotal",
  );
  const armorQualityRows = await runWowdata<WowdataRowsResult>(
    wowdataExecutable,
    [
      "db2",
      "stream",
      "ItemArmorQuality",
      "--limit",
      "1000000",
      "--fields",
      "ID,Qualitymod",
      "--format",
      "json",
      ...pinnedTargetArguments,
    ],
    "wowdata db2 stream ItemArmorQuality",
  );
  const armorLocationRows = await runWowdata<WowdataRowsResult>(
    wowdataExecutable,
    [
      "db2",
      "stream",
      "ArmorLocation",
      "--limit",
      "1000000",
      "--fields",
      "ID,Clothmodifier,Leathermodifier,Chainmodifier,Platemodifier",
      "--format",
      "json",
      ...pinnedTargetArguments,
    ],
    "wowdata db2 stream ArmorLocation",
  );
  const shieldArmorRows = await runWowdata<WowdataRowsResult>(
    wowdataExecutable,
    [
      "db2",
      "stream",
      "ItemArmorShield",
      "--limit",
      "1000000",
      "--fields",
      "ID,ItemLevel,Quality",
      "--format",
      "json",
      ...pinnedTargetArguments,
    ],
    "wowdata db2 stream ItemArmorShield",
  );
  const clientData = parseWowdataItemClientData(
    { rows: clientItemRows },
    { rows: itemRows },
    armorTotalRows,
    armorQualityRows,
    armorLocationRows,
    shieldArmorRows,
    source,
  );
  const enrichItem = <Item extends { readonly gameId?: number | undefined }>(
    item: Item,
  ) => {
    const {
      clientData: _previousClientData,
      classification: _previousClassification,
      ...baseItem
    } = item as Item & {
      readonly clientData?: unknown;
      readonly classification?: unknown;
    };
    if (item.gameId === undefined) return baseItem;
    const enriched = clientData.get(item.gameId);
    const classification = classifications.get(item.gameId);
    return {
      ...baseItem,
      ...(enriched === undefined ? {} : enriched),
      ...(classification === undefined ? {} : { classification }),
    };
  };
  const enriched = importedBuildDatasetSchema.parse({
    ...dataset,
    professions: dataset.professions.map((profession) => ({
      ...profession,
      recipes: profession.recipes.map((recipe) => ({
        ...recipe,
        reagents: recipe.reagents.map((entry) => ({
          ...entry,
          item: enrichItem(entry.item),
        })),
        outputs: recipe.outputs.map((entry) => ({
          ...entry,
          item: enrichItem(entry.item),
        })),
      })),
    })),
  });

  return {
    dataset: enriched,
    assetBuild: cascInfo.buildName,
    enrichedItems: clientData.size,
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
