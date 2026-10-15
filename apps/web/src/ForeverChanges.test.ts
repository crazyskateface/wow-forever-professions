import { describe, expect, it } from "vitest";
import type { RecipeChange } from "@forever-professions/contracts";
import { changeTooltipItem, normalizeProfessionId } from "./ForeverChanges.js";
import type { ItemTooltipData } from "./item-tooltip.js";

describe("Forever Changes profession filters", () => {
  const professions = [["leatherworking", "Leatherworking"]] as const;

  it("keeps empty and available profession filters", () => {
    expect(normalizeProfessionId("", professions)).toBe("");
    expect(normalizeProfessionId("leatherworking", professions)).toBe("leatherworking");
  });

  it("normalizes unavailable saved profession filters to all professions", () => {
    expect(normalizeProfessionId("alchemy", professions)).toBe("");
    expect(normalizeProfessionId("leatherworking", [])).toBe("");
  });
});

describe("Forever Changes item tooltips", () => {
  it("reuses the calculator catalog tooltip for the same recipe", () => {
    const catalogTooltip: ItemTooltipData = {
      name: "Comfortable Leather Hat",
      gameItemId: 8174,
      qualityId: 2,
      equipmentSlot: "Head",
      armor: 90,
      requiredLevel: 35,
      sellPriceCopper: 4131,
      details: [
        { text: "Crafted by Leatherworking" },
        { text: "Creates 1 per craft (provisional)", tone: "warning" },
        { text: "Recipe learned at skill 175", tone: "muted" },
      ],
    };
    const change = {
      identity: { professionId: "leatherworking", spellId: 10490 },
      professionName: "Leatherworking",
      name: "Comfortable Leather Hat",
      changeType: "UPDATED",
      changedFields: {},
    } as RecipeChange;

    expect(changeTooltipItem(
      change,
      new Map([[10490, catalogTooltip]]),
      new Map(),
    )).toBe(catalogTooltip);
  });
});
