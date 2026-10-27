import type {
  AuctionPriceObservation,
  Recipe,
  RecipeAcquisition,
  RecipeAvailability,
  RecipeChangeType,
  RecipeFaction,
  VerificationStatus,
} from "@forever-professions/contracts";
import {
  getExpectedReagentQuantity,
  getSkillUpProbability,
} from "@forever-professions/domain";

export type CatalogSort =
  | "name"
  | "learn-skill"
  | "current-skill"
  | "expected-cost"
  | "orange"
  | "yellow"
  | "green"
  | "gray";

export type CatalogSpecializationFilter = "all" | "required" | "none";
export type CatalogChangeFilter =
  | "all"
  | "new"
  | "updated"
  | "unchanged"
  | "unknown";

export interface CatalogFilters {
  readonly acquisition: RecipeAcquisition | "all";
  readonly availability: RecipeAvailability | "all";
  readonly change: CatalogChangeFilter;
  readonly faction: RecipeFaction | "all";
  readonly itemType: string | "all";
  readonly maximumLearnSkill?: number | undefined;
  readonly minimumLearnSkill?: number | undefined;
  readonly specialization: CatalogSpecializationFilter;
  readonly verification: VerificationStatus | "all";
}

export interface CatalogDiscoveryOptions {
  readonly changeTypesByRecipeId: ReadonlyMap<string, RecipeChangeType>;
  readonly currentSkill: number;
  readonly filters: CatalogFilters;
  readonly pricesByItemId: ReadonlyMap<number, AuctionPriceObservation>;
  readonly search: string;
  readonly sort: CatalogSort;
}

export interface RecipeItemType {
  readonly key: string;
  readonly label: string;
}

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = {
  acquisition: "all",
  availability: "all",
  change: "all",
  faction: "all",
  itemType: "all",
  specialization: "all",
  verification: "all",
};

const INVENTORY_TYPE_LABELS: Readonly<Record<string, string>> = {
  INVTYPE_AMMO: "Ammo",
  INVTYPE_BAG: "Bag",
  INVTYPE_BODY: "Shirt",
  INVTYPE_CHEST: "Chest",
  INVTYPE_CLOAK: "Back",
  INVTYPE_FEET: "Feet",
  INVTYPE_FINGER: "Finger",
  INVTYPE_HAND: "Hands",
  INVTYPE_HEAD: "Head",
  INVTYPE_HOLDABLE: "Held item",
  INVTYPE_LEGS: "Legs",
  INVTYPE_NECK: "Neck",
  INVTYPE_NON_EQUIP_IGNORE: "Non-equipment",
  INVTYPE_QUIVER: "Quiver",
  INVTYPE_RELIC: "Relic",
  INVTYPE_ROBE: "Chest",
  INVTYPE_SHIELD: "Shield",
  INVTYPE_SHOULDER: "Shoulders",
  INVTYPE_TABARD: "Tabard",
  INVTYPE_TRINKET: "Trinket",
  INVTYPE_WAIST: "Waist",
  INVTYPE_WEAPON: "One-hand weapon",
  INVTYPE_WEAPONMAINHAND: "Main-hand weapon",
  INVTYPE_WEAPONOFFHAND: "Off-hand weapon",
  INVTYPE_2HWEAPON: "Two-hand weapon",
  INVTYPE_WRIST: "Wrists",
};

const ITEM_CLASS_LABELS: Readonly<Record<number, string>> = {
  0: "Consumable",
  1: "Container",
  2: "Weapon",
  3: "Gem",
  4: "Armor",
  5: "Reagent",
  6: "Projectile",
  7: "Trade good",
  8: "Item enhancement",
  9: "Recipe",
  11: "Quiver",
  12: "Quest item",
  13: "Key",
  15: "Miscellaneous",
  16: "Glyph",
  17: "Battle pet",
};

const ARMOR_SUBCLASS_LABELS: Readonly<Record<number, string>> = {
  1: "Cloth",
  2: "Leather",
  3: "Mail",
  4: "Plate",
  5: "Cosmetic",
  6: "Shield",
};

