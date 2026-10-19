import { describe, expect, it } from "vitest";
import { FOREVER_BUILD_CONFIG } from "@forever-professions/domain";
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
        routeStartLinked: false,
        targetSkill: 100,
        routeObjective: "fastest",
        routeConfidencePolicy: "reckless",
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
      currentSkill: FOREVER_BUILD_CONFIG.maxBaseSkill,
      routeStartSkill: 225,
      routeStartLinked: false,
      targetSkill: 225,
      routeObjective: "crafts",
      routeConfidencePolicy: "practical",
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

  it("keeps a linked route start aligned with current skill", () => {
    expect(parsePersonalization({
      ...DEFAULT_PERSONALIZATION,
      currentSkill: 175,
      routeStartSkill: 20,
      routeStartLinked: true,
      targetSkill: 100,
      routeConfidencePolicy: "supported-only",
    })).toMatchObject({
      currentSkill: 175,
      routeStartSkill: 175,
      routeStartLinked: true,
      targetSkill: 175,
      routeConfidencePolicy: "supported-only",
    });
  });

  it("round-trips and clears a valid profile", () => {
    const storage = memoryStorage();
    const profile = {
      ...DEFAULT_PERSONALIZATION,
      currentSkill: 137,
      routeStartSkill: 137,
      targetSkill: 225,
      routeObjective: "materials" as const,
    };

    expect(writePersonalization(profile, storage)).toBe(true);
    expect(readPersonalization(storage)).toEqual(profile);
    expect(clearPersonalization(storage)).toBe(true);
    expect(storage.values.size).toBe(0);
  });

  it("survives browsers that block access to localStorage", () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const blockedWindow = Object.defineProperty({}, "localStorage", {
      configurable: true,
      get() {
        throw new Error("Storage access is blocked.");
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: blockedWindow,
    });

    try {
      expect(readPersonalization()).toEqual(DEFAULT_PERSONALIZATION);
      expect(writePersonalization(DEFAULT_PERSONALIZATION)).toBe(false);
      expect(clearPersonalization()).toBe(false);
    } finally {
      if (previousWindow === undefined) {
        Reflect.deleteProperty(globalThis, "window");
      } else {
        Object.defineProperty(globalThis, "window", previousWindow);
      }
    }
  });
});
