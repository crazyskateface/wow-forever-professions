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

    expect(parsePersonalization({ version: 4, currentSkill: 250 })).toEqual(
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
      version: 3,
      currentSkill: FOREVER_BUILD_CONFIG.maxBaseSkill,
      region: "eu",
      marketId: "forever.pve.alliance.eu",
      faction: "alliance",
      legacyProfessionSkillBonus: 0,
      changeFilters: {
        professionId: "leatherworking",
        changeFilter: "UPDATED",
        itemType: "GEAR",
        gearSlots: [],
        sortBy: "name",
        sortDirection: "asc",
        showAboveSkill: false,
        showUnknownSkill: false,
      },
    });
  });

  it("sanitizes saved gear slots and retains them across storage round-trips", () => {
    const profile = parsePersonalization({ ...DEFAULT_PERSONALIZATION, changeFilters: {
      ...DEFAULT_PERSONALIZATION.changeFilters, gearSlots: ["head", "bogus", "head", "off-hand", 42],
    } });
    expect(profile.changeFilters.gearSlots).toEqual(["head", "off-hand"]);
    const storage = memoryStorage();
    writePersonalization(profile, storage);
    expect(readPersonalization(storage)).toEqual(profile);
    expect(parsePersonalization({ ...profile, changeFilters: { gearSlots: "head" } }).changeFilters.gearSlots).toEqual([]);
  });

  it("retains valid sort settings and defaults invalid or older preferences", () => {
    const profile = parsePersonalization({ ...DEFAULT_PERSONALIZATION, changeFilters: { sortBy: "skill", sortDirection: "desc" } });
    const storage = memoryStorage();
    writePersonalization(profile, storage);
    expect(readPersonalization(storage).changeFilters).toMatchObject({ sortBy: "skill", sortDirection: "desc" });
    expect(parsePersonalization({ ...profile, changeFilters: { sortBy: "bogus", sortDirection: "sideways" } }).changeFilters).toMatchObject({ sortBy: "name", sortDirection: "asc" });
  });

  it("migrates version-1 profiles without retaining removed guide settings", () => {
    expect(parsePersonalization({
      ...DEFAULT_PERSONALIZATION,
      version: 1,
      currentSkill: 175,
      routeStartSkill: 20,
      routeStartLinked: true,
      targetSkill: 100,
      routePreset: undefined,
      routeConfidencePolicy: "supported-only",
    })).toMatchObject({
      version: 3,
      currentSkill: 175,
    });
    expect(parsePersonalization({
      ...DEFAULT_PERSONALIZATION,
      version: 1,
      routeStartSkill: 20,
      routeStartLinked: true,
      targetSkill: 100,
    })).not.toHaveProperty("routeStartSkill");
  });

  it("clamps persisted current skill to the playable 1-300 range", () => {
    expect(parsePersonalization({
      ...DEFAULT_PERSONALIZATION,
      currentSkill: 0,
    })).toMatchObject({
      currentSkill: 1,
    });
  });

  it.each([1, 2])("reads version-%i storage and drops removed route and shopping settings", (version) => {
    const storage = memoryStorage();
    storage.setItem(`forever-professions.personalization.v${version}`, JSON.stringify({
      ...DEFAULT_PERSONALIZATION,
      version,
      currentSkill: 144,
      routeStartSkill: 120,
      routeStartLinked: false,
      targetSkill: 180,
      routePreset: "experimental",
      shoppingStrategy: "craft-first",
    }));

    expect(readPersonalization(storage)).toMatchObject({
      version: 3,
      currentSkill: 144,
    });
    expect(readPersonalization(storage)).not.toHaveProperty("targetSkill");
    expect(readPersonalization(storage)).not.toHaveProperty("routePreset");
    expect(readPersonalization(storage)).not.toHaveProperty("shoppingStrategy");
  });

  it("round-trips and clears a valid profile", () => {
    const storage = memoryStorage();
    const profile = {
      ...DEFAULT_PERSONALIZATION,
      currentSkill: 137,
    };

    expect(writePersonalization(profile, storage)).toBe(true);
    expect(readPersonalization(storage)).toEqual(profile);
    storage.setItem("forever-professions.personalization.v1", "legacy");
    storage.setItem("forever-professions.personalization.v2", "previous");
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
