/** Editorial character-level targets, researched once in docs/CRAFTING_MILESTONES.md. */
export const CRAFT_LEVEL_TARGETS = [20, 30, 40, 50, 55, 60] as const;
export type CraftLevelTarget = typeof CRAFT_LEVEL_TARGETS[number];

export interface CraftRole {
  readonly id: string;
  readonly label: string;
  readonly priorities: string;
  /** Editorial comparison weights, not simulated DPS/healing or verified stat equivalences. */
  readonly weights: Readonly<Record<number, number>>;
  readonly armorWeight?: number;
}

const melee: CraftRole = {
  id: "melee", label: "Melee damage", priorities: "Agility, attack power, hit and critical strike",
  weights: { 3: 2, 4: 1, 7: 0.25, 31: 1.5, 32: 1.5, 38: 1 },
};
const strength: CraftRole = {
  id: "melee", label: "Melee damage", priorities: "Strength, attack power, hit and critical strike",
  weights: { 3: 1, 4: 2, 7: 0.25, 31: 1.5, 32: 1.5, 38: 1 },
};
const healing: CraftRole = {
  id: "healing", label: "Healing", priorities: "Healing power, intellect and mana sustain",
  weights: { 5: 0.5, 6: 0.35, 7: 0.1, 32: 0.5, 41: 1, 43: 2, 45: 1 },
};
const caster: CraftRole = {
  id: "caster", label: "Spell damage", priorities: "Spell power, intellect, hit and critical strike",
  weights: { 5: 0.5, 6: 0.15, 7: 0.1, 31: 1.5, 32: 1, 42: 1, 45: 1 },
};
const tank: CraftRole = {
  id: "tank", label: "Tanking", priorities: "Stamina, armor, agility and avoidance",
  weights: { 3: 1, 4: 0.5, 7: 2, 13: 1.5, 14: 1.5, 50: 0.06 }, armorWeight: 0.06,
};

export const CRAFT_CLASSES: readonly {
  readonly id: string;
  readonly label: string;
  readonly armor: number;
  readonly armorAt40?: number;
  readonly roles: readonly CraftRole[];
}[] = [
  { id: "rogue", label: "Rogue", armor: 2, roles: [melee] },
  { id: "druid", label: "Druid", armor: 2, roles: [
    { ...melee, id: "cat", label: "Feral · Cat", priorities: "Agility, strength and attack power", weights: { ...melee.weights, 4: 2 } },
    { ...tank, id: "bear", label: "Feral · Bear", weights: { ...tank.weights, 14: 0 } },
    { ...caster, id: "balance", label: "Balance", weights: { ...caster.weights, 86: 0.5 } },
    { ...healing, label: "Restoration" },
  ] },
  { id: "hunter", label: "Hunter", armor: 2, armorAt40: 3, roles: [
    { ...melee, id: "ranged", label: "Ranged damage", priorities: "Agility, ranged attack power, hit and critical strike", weights: { 3: 2, 5: 0.3, 7: 0.25, 31: 1.5, 32: 1.5, 38: 1, 39: 1 } },
  ] },
  { id: "shaman", label: "Shaman", armor: 2, armorAt40: 3, roles: [
    { ...strength, id: "enhancement", label: "Enhancement", priorities: "Strength, attack power, agility and spell power", weights: { ...strength.weights, 42: 0.4, 45: 0.4 } },
    { ...caster, id: "elemental", label: "Elemental", weights: { ...caster.weights, 86: 0.5 } },
    { ...healing, label: "Restoration" },
  ] },
  { id: "warrior", label: "Warrior", armor: 3, armorAt40: 4, roles: [strength, tank] },
  { id: "paladin", label: "Paladin", armor: 3, armorAt40: 4, roles: [
    { ...strength, label: "Retribution" }, { ...healing, label: "Holy" }, { ...tank, label: "Protection" },
  ] },
  { id: "priest", label: "Priest", armor: 1, roles: [healing, { ...caster, label: "Shadow" }] },
  { id: "mage", label: "Mage", armor: 1, roles: [caster] },
  { id: "warlock", label: "Warlock", armor: 1, roles: [caster] },
];

export function getCraftProfile(classId: string, roleId: string) {
  const character = CRAFT_CLASSES.find(({ id }) => id === classId) ?? CRAFT_CLASSES[0]!;
  const role = character.roles.find(({ id }) => id === roleId) ?? character.roles[0]!;
  return { character, role };
}