function availableUnitPrice(
  observation: AuctionPriceObservation | undefined,
): number | undefined {
  if (observation?.status !== "available") return undefined;
  return observation.minimumBuyoutUnitPriceCopper ?? observation.medianUnitPriceCopper;
}

function normalizeInventoryType(inventoryType: string): string {
  return inventoryType.trim().toUpperCase();
}

export function getRecipeItemType(recipe: Recipe): RecipeItemType {
  const output = recipe.outputs[0];
  if (output === undefined) return { key: "unknown", label: "Unknown item type" };

  if (output.inventoryType !== undefined) {
    const inventoryType = normalizeInventoryType(output.inventoryType);
    const slotLabel = INVENTORY_TYPE_LABELS[inventoryType];
    if (slotLabel !== undefined && inventoryType !== "INVTYPE_NON_EQUIP_IGNORE") {
      const armorLabel = output.itemClassId === 4 && output.itemSubClassId !== undefined
        ? ARMOR_SUBCLASS_LABELS[output.itemSubClassId]
        : undefined;
      const label = armorLabel === undefined ? slotLabel : `${armorLabel} ${slotLabel.toLowerCase()}`;
      const semanticSlot = slotLabel.toLowerCase().replaceAll(" ", "-");
      const key = armorLabel === undefined
        ? `inventory:${semanticSlot}`
        : `armor:${output.itemSubClassId}:${semanticSlot}`;
      return { key, label };
    }
  }

  if (output.itemClassId !== undefined) {
    const label = ITEM_CLASS_LABELS[output.itemClassId];
    if (label !== undefined) return { key: `class:${output.itemClassId}`, label };
  }

  return { key: "unknown", label: "Unknown item type" };
}

export function getCatalogItemTypes(recipes: readonly Recipe[]): readonly RecipeItemType[] {
  const itemTypes = new Map<string, RecipeItemType>();
  for (const recipe of recipes) {
    const itemType = getRecipeItemType(recipe);
    itemTypes.set(itemType.key, itemType);
  }
  return [...itemTypes.values()].sort((left, right) =>
    left.label.localeCompare(right.label) || left.key.localeCompare(right.key),
  );
}

export function getRecipeExpectedCost(
  recipe: Recipe,
  currentSkill: number,
  pricesByItemId: ReadonlyMap<number, AuctionPriceObservation>,
): number | undefined {
  if (recipe.learnSkill === null || recipe.learnSkill > currentSkill) return undefined;
  const probability = getSkillUpProbability(currentSkill, recipe.thresholds);
  if (probability <= 0) return undefined;

  let expectedCost = 0;
  for (const reagent of recipe.reagents) {
    if (reagent.gameItemId === undefined) return undefined;
    const unitPrice = availableUnitPrice(pricesByItemId.get(reagent.gameItemId));
    if (unitPrice === undefined) return undefined;
    expectedCost += unitPrice * getExpectedReagentQuantity(reagent.quantity, probability);
  }
  return expectedCost;
}

function matchesFaction(recipeFaction: RecipeFaction, filter: RecipeFaction | "all"): boolean {
  if (filter === "all") return true;
  if (filter === "alliance" || filter === "horde") {
    return recipeFaction === filter || recipeFaction === "both";
  }
  return recipeFaction === filter;
}

function normalizedChangeType(changeType: RecipeChangeType | undefined): CatalogChangeFilter {
  if (changeType === "NEW") return "new";
  if (changeType === "UPDATED") return "updated";
  if (changeType === "UNCHANGED") return "unchanged";
  return "unknown";
}

function matchesSearch(recipe: Recipe, query: string): boolean {
  return query.length === 0 ||
    recipe.name.toLowerCase().includes(query) ||
    recipe.id.toLowerCase().includes(query) ||
    recipe.reagents.some(({ name }) => name.toLowerCase().includes(query)) ||
    recipe.outputs.some(({ name }) => name.toLowerCase().includes(query));
}

