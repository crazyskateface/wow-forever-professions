import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RecipeChange } from "@forever-professions/contracts";
import { leatherworkingFixture } from "@forever-professions/fixtures";
import { ItemTooltipProvider } from "./ItemTooltip.js";
import { ForeverChanges, changeTooltipItem, normalizeProfessionId } from "./ForeverChanges.js";
import { DEFAULT_CHANGE_FILTERS } from "./personalization.js";
import { GEAR_SLOTS } from "./gear-slots.js";
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

describe("Forever Changes gear controls", () => {
  it("renders fourteen named image-only toggles and selected state beside Filters", () => {
    const html = renderToStaticMarkup(createElement(ForeverChanges, {
      changes: [], currentSkill: 1, error: undefined,
      filters: { ...DEFAULT_CHANGE_FILTERS, gearSlots: ["head", "hands"] },
      itemQualityById: new Map(), loading: false, onFiltersChange: () => {},
      onRetry: () => {}, recipeTooltipBySpellId: new Map(), search: "", summary: undefined,
      onSelectRecipe: () => {}, recipes: [],
    }));
    expect(html.match(/class="changes-gear-slot"/g)).toHaveLength(14);
    for (const slot of GEAR_SLOTS) {
      expect(html).toContain(`aria-label="${slot.label}" aria-pressed="${slot.id === "head" || slot.id === "hands"}"`);
      expect(html).toContain(`title="${slot.label}"`);
    }
    expect(html).toContain("Reset filters");
    expect(html).toContain('aria-label="Sort recipes"');
    expect(html).toContain('aria-label="Alphabetical" aria-pressed="true"');
    expect(html).toContain('aria-label="Skill level" aria-pressed="false"');
    expect(html).toContain("No matching recipe changes");
  });
});

describe("Forever Changes calculator navigation", () => {
  const recipe = { ...leatherworkingFixture.recipes[0]!, id: "tailoring:local-shoes", name: "Azure Stormsewn Shoes", professionId: "tailoring", spellId: 1301469 };
  const change = { name: recipe.name, professionName: "Tailoring", identity: { professionId: "tailoring", spellId: 1301469 }, changedFields: {}, changeType: "NEW" } as RecipeChange;

  function render(record: RecipeChange, recipes = [recipe]) {
    const content = createElement(ForeverChanges, {
      changes: [record], currentSkill: 1, error: undefined, filters: { ...DEFAULT_CHANGE_FILTERS, changeFilter: record.changeType },
      itemQualityById: new Map(), loading: false, onFiltersChange: () => {}, onRetry: () => {}, onSelectRecipe: () => {},
      recipes, recipeTooltipBySpellId: new Map(), search: "", summary: undefined,
    });
    return renderToStaticMarkup(createElement(ItemTooltipProvider, { children: content }));
  }

  it.each(["NEW", "UPDATED", "UNCHANGED"] as const)("renders %s recipes as calculator buttons without expandable details", changeType => {
    const html = render({ ...change, changeType });
    expect(html).toContain('aria-label="Open Azure Stormsewn Shoes in recipe calculator"');
    expect(html).toContain('<article class="change-card');
    expect(html).not.toContain('<details class="change-card');
    expect(html).not.toContain('class="change-card-details"');
    expect(html).not.toContain('disabled=""');
  });

  it("keeps missing and removed recipes visible without opening a different recipe", () => {
    for (const candidates of [[], [{ ...recipe, spellId: 42 }], [{ ...recipe, professionId: "leatherworking" }]]) {
      const html = render(change, candidates);
      expect(html).toContain('Azure Stormsewn Shoes: calculator unavailable in current catalog');
      expect(html).toContain('disabled=""');
    }
    const html = render({ ...change, changeType: "REMOVED" }, []);
    expect(html).toContain("No longer present in the target build");
    expect(html).toContain('disabled=""');
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
