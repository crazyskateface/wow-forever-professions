export const ITEM_TOOLTIP_HOVER_DELAY_MS = 1_000;

export interface ItemTooltipDetail {
  readonly text: string;
  readonly tone?: "accent" | "muted" | "warning";
}

export interface ItemTooltipData {
  readonly name: string;
  readonly gameItemId?: number;
  readonly itemClassId?: number;
  readonly itemSubClassId?: number;
  readonly inventoryType?: string;
  readonly equipmentSlot?: string;
  readonly armor?: number;
  readonly requiredLevel?: number;
  readonly sellPriceCopper?: number;
  readonly classification?: {
    readonly label: string;
  };
  readonly details?: readonly ItemTooltipDetail[];
}

const ITEM_CLASS_LABELS: Readonly<Record<number, string>> = {
  0: "Consumable",
  1: "Container",
  2: "Weapon",
  3: "Gem",
  4: "Armor",
  5: "Reagent",
  6: "Projectile",
  7: "Trade Goods",
  8: "Item Enhancement",
  9: "Recipe",
  10: "Currency",
  11: "Quiver",
  12: "Quest Item",
  13: "Key",
  15: "Miscellaneous",
  16: "Glyph",
};

const ARMOR_SUBCLASS_LABELS: Readonly<Record<number, string>> = {
  0: "Miscellaneous Armor",
  1: "Cloth Armor",
  2: "Leather Armor",
  3: "Mail Armor",
  4: "Plate Armor",
  6: "Shield",
};

const TRADE_GOODS_SUBCLASS_LABELS: Readonly<Record<number, string>> = {
  0: "Trade Goods",
  1: "Parts",
  2: "Explosives",
  3: "Devices",
  4: "Jewelcrafting",
  5: "Cloth",
  6: "Leather",
  7: "Metal & Stone",
  8: "Cooking",
  9: "Herb",
  10: "Elemental",
  11: "Other",
  12: "Enchanting",
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
  INVTYPE_HANDS: "Hands",
  INVTYPE_HEAD: "Head",
  INVTYPE_HOLDABLE: "Held In Off-hand",
  INVTYPE_LEGS: "Legs",
  INVTYPE_NECK: "Neck",
  INVTYPE_RANGED: "Ranged",
  INVTYPE_RANGEDRIGHT: "Ranged",
  INVTYPE_RELIC: "Relic",
  INVTYPE_ROBE: "Chest",
  INVTYPE_SHIELD: "Off Hand",
  INVTYPE_SHOULDER: "Shoulder",
  INVTYPE_TABARD: "Tabard",
  INVTYPE_THROWN: "Thrown",
  INVTYPE_TRINKET: "Trinket",
  INVTYPE_WAIST: "Waist",
  INVTYPE_WEAPON: "One-Hand",
  INVTYPE_WEAPONMAINHAND: "Main Hand",
  INVTYPE_WEAPONOFFHAND: "Off Hand",
  INVTYPE_WRIST: "Wrists",
  INVTYPE_WRISTS: "Wrists",
  INVTYPE_2HWEAPON: "Two-Hand",
};

export function getItemCategoryLabel(item: ItemTooltipData): string | undefined {
  if (item.itemClassId === 4 && item.itemSubClassId !== undefined) {
    return ARMOR_SUBCLASS_LABELS[item.itemSubClassId] ?? ITEM_CLASS_LABELS[item.itemClassId];
  }
  if (item.itemClassId === 7 && item.itemSubClassId !== undefined) {
    const subclass = TRADE_GOODS_SUBCLASS_LABELS[item.itemSubClassId];
    return subclass === undefined ? ITEM_CLASS_LABELS[item.itemClassId] : `${subclass} · Trade Goods`;
  }
  return item.itemClassId === undefined ? undefined : ITEM_CLASS_LABELS[item.itemClassId];
}

export function getInventoryTypeLabel(inventoryType: string | undefined): string | undefined {
  if (inventoryType === undefined || inventoryType === "INVTYPE_NON_EQUIP_IGNORE") {
    return undefined;
  }
  return INVENTORY_TYPE_LABELS[inventoryType];
}

export function formatTooltipSellPrice(copper: number): string {
  const rounded = Math.max(0, Math.round(copper));
  const gold = Math.floor(rounded / 10_000);
  const silver = Math.floor((rounded % 10_000) / 100);
  const remainder = rounded % 100;
  const parts = [
    ...(gold > 0 ? [`${gold}g`] : []),
    ...(silver > 0 ? [`${silver}s`] : []),
    ...(remainder > 0 || rounded === 0 ? [`${remainder}c`] : []),
  ];
  return parts.join(" ");
}

export function hasProvisionalOutputQuantity(
  notes: readonly (string | undefined)[],
): boolean {
  return notes.some((note) =>
    note !== undefined && /output quantity.*(?:provisional|unverified)/i.test(note)
  );
}