function matchesFilters(
  recipe: Recipe,
  filters: CatalogFilters,
  changeType: RecipeChangeType | undefined,
): boolean {
  if (filters.acquisition !== "all" && recipe.acquisition !== filters.acquisition) return false;
  if (filters.availability !== "all" && recipe.availability !== filters.availability) return false;
  if (!matchesFaction(recipe.faction, filters.faction)) return false;
  if (filters.itemType !== "all" && getRecipeItemType(recipe).key !== filters.itemType) return false;
  if (
    filters.specialization === "required" &&
    recipe.specializationSpellId === null
  ) return false;
  if (filters.specialization === "none" && recipe.specializationSpellId !== null) return false;
  if (
    filters.verification !== "all" &&
    recipe.provenance.verification.status !== filters.verification
  ) return false;
  if (
    filters.change !== "all" &&
    normalizedChangeType(changeType) !== filters.change
  ) return false;
  if (filters.minimumLearnSkill !== undefined || filters.maximumLearnSkill !== undefined) {
    if (recipe.learnSkill === null) return false;
    if (
      filters.minimumLearnSkill !== undefined &&
      recipe.learnSkill < filters.minimumLearnSkill
    ) return false;
    if (
      filters.maximumLearnSkill !== undefined &&
      recipe.learnSkill > filters.maximumLearnSkill
    ) return false;
  }
  return true;
}

function compareOptionalNumbers(left: number | null | undefined, right: number | null | undefined): number {
  if (left === undefined || left === null) return right === undefined || right === null ? 0 : 1;
  if (right === undefined || right === null) return -1;
  return left - right;
}

function usefulnessScore(recipe: Recipe, currentSkill: number): readonly number[] {
  const learnable = recipe.learnSkill === null
    ? 2
    : recipe.learnSkill <= currentSkill
      ? 0
      : 1;
  const availability = recipe.availability === "available"
    ? 0
    : recipe.availability === "unknown"
      ? 1
      : 2;
  const probability = getSkillUpProbability(currentSkill, recipe.thresholds);
  return [learnable, availability, probability > 0 ? 0 : 1, -probability];
}

function compareScores(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function filterAndSortRecipes(
  recipes: readonly Recipe[],
  options: CatalogDiscoveryOptions,
): readonly Recipe[] {
  const query = options.search.trim().toLowerCase();
  const matches = recipes.filter((recipe) =>
    matchesSearch(recipe, query) &&
    matchesFilters(recipe, options.filters, options.changeTypesByRecipeId.get(recipe.id)),
  );

  return [...matches].sort((left, right) => {
    let order = 0;
    if (options.sort === "learn-skill") {
      order = compareOptionalNumbers(left.learnSkill, right.learnSkill);
    } else if (options.sort === "current-skill") {
      order = compareScores(
        usefulnessScore(left, options.currentSkill),
        usefulnessScore(right, options.currentSkill),
      );
    } else if (options.sort === "expected-cost") {
      order = compareOptionalNumbers(
        getRecipeExpectedCost(left, options.currentSkill, options.pricesByItemId),
        getRecipeExpectedCost(right, options.currentSkill, options.pricesByItemId),
      );
    } else if (options.sort !== "name") {
      order = left.thresholds[options.sort] - right.thresholds[options.sort];
    }

    return order || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
  });
}

export function countActiveCatalogFilters(filters: CatalogFilters): number {
  return Number(filters.acquisition !== "all") +
    Number(filters.availability !== "all") +
    Number(filters.change !== "all") +
    Number(filters.faction !== "all") +
    Number(filters.itemType !== "all") +
    Number(filters.minimumLearnSkill !== undefined) +
    Number(filters.maximumLearnSkill !== undefined) +
    Number(filters.specialization !== "all") +
    Number(filters.verification !== "all");
}

export interface VirtualRange {
  readonly firstIndex: number;
  readonly lastIndex: number;
}

export function getVirtualRange(
  itemCount: number,
  rowHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscan = 5,
): VirtualRange {
  return {
    firstIndex: Math.max(0, Math.floor(scrollTop / rowHeight) - overscan),
    lastIndex: Math.min(
      itemCount,
      Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
    ),
  };
}

export function recipeIdFromUrlValue(url: string): string | undefined {
  return new URL(url).searchParams.get("recipe") ?? undefined;
}

export function urlWithRecipeId(url: string, recipeId: string): string {
  const nextUrl = new URL(url);
  nextUrl.searchParams.set("recipe", recipeId);
  return nextUrl.toString();
}
