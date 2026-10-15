import { describe, expect, it } from "vitest";
import type { ImportedBuildDataset } from "@forever-professions/contracts";
import {
  collectDatasetGameItemIds,
  parseWowdataItemClientData,
  parseWowdataItemClassifications,
  parseWowdataItemRows,
} from "./item-icons.js";

describe("item icon extraction", () => {
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
          { ID: 2308, ClassID: 4, SubclassID: 1, InventoryType: 16 },
          { ID: 2318, ClassID: 7, SubclassID: 6, InventoryType: 0 },
        ],
      },
      {
        rows: [
          {
            ID: 2308,
            Display_lang: "Fine Leather Cloak",
            InventoryType: 16,
            ItemLevel: 15,
            OverallQualityID: 2,
            RequiredLevel: 10,
            SellPrice: 267,
          },
          {
            ID: 2318,
            Display_lang: "Light Leather",
            InventoryType: 0,
            ItemLevel: 10,
            OverallQualityID: 1,
            RequiredLevel: 0,
            SellPrice: 15,
          },
        ],
      },
      { rows: [{ ItemLevel: 15, Cloth: 174.37, Leather: 434.66, Mail: 899.43, Plate: 768.16 }] },
      { rows: [{ ID: 15, Qualitymod: [0.9, 0.95, 1, 1.1, 1.2, 1.2, 1.2] }] },
      {
        rows: [{
          ID: 16,
          Clothmodifier: 0.08,
          Leathermodifier: 0.08,
          Chainmodifier: 0.08,
          Platemodifier: 0.08,
        }],
      },
      { rows: [] },
      source,
    );

    expect(records.get(2308)).toEqual({
      itemClassId: 4,
      itemSubClassId: 1,
      inventoryType: "INVTYPE_CLOAK",
      clientData: {
        displayName: "Fine Leather Cloak",
        equipmentSlot: "Back",
        armor: 14,
        requiredLevel: 10,
        sellPriceCopper: 267,
        source,
      },
    });
    expect(records.get(2318)?.clientData).toEqual({
      displayName: "Light Leather",
      requiredLevel: 0,
      sellPriceCopper: 15,
      source,
    });
  });
});
