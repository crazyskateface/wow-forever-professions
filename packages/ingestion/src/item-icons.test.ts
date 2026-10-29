import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportedBuildDataset } from "@forever-professions/contracts";
import {
  collectDatasetGameItemIds,
  clientProduct,
  parseItemIconManifest,
  serializeItemIconManifest,
  parseWowdataItemClientData,
  parseWowdataItemClassifications,
  parseWowdataItemRows,
} from "./item-icons.js";

describe("item icon extraction", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("retains the explicit Forever product and rejects unrelated client products", () => {
    vi.stubEnv("WOW_CLIENT_PRODUCT", "wowf");
    expect(clientProduct()).toBe("wowf");
    vi.stubEnv("WOW_CLIENT_PRODUCT", "wow");
    expect(() => clientProduct()).toThrow(/Forever client/);
  });
  it("round-trips all profession icon mappings below the existing manifest budget and reads v1", () => {
    const manifest = {
      schemaVersion: 1 as const, recipeBuild: "1.60.1.69977", assetBuild: "1.60.1.70630",
      product: "wowf" as const, locale: "enUS" as const, format: "webp" as const,
      icons: Object.fromEntries(Array.from({ length: 2720 }, (_, index) => [String(index + 1), { fileDataId: index + 100000, path: `/icons/items/${index + 1}.webp` }])),
      missingItemIds: [99999],
    };
    const serialized = serializeItemIconManifest(manifest);
    expect(Buffer.byteLength(serialized)).toBeLessThan(80000);
    expect(parseItemIconManifest(JSON.parse(serialized))).toEqual(manifest);
    expect(parseItemIconManifest(manifest)).toEqual(manifest);
    expect(parseItemIconManifest({ schemaVersion: 2, icons: { "1": "invalid" } })).toBeUndefined();
  });
  it("collects sorted, unique reagent and output item IDs", () => {
    const dataset = {
      professions: [
        {
          recipes: [
            {
              reagents: [
                { item: { gameId: 2320 } },
                { item: { gameId: 2318 } },
              ],
              outputs: [{ item: { gameId: 2302 } }],
            },
            {
              reagents: [{ item: { gameId: 2318 } }],
              outputs: [{ item: {} }],
            },
          ],
        },
      ],
    } as unknown as ImportedBuildDataset;

    expect(collectDatasetGameItemIds(dataset)).toEqual([2302, 2318, 2320]);
  });

  it("keeps only positive item and icon file IDs from wowdata rows", () => {
    expect(
      [...parseWowdataItemRows({
        rows: [
          { ID: 2302, IconFileDataID: 132538 },
          { ID: 2303, IconFileDataID: 0 },
          { ID: "2304", IconFileDataID: 132539 },
        ],
      })],
    ).toEqual([[2302, 132538]]);
  });

  it("maps the client's generic item-name descriptions onto item IDs", () => {
    const source = {
      product: "wow_classic_beta",
      build: "1.60.1.70374",
      locale: "enUS",
    };

    expect([...parseWowdataItemClassifications(
      {
        rows: [
          { ID: 249427, ItemNameDescriptionID: 14483 },
          { ID: 4234, ItemNameDescriptionID: 0 },
          { ID: "249428", ItemNameDescriptionID: 14483 },
        ],
      },
      { rows: [{ ID: 14483, Description_lang: "Scarce", Color: -7885825 }] },
      source,
    )]).toEqual([
      [249427, {
        id: 14483,
        label: "Scarce",
        color: -7885825,
        source,
      }],
    ]);
  });

  it("imports tooltip fields and derives armor from the pinned client tables", () => {
    const source = {
      product: "wow_classic_beta",
      build: "1.60.1.70374",
      locale: "enUS",
    };
    const records = parseWowdataItemClientData(
      {
        rows: [
          { ID: 1449, ClassID: 4, SubclassID: 0, InventoryType: 11 },
          { ID: 1450, ClassID: 4, SubclassID: 0, InventoryType: 11 },
          { ID: 2308, ClassID: 4, SubclassID: 1, InventoryType: 16 },
          { ID: 2318, ClassID: 7, SubclassID: 6, InventoryType: 0 },
          { ID: 9999, ClassID: 4, SubclassID: 1, InventoryType: 20 },
        ],
      },
      {
        rows: [
          {
            ID: 1449,
            Display_lang: "Minor Channeling Ring",
            InventoryType: 11,
            ItemLevel: 24,
            OverallQualityID: 2,
            RequiredLevel: 0,
            SellPrice: 1875,
            StatModifier_bonusStat: [5, 45, -1, -1, -1, -1, -1, -1, -1, -1],
            StatPercentEditor: [4000, 9360, 0, 0, 0, 0, 0, 0, 0, 0],
          },
          {
            ID: 1450,
            Display_lang: "Regeneration Test Ring",
            InventoryType: 11,
            ItemLevel: 24,
            OverallQualityID: 2,
            RequiredLevel: 20,
            SellPrice: 2000,
            StatModifier_bonusStat: [43, 46, -1, -1, -1, -1, -1, -1, -1, -1],
            StatPercentEditor: [10000, 10000, 0, 0, 0, 0, 0, 0, 0, 0],
          },
          {
            ID: 2308,
            Display_lang: "Fine Leather Cloak",
            InventoryType: 16,
            ItemLevel: 15,
            OverallQualityID: 2,
            RequiredLevel: 10,
            SellPrice: 267,
            StatModifier_bonusStat: [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            StatPercentEditor: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          },
          {
            ID: 2318,
            Display_lang: "Light Leather",
            InventoryType: 0,
            ItemLevel: 10,
            OverallQualityID: 1,
            RequiredLevel: 0,
            SellPrice: 15,
            StatModifier_bonusStat: [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            StatPercentEditor: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          },
          {
            ID: 9999,
            Display_lang: "Test Robe",
            InventoryType: 20,
            ItemLevel: 15,
            OverallQualityID: 2,
            RequiredLevel: 10,
            SellPrice: 300,
            StatModifier_bonusStat: [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            StatPercentEditor: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          },
        ],
      },
      { rows: [{ ItemLevel: 15, Cloth: 174.37, Leather: 434.66, Mail: 899.43, Plate: 768.16 }] },
      { rows: [{ ID: 15, Qualitymod: [0.9, 0.95, 1, 1.1, 1.2, 1.2, 1.2] }] },
      {
        rows: [
          {
            ID: 5,
            Clothmodifier: 0.25,
            Leathermodifier: 0.25,
            Chainmodifier: 0.25,
            Platemodifier: 0.25,
          },
          {
            ID: 16,
            Clothmodifier: 0.08,
            Leathermodifier: 0.08,
            Chainmodifier: 0.08,
            Platemodifier: 0.08,
          },
        ],
      },
      { rows: [] },
      {
        rows: [{
          ID: 24,
          GoodF: [8, 6, 5, 3, 3],
          SuperiorF: [13, 10, 7, 6, 4],
          EpicF: [19, 14, 11, 8, 6],
        }],
      },
      {
        rows: [
          { BaseTag: "ITEM_MOD_INTELLECT", TagText_lang: "%c%s Intellect" },
          { BaseTag: "ITEM_MOD_SPELL_POWER", TagText_lang: "Increases spell power by %s." },
          { BaseTag: "ITEM_MOD_MANA_REGENERATION", TagText_lang: "Restores %s mana per 5 sec." },
          { BaseTag: "ITEM_MOD_HEALTH_REGEN", TagText_lang: "Restores %s health per 5 sec." },
        ],
      },
      source,
    );

    expect(records.get(1449)?.clientData).toEqual({
      displayName: "Minor Channeling Ring",
      qualityId: 2,
      equipmentSlot: "Finger",
      stats: [
        {
          statId: 5,
          value: 2,
          displayText: "+2 Intellect",
          displayTone: "attribute",
        },
        {
          statId: 45,
          value: 5,
          displayText: "Equip: Increases spell power by 5.",
          displayTone: "effect",
        },
      ],
      requiredLevel: 0,
      sellPriceCopper: 1875,
      source,
    });

    expect(records.get(1450)?.clientData.stats).toEqual([
      {
        statId: 43,
        value: 5,
        displayText: "Equip: Restores 5 mana per 5 sec.",
        displayTone: "effect",
      },
      {
        statId: 46,
        value: 5,
        displayText: "Equip: Restores 5 health per 5 sec.",
        displayTone: "effect",
      },
    ]);

    expect(records.get(2308)).toEqual({
      itemClassId: 4,
      itemSubClassId: 1,
      inventoryType: "INVTYPE_CLOAK",
      clientData: {
        displayName: "Fine Leather Cloak",
        qualityId: 2,
        equipmentSlot: "Back",
        armor: 14,
        requiredLevel: 10,
        sellPriceCopper: 267,
        source,
      },
    });
    expect(records.get(2318)?.clientData).toEqual({
      displayName: "Light Leather",
      qualityId: 1,
      requiredLevel: 0,
      sellPriceCopper: 15,
      source,
    });
    expect(records.get(9999)?.clientData).toEqual({
      displayName: "Test Robe",
      qualityId: 2,
      equipmentSlot: "Chest",
      armor: 44,
      requiredLevel: 10,
      sellPriceCopper: 300,
      source,
    });
  });
});
