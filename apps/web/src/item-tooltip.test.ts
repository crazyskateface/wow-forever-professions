import { describe, expect, it } from "vitest";
import {
  formatTooltipSellPrice,
  getInventoryTypeLabel,
  getItemCategoryLabel,
  getItemQuality,
  hasProvisionalOutputQuantity,
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

  it("maps client quality IDs to recognizable item rarities", () => {
    expect([0, 1, 2, 3, 4].map((qualityId) => getItemQuality(qualityId))).toEqual([
      { label: "Poor", token: "poor" },
      { label: "Common", token: "common" },
      { label: "Uncommon", token: "uncommon" },
      { label: "Rare", token: "rare" },
      { label: "Epic", token: "epic" },
    ]);
    expect(getItemQuality(undefined)).toBeUndefined();
    expect(getItemQuality(99)).toBeUndefined();
  });

  it("formats vendor prices like an in-game tooltip", () => {
    expect(formatTooltipSellPrice(0)).toBe("0c");
    expect(formatTooltipSellPrice(267)).toBe("2s 67c");
    expect(formatTooltipSellPrice(12_345)).toBe("1g 23s 45c");
  });

  it("preserves provisional output-quantity warnings", () => {
    expect(hasProvisionalOutputQuantity([
      "Client-derived recipe structure. Output quantity is provisionally one.",
    ])).toBe(true);
    expect(hasProvisionalOutputQuantity([
      "Thresholds are verified. Output quantity remains unverified.",
    ])).toBe(true);
    expect(hasProvisionalOutputQuantity(["Verified in game."])).toBe(false);
  });
});
