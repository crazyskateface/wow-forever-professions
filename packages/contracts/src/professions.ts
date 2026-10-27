/** Profession identities; null source names identify gathering without a recipe table. */
export const PROFESSIONS = [
  { id: "alchemy", name: "Alchemy", skillLineId: 171, sourceName: "Alchemy", group: "Crafting", initials: "AL", description: "Potions, elixirs, and transmutations" },
  { id: "blacksmithing", name: "Blacksmithing", skillLineId: 164, sourceName: "Blacksmithing", group: "Crafting", initials: "BS", description: "Metal armor, weapons, and sharpening stones" },
  { id: "enchanting", name: "Enchanting", skillLineId: 333, sourceName: "Enchanting", group: "Crafting", initials: "EN", description: "Equipment enchantments and enchanting tools" },
  { id: "engineering", name: "Engineering", skillLineId: 202, sourceName: "Engineering", group: "Crafting", initials: "EG", description: "Devices, explosives, and engineering equipment" },
  { id: "leatherworking", name: "Leatherworking", skillLineId: 165, sourceName: "Leatherworking", group: "Crafting", initials: "LW", description: "Leather armor, armor kits, and crafted equipment" },
  { id: "tailoring", name: "Tailoring", skillLineId: 197, sourceName: "Tailoring", group: "Crafting", initials: "TL", description: "Cloth armor, bags, and woven materials" },
  { id: "cooking", name: "Cooking", skillLineId: 185, sourceName: "Cooking", group: "Secondary", initials: "CO", description: "Meals and cooking recipes" },
  { id: "first-aid", name: "First Aid", skillLineId: 129, sourceName: "Firstaid", group: "Secondary", initials: "FA", description: "Bandages and first aid supplies" },
  { id: "fishing", name: "Fishing", skillLineId: 356, sourceName: "Fishing", group: "Secondary", initials: "FI", description: "Imported fishing recipes and training records" },
  { id: "herbalism", name: "Herbalism", skillLineId: 182, sourceName: null, group: "Gathering", initials: "HE", description: "Herb gathering" },
  { id: "mining", name: "Mining", skillLineId: 186, sourceName: "Mining", group: "Gathering", initials: "MI", description: "Smelting and material processing" },
  { id: "skinning", name: "Skinning", skillLineId: 393, sourceName: null, group: "Gathering", initials: "SK", description: "Leather, hide, and scale gathering" },
] as const;

export type ProfessionDefinition = (typeof PROFESSIONS)[number];

/** Only professions represented in the pinned recipe archive belong in recipe imports. */
export const RECIPE_PROFESSIONS = PROFESSIONS.filter((profession) => profession.sourceName !== null);

export function getProfessionDefinition(id: string): ProfessionDefinition | undefined {
  return PROFESSIONS.find((profession) => profession.id === id);
}
