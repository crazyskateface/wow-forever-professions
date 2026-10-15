import { describe, expect, it } from "vitest";
import {
  getInventoryTypeLabel,
  getItemCategoryLabel,
  ITEM_TOOLTIP_HOVER_DELAY_MS,
} from "./item-tooltip.js";

describe("item tooltip data", () => {
  it("uses the requested one-second hover delay", () => {
    expect(ITEM_TOOLTIP_HOVER_DELAY_MS).toBe(1_000);
  });

  it("describes known armor and trade-good classifications", () => {
    expect(getItemCategoryLabel({ name: "Fine Leather Cloak", itemClassId: 4, itemSubClassId: 2 }))
      .toBe("Leather Armor");
    expect(getItemCategoryLabel({ name: "Pristine Leather", itemClassId: 7, itemSubClassId: 6 }))
      .toBe("Leather · Trade Goods");
  });

  it("keeps unknown classifications and non-equipment slots absent", () => {
    expect(getItemCategoryLabel({ name: "Unknown Item" })).toBeUndefined();
    expect(getInventoryTypeLabel("INVTYPE_NON_EQUIP_IGNORE")).toBeUndefined();
    expect(getInventoryTypeLabel("INVTYPE_CLOAK")).toBe("Back");
  });
});
