import type { CraftSelection } from "./BestCrafts.js";

/** The professions with supported equipment recommendations and useful initial profiles. */
export function bestCraftDefaults(professionId: string): CraftSelection | undefined {
  switch (professionId) {
    case "leatherworking": return { classId: "rogue", roleId: "melee", level: 20 };
    case "tailoring": return { classId: "mage", roleId: "caster", level: 20 };
    case "blacksmithing": return { classId: "warrior", roleId: "melee", level: 20 };
    default: return undefined;
  }
}
