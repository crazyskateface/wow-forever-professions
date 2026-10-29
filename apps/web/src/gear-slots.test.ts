import { describe, expect, it } from "vitest";
import type { RecipeChange } from "@forever-professions/contracts";
import { GEAR_SLOTS, changeMatchesGearSlots, toggleGearSlot } from "./gear-slots.js";

function change(slots: readonly (string | undefined)[], removed = false): RecipeChange {
  const snapshot = { outputs: slots.map(inventoryType => ({ inventoryType })) };
  return { ...(removed ? { base: snapshot } : { target: snapshot }) } as RecipeChange;
}

describe("Forever Changes gear slots", () => {
  it.each(GEAR_SLOTS)("matches all imported variants of $label", slot => {
    for (const inventoryType of slot.inventoryTypes) {
      expect(changeMatchesGearSlots(change([inventoryType]), [slot.id])).toBe(true);
      expect(changeMatchesGearSlots(change([inventoryType], true), [slot.id])).toBe(true);
    }
  });

  it("combines selected slots and checks every output without guessing unknown slots", () => {
    expect(changeMatchesGearSlots(change(["INVTYPE_HEAD"]), ["head", "hands"])).toBe(true);
    expect(changeMatchesGearSlots(change(["INVTYPE_HANDS"]), ["head", "hands"])).toBe(true);
    expect(changeMatchesGearSlots(change(["INVTYPE_FEET", "INVTYPE_HEAD"]), ["head"])).toBe(true);
    expect(changeMatchesGearSlots(change(["INVTYPE_FEET"]), ["head", "hands"])).toBe(false);
    expect(changeMatchesGearSlots(change([undefined]), ["head"])).toBe(false);
    expect(changeMatchesGearSlots(change([undefined]), [])).toBe(true);
    expect(changeMatchesGearSlots(change([]), [])).toBe(true);
    const unknownTarget = { ...change(["INVTYPE_HEAD"], true), target: { outputs: [{}] } } as RecipeChange;
    expect(changeMatchesGearSlots(unknownTarget, ["head"])).toBe(false);
  });

  it("keeps weapons and off-hand equipment separate", () => {
    expect(changeMatchesGearSlots(change(["INVTYPE_WEAPONOFFHAND"]), ["weapon"])).toBe(false);
    expect(changeMatchesGearSlots(change(["INVTYPE_WEAPON"]), ["off-hand"])).toBe(false);
  });

  it("toggles independently and returns to the unfiltered state", () => {
    const head = toggleGearSlot([], "head");
    const both = toggleGearSlot(head, "hands");
    expect(both).toEqual(["head", "hands"]);
    expect(toggleGearSlot(both, "head")).toEqual(["hands"]);
    expect(toggleGearSlot(head, "head")).toEqual([]);
    expect(head).toEqual(["head"]);
  });
});