export interface CraftEquipment {
  readonly itemId: string;
  readonly name: string;
  readonly itemClassId?: number | undefined;
  readonly itemSubClassId?: number | undefined;
  readonly inventoryType?: string | undefined;
  readonly clientData?: {
    readonly armor?: number | undefined;
    readonly requiredLevel: number;
    readonly stats?: readonly { readonly statId: number; readonly value: number }[] | undefined;
    readonly source: { readonly product: string; readonly build: string; readonly locale: string };
  } | undefined;
}

export interface CraftRecipe {
  readonly id: string;
  readonly faction: string;
  readonly availability: string;
  readonly outputs: readonly CraftEquipment[];
  readonly provenance: { readonly source: string; readonly verification: { readonly status: string } };
}

const SLOTS: readonly [string, readonly string[]][] = [
  ["Head", ["INVTYPE_HEAD"]], ["Neck", ["INVTYPE_NECK"]],
  ["Shoulders", ["INVTYPE_SHOULDER"]], ["Back", ["INVTYPE_CLOAK"]],
  ["Chest", ["INVTYPE_CHEST", "INVTYPE_ROBE"]], ["Wrists", ["INVTYPE_WRIST", "INVTYPE_WRISTS"]],
  ["Hands", ["INVTYPE_HAND", "INVTYPE_HANDS"]], ["Waist", ["INVTYPE_WAIST"]],
  ["Legs", ["INVTYPE_LEGS"]], ["Feet", ["INVTYPE_FEET"]],
  ["Finger", ["INVTYPE_FINGER"]], ["Trinket", ["INVTYPE_TRINKET"]],
];

export interface CraftPick<R extends CraftRecipe> {
  readonly recipe: R;
  readonly output: R["outputs"][number];
  readonly score: number;
}

/** Compares known equipment stats within a profession; does not establish obtainability. */
export function recommendCrafts<R extends CraftRecipe>(
  recipes: readonly R[],
  options: { readonly classId: string; readonly roleId: string; readonly level: CraftLevelTarget; readonly faction: string },
) {
  const { character, role } = getCraftProfile(options.classId, options.roleId);
  const armorLimit = options.level >= 40 ? character.armorAt40 ?? character.armor : character.armor;
  const bySlot = new Map<string, CraftPick<R>[]>();
  let missingDataCount = 0;
  let excludedEvidenceCount = 0;
  for (const recipe of recipes) {
    for (const output of recipe.outputs) {
      const slot = SLOTS.find(([, types]) => types.includes(output.inventoryType ?? ""))?.[0];
      if (output.itemClassId !== 4 || slot === undefined) continue;
      if (recipe.availability === "unavailable" || recipe.provenance.verification.status === "rejected" ||
          recipe.provenance.source === "classic-fallback" || recipe.provenance.source === "fixture") {
        excludedEvidenceCount += 1;
        continue;
      }
      if ((recipe.faction === "alliance" || recipe.faction === "horde") && recipe.faction !== options.faction) continue;
      const data = output.clientData;
      if (data === undefined || data.stats === undefined || output.itemSubClassId === undefined ||
          !["wowf", "wow_classic_beta"].includes(data.source.product) || !data.source.build.startsWith("1.60.")) {
        missingDataCount += 1;
        continue;
      }
      if (data.requiredLevel > options.level) continue;
      // Cloaks are wearable by all classes. Armor subclasses 1–4 are cloth through plate.
      if (slot !== "Back" && output.itemSubClassId > armorLimit) continue;
      const score = data.stats.reduce((total, stat) => total + stat.value * (role.weights[stat.statId] ?? 0), 0)
        + (data.armor ?? 0) * (role.armorWeight ?? 0);
      if (score <= 0) continue;
      const picks = bySlot.get(slot) ?? [];
      picks.push({ recipe, output, score });
      bySlot.set(slot, picks);
    }
  }
  const slots = SLOTS.flatMap(([slot]) => {
    const candidates = bySlot.get(slot);
    if (candidates === undefined) return [];
    candidates.sort((a, b) => b.score - a.score ||
      Number(b.recipe.availability === "available") - Number(a.recipe.availability === "available") ||
      a.output.clientData!.requiredLevel - b.output.clientData!.requiredLevel ||
      a.recipe.id.localeCompare(b.recipe.id, "en") || a.output.itemId.localeCompare(b.output.itemId, "en"));
    const seen = new Set<string>();
    const unique = candidates.filter(({ output }) => {
      if (seen.has(output.itemId)) return false;
      seen.add(output.itemId);
      return true;
    });
    return [{ slot, best: unique[0]!, alternatives: unique.slice(1, 3) }];
  });
  return { slots, missingDataCount, excludedEvidenceCount };
}
