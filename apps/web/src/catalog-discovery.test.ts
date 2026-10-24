import { describe, expect, it } from "vitest";
import type {
  AuctionPriceObservation,
  Recipe,
  RecipeChangeType,
} from "@forever-professions/contracts";
import {
  DEFAULT_CATALOG_FILTERS,
  countActiveCatalogFilters,
  filterAndSortRecipes,
  getCatalogItemTypes,
  getRecipeExpectedCost,
  getRecipeItemType,
  getVirtualRange,
  recipeIdFromUrlValue,
  urlWithRecipeId,
} from "./catalog-discovery.js";

function recipe(overrides: Partial<Recipe> & Pick<Recipe, "id" | "name">): Recipe {
  const { id, name, ...rest } = overrides;
  return {
    id,
    spellId: 1,
    name,
    professionId: "leatherworking",
    buildId: "1.60.1.69977",
    learnSkill: 1,
    acquisition: "trainer",
    faction: "both",
    specializationSpellId: null,
    cooldownSeconds: null,
    availability: "available",
    thresholds: { orange: 1, yellow: 10, green: 20, gray: 30 },
    reagents: [],
    outputs: [{
      itemId: `item-${id}`,
      name,
      itemClassId: 4,
      itemSubClassId: 2,
      inventoryType: "INVTYPE_CHEST",
      quantity: 1,
    }],
    provenance: {
      source: "client-data",
      sourceLabel: "Forever client",
      verification: { status: "verified" },
    },
    ...rest,
  };
}

function availablePrice(gameItemId: number, unitPrice: number): AuctionPriceObservation {
  return {
    provider: "manual",
    marketId: "forever.pvp.horde.us",
    gameItemId,
    status: "available",
    fetchedAt: "2026-10-19T00:00:00.000Z",
    observedAt: "2026-10-19T00:00:00.000Z",
    minimumBuyoutUnitPriceCopper: unitPrice,
  };
}

