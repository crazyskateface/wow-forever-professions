import type { RecipeChange } from "@forever-professions/contracts";

export const GEAR_SLOTS = [
  { id: "head", label: "Head", inventoryTypes: ["INVTYPE_HEAD"] },
  { id: "neck", label: "Neck", inventoryTypes: ["INVTYPE_NECK"] },
  { id: "shoulders", label: "Shoulders", inventoryTypes: ["INVTYPE_SHOULDER"] },
  { id: "back", label: "Back", inventoryTypes: ["INVTYPE_CLOAK"] },
  { id: "chest", label: "Chest", inventoryTypes: ["INVTYPE_CHEST", "INVTYPE_ROBE"] },
  { id: "wrist", label: "Wrist", inventoryTypes: ["INVTYPE_WRIST", "INVTYPE_WRISTS"] },
  { id: "hands", label: "Hands", inventoryTypes: ["INVTYPE_HAND", "INVTYPE_HANDS"] },
  { id: "waist", label: "Waist", inventoryTypes: ["INVTYPE_WAIST"] },
  { id: "legs", label: "Legs", inventoryTypes: ["INVTYPE_LEGS"] },
  { id: "feet", label: "Feet", inventoryTypes: ["INVTYPE_FEET"] },
  { id: "finger", label: "Finger", inventoryTypes: ["INVTYPE_FINGER"] },
  { id: "weapon", label: "Weapon", inventoryTypes: ["INVTYPE_WEAPON", "INVTYPE_WEAPONMAINHAND", "INVTYPE_2HWEAPON", "INVTYPE_RANGED", "INVTYPE_RANGEDRIGHT", "INVTYPE_THROWN"] },
  { id: "off-hand", label: "Off-hand", inventoryTypes: ["INVTYPE_WEAPONOFFHAND", "INVTYPE_SHIELD", "INVTYPE_HOLDABLE"] },
  { id: "relic", label: "Relic", inventoryTypes: ["INVTYPE_RELIC"] },
] as const;

export type GearSlot = typeof GEAR_SLOTS[number]["id"];

export function changeMatchesGearSlots(change: RecipeChange, selected: readonly GearSlot[]): boolean {
  if (selected.length === 0) return true;
  // Removed recipes use their base snapshot; a target with unknown slots stays unknown.
  return (change.target ?? change.base)?.outputs.some(({ inventoryType }) =>
    inventoryType !== undefined && GEAR_SLOTS.some(slot =>
      selected.includes(slot.id) && (slot.inventoryTypes as readonly string[]).includes(inventoryType),
    ),
  ) ?? false;
}

export function toggleGearSlot(selected: readonly GearSlot[], slot: GearSlot): readonly GearSlot[] {
  return selected.includes(slot) ? selected.filter(value => value !== slot) : [...selected, slot];
}
