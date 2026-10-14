import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERSONALIZATION,
  PERSONALIZATION_STORAGE_KEY,
  clearPersonalization,
  parsePersonalization,
  readPersonalization,
  writePersonalization,
} from "./personalization.js";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    values,
  };
}

describe("browser personalization", () => {
  it("falls back safely for missing, corrupt, and future-version values", () => {
    const storage = memoryStorage();
    expect(readPersonalization(storage)).toEqual(DEFAULT_PERSONALIZATION);

    storage.setItem(PERSONALIZATION_STORAGE_KEY, "not json");
    expect(readPersonalization(storage)).toEqual(DEFAULT_PERSONALIZATION);

    expect(parsePersonalization({ version: 2, currentSkill: 250 })).toEqual(
      DEFAULT_PERSONALIZATION,
    );
  });

  it("sanitizes persisted values without hiding invalid state", () => {
    expect(
      parsePersonalization({
        version: 1,
        currentSkill: 999,
        routeStartSkill: 225,
        targetSkill: 100,
        routeObjective: "fastest",
        shoppingStrategy: "craft-first",
        trainerOnly: true,
        region: " eu ",
        marketId: "forever.pve.alliance.eu",
        faction: "alliance",
        legacyProfessionSkillBonus: -10,
        changeFilters: {
          professionId: "leatherworking",
          changeFilter: "UPDATED",
          itemType: "GEAR",
          showAboveSkill: false,
          showUnknownSkill: false,
        },
      }),
    ).toEqual({
      version: 1,
      currentSkill: 300,
      routeStartSkill: 225,
      targetSkill: 225,
      routeObjective: "crafts",
      shoppingStrategy: "craft-first",
      trainerOnly: true,
      region: "eu",
      marketId: "forever.pve.alliance.eu",
      faction: "alliance",
      legacyProfessionSkillBonus: 0,
      changeFilters: {
        professionId: "leatherworking",
        changeFilter: "UPDATED",
        itemType: "GEAR",
        showAboveSkill: false,
        showUnknownSkill: false,
      },
    });
  });

  it("round-trips and clears a valid profile", () => {
    const storage = memoryStorage();
    const profile = {
      ...DEFAULT_PERSONALIZATION,
      currentSkill: 137,
      targetSkill: 225,
      routeObjective: "materials" as const,
    };

    expect(writePersonalization(profile, storage)).toBe(true);
    expect(readPersonalization(storage)).toEqual(profile);
    expect(clearPersonalization(storage)).toBe(true);
    expect(storage.values.size).toBe(0);
  });
});