describe("catalog discovery", () => {
  it("filters across evidence fields without treating unknowns as ordinary values", () => {
    const recipes = [
      recipe({ id: "supported", name: "Supported", learnSkill: 100 }),
      recipe({
        id: "unknown",
        name: "Unknown",
        acquisition: "unknown",
        availability: "unknown",
        faction: "unknown",
        learnSkill: null,
        provenance: {
          source: "client-data",
          sourceLabel: "Forever client",
          verification: { status: "unverified" },
        },
      }),
    ];
    const changes = new Map<string, RecipeChangeType>([["supported", "UPDATED"]]);

    expect(filterAndSortRecipes(recipes, {
      changeTypesByRecipeId: changes,
      currentSkill: 100,
      filters: { ...DEFAULT_CATALOG_FILTERS, minimumLearnSkill: 1 },
      pricesByItemId: new Map(),
      search: "",
      sort: "name",
    }).map(({ id }) => id)).toEqual(["supported"]);

    expect(filterAndSortRecipes(recipes, {
      changeTypesByRecipeId: changes,
      currentSkill: 100,
      filters: { ...DEFAULT_CATALOG_FILTERS, change: "unknown" },
      pricesByItemId: new Map(),
      search: "",
      sort: "name",
    }).map(({ id }) => id)).toEqual(["unknown"]);
  });

  it("treats both-faction recipes as compatible while preserving unknown faction", () => {
    const alliance = recipe({ id: "alliance", name: "Alliance", faction: "alliance" });
    const both = recipe({ id: "both", name: "Both", faction: "both" });
    const unknown = recipe({ id: "unknown", name: "Unknown", faction: "unknown" });
    const recipes = [alliance, both, unknown];
    const common = {
      changeTypesByRecipeId: new Map<string, RecipeChangeType>(),
      currentSkill: 1,
      pricesByItemId: new Map<number, AuctionPriceObservation>(),
      search: "",
      sort: "name" as const,
    };

    expect(filterAndSortRecipes(recipes, {
      ...common,
      filters: { ...DEFAULT_CATALOG_FILTERS, faction: "alliance" },
    }).map(({ id }) => id)).toEqual(["alliance", "both"]);
    expect(filterAndSortRecipes(recipes, {
      ...common,
      filters: { ...DEFAULT_CATALOG_FILTERS, faction: "unknown" },
    }).map(({ id }) => id)).toEqual(["unknown"]);
  });

  it("sorts expected costs with complete prices first and missing coverage last", () => {
    const cheap = recipe({
      id: "cheap",
      name: "Cheap",
      reagents: [{ itemId: "leather", gameItemId: 1, name: "Leather", quantity: 1 }],
    });
    const expensive = recipe({
      id: "expensive",
      name: "Expensive",
      reagents: [{ itemId: "hide", gameItemId: 2, name: "Hide", quantity: 2 }],
    });
    const unknown = recipe({
      id: "unknown",
      name: "Unknown",
      reagents: [{ itemId: "thread", gameItemId: 3, name: "Thread", quantity: 1 }],
    });
    const future = recipe({
      id: "future",
      name: "Future",
      learnSkill: 20,
      reagents: [{ itemId: "leather", gameItemId: 1, name: "Leather", quantity: 1 }],
    });
    const unknownRank = recipe({
      id: "unknown-rank",
      name: "Unknown rank",
      learnSkill: null,
      reagents: [{ itemId: "leather", gameItemId: 1, name: "Leather", quantity: 1 }],
    });
    const prices = new Map<number, AuctionPriceObservation>([
      [1, availablePrice(1, 100)],
      [2, availablePrice(2, 100)],
    ]);

    expect(getRecipeExpectedCost(cheap, 1, prices)).toBe(100);
    expect(getRecipeExpectedCost(future, 1, prices)).toBeUndefined();
    expect(getRecipeExpectedCost(unknownRank, 1, prices)).toBeUndefined();
    expect(filterAndSortRecipes([unknown, expensive, cheap], {
      changeTypesByRecipeId: new Map(),
      currentSkill: 1,
      filters: DEFAULT_CATALOG_FILTERS,
      pricesByItemId: prices,
      search: "",
      sort: "expected-cost",
    }).map(({ id }) => id)).toEqual(["cheap", "expensive", "unknown"]);
  });

  it("sorts current-skill usefulness by learnability, availability, and probability", () => {
    const orange = recipe({ id: "orange", name: "Orange" });
    const yellow = recipe({
      id: "yellow",
      name: "Yellow",
      thresholds: { orange: 1, yellow: 1, green: 20, gray: 30 },
    });
    const future = recipe({ id: "future", name: "Future", learnSkill: 200 });
    const unknown = recipe({ id: "unknown", name: "Unknown", learnSkill: null });

    expect(filterAndSortRecipes([unknown, future, yellow, orange], {
      changeTypesByRecipeId: new Map(),
      currentSkill: 10,
      filters: DEFAULT_CATALOG_FILTERS,
      pricesByItemId: new Map(),
      search: "",
      sort: "current-skill",
    }).map(({ id }) => id)).toEqual(["orange", "yellow", "future", "unknown"]);
  });

  it("derives readable item types and counts every active constraint", () => {
    expect(getRecipeItemType(recipe({ id: "chest", name: "Chest" }))).toEqual({
      key: "armor:2:chest",
      label: "Leather chest",
    });
    expect(getCatalogItemTypes([
      recipe({ id: "chest", name: "Chest" }),
      recipe({
        id: "robe",
        name: "Robe",
        outputs: [{
          itemId: "item-robe",
          name: "Robe",
          itemClassId: 4,
          itemSubClassId: 2,
          inventoryType: "INVTYPE_ROBE",
          quantity: 1,
        }],
      }),
    ])).toEqual([{ key: "armor:2:chest", label: "Leather chest" }]);
    expect(countActiveCatalogFilters({
      ...DEFAULT_CATALOG_FILTERS,
      acquisition: "unknown",
      itemType: "unknown",
      minimumLearnSkill: 100,
    })).toBe(3);
  });

  it("keeps the virtual window bounded with overscan", () => {
    expect(getVirtualRange(603, 104, 1_040, 416, 2)).toEqual({
      firstIndex: 8,
      lastIndex: 16,
    });
    expect(getVirtualRange(3, 104, 0, 500, 5)).toEqual({
      firstIndex: 0,
      lastIndex: 3,
    });
  });

  it("round-trips recipe deep links without dropping other query state", () => {
    const url = urlWithRecipeId(
      "https://example.test/?market=forever.pvp.horde.us",
      "spell-1301454",
    );
    expect(recipeIdFromUrlValue(url)).toBe("spell-1301454");
    expect(new URL(url).searchParams.get("market")).toBe("forever.pvp.horde.us");
  });
});
