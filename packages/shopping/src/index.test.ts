import { describe, expect, it } from "vitest";
import { planShoppingList, type ShoppingPlanInput } from "./index.js";

const baseInput: ShoppingPlanInput = {
  route: [{ recipeId: "final", expectedCrafts: 3 }],
  items: [
    { id: "final-item", name: "Final Item" },
    {
      id: "intermediate",
      name: "Intermediate",
      unitPriceCopper: 100,
      priceObservedAt: "2026-10-08T06:00:00.000Z",
    },
    {
      id: "base",
      name: "Base",
      unitPriceCopper: 10,
      priceObservedAt: "2026-10-08T05:00:00.000Z",
    },
  ],
  recipes: [
    {
      id: "final",
      name: "Final",
      reagents: [
        { itemId: "intermediate", quantity: 2 },
        { itemId: "base", quantity: 1 },
      ],
      outputs: [{ itemId: "final-item", quantity: 1 }],
    },
    {
      id: "make-intermediate",
      name: "Make Intermediate",
      reagents: [{ itemId: "base", quantity: 2 }],
      outputs: [{ itemId: "intermediate", quantity: 1 }],
    },
  ],
};

describe("shopping planner", () => {
  it("aggregates route reagents and crafts a cheaper intermediate", () => {
    const result = planShoppingList(baseInput);
    expect(result).toMatchObject({
      status: "complete",
      routeReagents: [
        { itemId: "base", quantity: 3 },
        { itemId: "intermediate", quantity: 6 },
      ],
      crafts: [
        {
          recipeId: "make-intermediate",
          expectedCrafts: 6,
          expectedOutputQuantity: 6,
        },
      ],
      purchases: [
        {
          itemId: "base",
          quantity: 15,
          unitPriceCopper: 10,
          expectedCostCopper: 150,
          priceObservedAt: "2026-10-08T05:00:00.000Z",
        },
      ],
      expectedCostCopper: 150,
    });
  });

  it("buys an intermediate when buying is cheaper than crafting", () => {
    const result = planShoppingList({
      ...baseInput,
      items: baseInput.items.map((item) =>
        item.id === "intermediate" ? { ...item, unitPriceCopper: 15 } : item,
      ),
    });
    expect(result.crafts).toEqual([]);
    expect(result.purchases).toMatchObject([
      { itemId: "base", quantity: 3 },
      { itemId: "intermediate", quantity: 6 },
    ]);
    expect(result.expectedCostCopper).toBe(120);
  });

  it("expands more than one level of intermediate crafting", () => {
    const result = planShoppingList({
      route: [{ recipeId: "final", expectedCrafts: 2 }],
      items: [
        { id: "final-item", name: "Final Item" },
        { id: "assembly", name: "Assembly" },
        { id: "part", name: "Part" },
        { id: "ore", name: "Ore", unitPriceCopper: 4 },
      ],
      recipes: [
        {
          id: "final",
          name: "Final",
          reagents: [{ itemId: "assembly", quantity: 1 }],
          outputs: [{ itemId: "final-item", quantity: 1 }],
        },
        {
          id: "make-assembly",
          name: "Make Assembly",
          reagents: [{ itemId: "part", quantity: 3 }],
          outputs: [{ itemId: "assembly", quantity: 1 }],
        },
        {
          id: "make-part",
          name: "Make Part",
          reagents: [{ itemId: "ore", quantity: 2 }],
          outputs: [{ itemId: "part", quantity: 2 }],
        },
      ],
    });

    expect(result).toMatchObject({
      status: "complete",
      crafts: [
        { recipeId: "make-assembly", expectedCrafts: 2 },
        { recipeId: "make-part", expectedCrafts: 3 },
      ],
      purchases: [{ itemId: "ore", quantity: 6, expectedCostCopper: 24 }],
      expectedCostCopper: 24,
    });
  });

  it("honors known recipes and buy-only strategy", () => {
    const unknownCraft = planShoppingList({
      ...baseInput,
      knownRecipeIds: ["final"],
    });
    expect(unknownCraft.crafts).toEqual([]);
    expect(unknownCraft.expectedCostCopper).toBe(630);

    const buyOnly = planShoppingList({ ...baseInput, strategy: "buy-only" });
    expect(buyOnly.crafts).toEqual([]);
    expect(buyOnly.expectedCostCopper).toBe(630);
  });

  it("detects and prevents recursive recipe cycles", () => {
    const result = planShoppingList({
      route: [{ recipeId: "final", expectedCrafts: 1 }],
      items: [
        { id: "final-item", name: "Final Item" },
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      recipes: [
        {
          id: "final",
          name: "Final",
          reagents: [{ itemId: "a", quantity: 1 }],
          outputs: [{ itemId: "final-item", quantity: 1 }],
        },
        {
          id: "make-a",
          name: "Make A",
          reagents: [{ itemId: "b", quantity: 1 }],
          outputs: [{ itemId: "a", quantity: 1 }],
        },
        {
          id: "make-b",
          name: "Make B",
          reagents: [{ itemId: "a", quantity: 1 }],
          outputs: [{ itemId: "b", quantity: 1 }],
        },
      ],
    });
    expect(result).toMatchObject({
      status: "partial",
      unresolved: [{ itemId: "a", reason: "cycle-detected" }],
      cycles: [["a", "b", "a"]],
    });
    expect(result.expectedCostCopper).toBeUndefined();
  });

  it("uses a priced buy fallback instead of entering a cycle", () => {
    const result = planShoppingList({
      route: [{ recipeId: "final", expectedCrafts: 1 }],
      items: [
        { id: "final-item", name: "Final Item" },
        { id: "a", name: "A", unitPriceCopper: 25 },
      ],
      recipes: [
        {
          id: "final",
          name: "Final",
          reagents: [{ itemId: "a", quantity: 1 }],
          outputs: [{ itemId: "final-item", quantity: 1 }],
        },
        {
          id: "make-a",
          name: "Make A",
          reagents: [{ itemId: "a", quantity: 1 }],
          outputs: [{ itemId: "a", quantity: 1 }],
        },
      ],
    });
    expect(result).toMatchObject({
      status: "complete",
      purchases: [{ itemId: "a", expectedCostCopper: 25 }],
      expectedCostCopper: 25,
    });
    expect(result.cycles).toEqual([["a", "a"]]);
  });
});
