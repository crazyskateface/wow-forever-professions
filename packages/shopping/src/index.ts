export type ShoppingStrategy = "cheapest" | "buy-only" | "craft-first";

export interface ShoppingItem {
  readonly id: string;
  readonly name: string;
  readonly unitPriceCopper?: number;
  readonly priceObservedAt?: string;
}

export interface ShoppingRecipeItem {
  readonly itemId: string;
  readonly quantity: number;
}

export interface ShoppingRecipe {
  readonly id: string;
  readonly name: string;
  readonly reagents: readonly ShoppingRecipeItem[];
  readonly outputs: readonly ShoppingRecipeItem[];
}

export interface RouteCraftRequirement {
  readonly recipeId: string;
  readonly expectedCrafts: number;
}

export interface ShoppingPlanInput {
  readonly route: readonly RouteCraftRequirement[];
  readonly recipes: readonly ShoppingRecipe[];
  readonly items: readonly ShoppingItem[];
  readonly strategy?: ShoppingStrategy;
  readonly knownRecipeIds?: readonly string[];
}

export interface ShoppingQuantity {
  readonly itemId: string;
  readonly itemName: string;
  readonly quantity: number;
}

export interface ShoppingPurchase extends ShoppingQuantity {
  readonly unitPriceCopper: number;
  readonly expectedCostCopper: number;
  readonly priceObservedAt?: string;
}

export interface ShoppingCraft {
  readonly recipeId: string;
  readonly recipeName: string;
  readonly outputItemId: string;
  readonly outputItemName: string;
  readonly expectedCrafts: number;
  readonly expectedOutputQuantity: number;
}

export type UnresolvedShoppingReason =
  | "missing-price"
  | "no-source"
  | "cycle-detected";

export interface UnresolvedShoppingItem extends ShoppingQuantity {
  readonly reason: UnresolvedShoppingReason;
}

export interface ShoppingPlan {
  readonly status: "complete" | "partial";
  readonly strategy: ShoppingStrategy;
  readonly routeReagents: readonly ShoppingQuantity[];
  readonly purchases: readonly ShoppingPurchase[];
  readonly crafts: readonly ShoppingCraft[];
  readonly unresolved: readonly UnresolvedShoppingItem[];
  readonly cycles: readonly (readonly string[])[];
  readonly knownSubtotalCopper: number;
  readonly expectedCostCopper?: number;
}

interface BuyDecision {
  readonly kind: "buy";
  readonly itemId: string;
  readonly unitCostCopper: number;
  readonly priceObservedAt?: string;
}

interface CraftDecision {
  readonly kind: "craft";
  readonly itemId: string;
  readonly unitCostCopper: number;
  readonly recipe: ShoppingRecipe;
  readonly outputQuantity: number;
  readonly inputs: readonly {
    readonly reagent: ShoppingRecipeItem;
    readonly decision: Decision;
  }[];
}

interface UnresolvedDecision {
  readonly kind: "unresolved";
  readonly itemId: string;
  readonly reason: UnresolvedShoppingReason;
}

type Decision = BuyDecision | CraftDecision | UnresolvedDecision;

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}

function validateInput(input: ShoppingPlanInput): void {
  const itemIds = new Set<string>();
  for (const item of input.items) {
    if (item.id.length === 0 || item.name.length === 0) {
      throw new Error("Shopping items require non-empty IDs and names.");
    }
    if (itemIds.has(item.id)) throw new Error(`Duplicate shopping item ID: ${item.id}.`);
    itemIds.add(item.id);
    if (
      item.unitPriceCopper !== undefined &&
      (!Number.isSafeInteger(item.unitPriceCopper) || item.unitPriceCopper <= 0)
    ) {
      throw new RangeError(`Item ${item.id} price must be positive integer copper.`);
    }
    if (
      item.priceObservedAt !== undefined &&
      Number.isNaN(Date.parse(item.priceObservedAt))
    ) {
      throw new RangeError(`Item ${item.id} price timestamp must be an ISO date.`);
    }
  }

  const recipeIds = new Set<string>();
  for (const recipe of input.recipes) {
    if (recipe.id.length === 0 || recipe.name.length === 0) {
      throw new Error("Shopping recipes require non-empty IDs and names.");
    }
    if (recipeIds.has(recipe.id)) {
      throw new Error(`Duplicate shopping recipe ID: ${recipe.id}.`);
    }
    recipeIds.add(recipe.id);
    for (const reagent of recipe.reagents) {
      assertPositive(reagent.quantity, `Recipe ${recipe.id} reagent quantity`);
    }
    // Enchantments can consume route materials without creating an item.
    // Only actual item outputs enter the intermediate-crafting index below.
    for (const output of recipe.outputs) {
      assertPositive(output.quantity, `Recipe ${recipe.id} output quantity`);
    }
  }

  for (const requirement of input.route) {
    assertPositive(requirement.expectedCrafts, "Route expected crafts");
    if (!recipeIds.has(requirement.recipeId)) {
      throw new Error(`Route references unknown recipe ${requirement.recipeId}.`);
    }
  }
}

