import { describe, expect, it } from "vitest";
import type { ImportedBuildDataset } from "@forever-professions/contracts";
import {
  collectDatasetGameItemIds,
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
});