function unresolvedPriority(reason: UnresolvedShoppingReason): number {
  if (reason === "cycle-detected") return 3;
  if (reason === "missing-price") return 2;
  return 1;
}

export function planShoppingList(input: ShoppingPlanInput): ShoppingPlan {
  validateInput(input);
  const strategy = input.strategy ?? "cheapest";
  const items = new Map(input.items.map((item) => [item.id, item]));
  const recipes = new Map(input.recipes.map((recipe) => [recipe.id, recipe]));
  const known =
    input.knownRecipeIds === undefined ? undefined : new Set(input.knownRecipeIds);
  const producers = new Map<
    string,
    { readonly recipe: ShoppingRecipe; readonly outputQuantity: number }[]
  >();
  for (const recipe of input.recipes) {
    if (known !== undefined && !known.has(recipe.id)) continue;
    for (const output of recipe.outputs) {
      const current = producers.get(output.itemId) ?? [];
      current.push({ recipe, outputQuantity: output.quantity });
      producers.set(output.itemId, current);
    }
  }

  const cycleKeys = new Set<string>();
  const cycles: string[][] = [];
  function rememberCycle(path: readonly string[]): void {
    const key = path.join(" -> ");
    if (cycleKeys.has(key)) return;
    cycleKeys.add(key);
    cycles.push([...path]);
  }

  function resolve(itemId: string, stack: readonly string[]): Decision {
    const cycleStart = stack.indexOf(itemId);
    if (cycleStart >= 0) {
      const path = [...stack.slice(cycleStart), itemId];
      rememberCycle(path);
      return { kind: "unresolved", itemId, reason: "cycle-detected" };
    }

    const item = items.get(itemId);
    const buy =
      item?.unitPriceCopper === undefined
        ? undefined
        : ({
            kind: "buy",
            itemId,
            unitCostCopper: item.unitPriceCopper,
            ...(item.priceObservedAt === undefined
              ? {}
              : { priceObservedAt: item.priceObservedAt }),
          } as const);
    if (strategy === "buy-only") {
      return buy ?? { kind: "unresolved", itemId, reason: "missing-price" };
    }

    const craftOptions: CraftDecision[] = [];
    let strongestFailure: UnresolvedShoppingReason = "no-source";
    for (const producer of producers.get(itemId) ?? []) {
      const inputs = producer.recipe.reagents.map((reagent) => ({
        reagent,
        decision: resolve(reagent.itemId, [...stack, itemId]),
      }));
      const unresolved = inputs
        .map(({ decision }) => decision)
        .filter(
          (decision): decision is UnresolvedDecision =>
            decision.kind === "unresolved",
        );
      for (const failure of unresolved) {
        if (unresolvedPriority(failure.reason) > unresolvedPriority(strongestFailure)) {
          strongestFailure = failure.reason;
        }
      }
      if (unresolved.length > 0) continue;
      const craftCost = inputs.reduce(
        (total, { reagent, decision }) =>
          total +
          reagent.quantity *
            (decision.kind === "unresolved" ? 0 : decision.unitCostCopper),
        0,
      );
      craftOptions.push({
        kind: "craft",
        itemId,
        unitCostCopper: craftCost / producer.outputQuantity,
        recipe: producer.recipe,
        outputQuantity: producer.outputQuantity,
        inputs,
      });
    }
    craftOptions.sort(
      (left, right) =>
        left.unitCostCopper - right.unitCostCopper ||
        left.recipe.id.localeCompare(right.recipe.id),
    );

    if (strategy === "craft-first" && craftOptions[0] !== undefined) {
      return craftOptions[0];
    }
    const choices: (BuyDecision | CraftDecision)[] = [
      ...(buy === undefined ? [] : [buy]),
      ...craftOptions,
    ];
    choices.sort(
      (left, right) =>
        left.unitCostCopper - right.unitCostCopper ||
        (left.kind === "buy" ? -1 : 1),
    );
    return (
      choices[0] ?? {
        kind: "unresolved",
        itemId,
        reason:
          (producers.get(itemId)?.length ?? 0) > 0
            ? strongestFailure
            : item === undefined
              ? "no-source"
              : "missing-price",
      }
    );
  }

  const rootQuantities = new Map<string, number>();
  for (const routeCraft of input.route) {
    const recipe = recipes.get(routeCraft.recipeId)!;
    for (const reagent of recipe.reagents) {
      rootQuantities.set(
        reagent.itemId,
        (rootQuantities.get(reagent.itemId) ?? 0) +
          reagent.quantity * routeCraft.expectedCrafts,
      );
    }
  }

  const purchases = new Map<string, ShoppingPurchase>();
  const crafts = new Map<string, ShoppingCraft>();
  const unresolved = new Map<string, UnresolvedShoppingItem>();

  function expand(itemId: string, quantity: number, decision: Decision): void {
    const itemName = items.get(itemId)?.name ?? itemId;
    if (decision.kind === "buy") {
      const current = purchases.get(itemId);
      const nextQuantity = (current?.quantity ?? 0) + quantity;
      purchases.set(itemId, {
        itemId,
        itemName,
        quantity: nextQuantity,
        unitPriceCopper: decision.unitCostCopper,
        expectedCostCopper: nextQuantity * decision.unitCostCopper,
        ...(decision.priceObservedAt === undefined
          ? {}
          : { priceObservedAt: decision.priceObservedAt }),
      });
      return;
    }
    if (decision.kind === "unresolved") {
      const key = `${itemId}:${decision.reason}`;
      const current = unresolved.get(key);
      unresolved.set(key, {
        itemId,
        itemName,
        quantity: (current?.quantity ?? 0) + quantity,
        reason: decision.reason,
      });
      return;
    }

    const expectedCrafts = quantity / decision.outputQuantity;
    const craftKey = `${decision.recipe.id}:${itemId}`;
    const current = crafts.get(craftKey);
    crafts.set(craftKey, {
      recipeId: decision.recipe.id,
      recipeName: decision.recipe.name,
      outputItemId: itemId,
      outputItemName: itemName,
      expectedCrafts: (current?.expectedCrafts ?? 0) + expectedCrafts,
      expectedOutputQuantity:
        (current?.expectedOutputQuantity ?? 0) +
        expectedCrafts * decision.outputQuantity,
    });
    for (const inputDecision of decision.inputs) {
      expand(
        inputDecision.reagent.itemId,
        inputDecision.reagent.quantity * expectedCrafts,
        inputDecision.decision,
      );
    }
  }

  for (const [itemId, quantity] of rootQuantities) {
    expand(itemId, quantity, resolve(itemId, []));
  }

  const routeReagents = [...rootQuantities]
    .map(([itemId, quantity]) => ({
      itemId,
      itemName: items.get(itemId)?.name ?? itemId,
      quantity,
    }))
    .sort((left, right) => left.itemName.localeCompare(right.itemName));
  const purchaseList = [...purchases.values()].sort((left, right) =>
    left.itemName.localeCompare(right.itemName),
  );
  const craftList = [...crafts.values()].sort((left, right) =>
    left.recipeName.localeCompare(right.recipeName),
  );
  const unresolvedList = [...unresolved.values()].sort((left, right) =>
    left.itemName.localeCompare(right.itemName),
  );
  const knownSubtotalCopper = purchaseList.reduce(
    (total, purchase) => total + purchase.expectedCostCopper,
    0,
  );

  return {
    status: unresolvedList.length === 0 ? "complete" : "partial",
    strategy,
    routeReagents,
    purchases: purchaseList,
    crafts: craftList,
    unresolved: unresolvedList,
    cycles,
    knownSubtotalCopper,
    ...(unresolvedList.length === 0
      ? { expectedCostCopper: knownSubtotalCopper }
      : {}),
  };
}
