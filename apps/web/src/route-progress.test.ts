import { describe, expect, it } from "vitest";
import {
  createRouteProgressFingerprint,
  readRouteProgress,
  writeRouteProgress,
} from "./route-progress.js";

const segments = [
  { recipeId: "first", startSkill: 1, endSkill: 25 },
  { recipeId: "second", startSkill: 25, endSkill: 50 },
  { recipeId: "third", startSkill: 50, endSkill: 75 },
];

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("route progress", () => {
  it("creates a stable fingerprint and changes it for material route inputs", () => {
    const input = {
      build: "1.60.1.69977",
      professionId: "leatherworking",
      startSkill: 1,
      targetSkill: 75,
      preset: "practical" as const,
      objective: "crafts" as const,
      confidencePolicy: "practical" as const,
      marketId: "forever.pvp.horde.us",
      faction: "horde",
      knownRecipeIds: ["third", "first", "second"],
      segments,
    };
    const first = createRouteProgressFingerprint(input);
    expect(createRouteProgressFingerprint({
      ...input,
      knownRecipeIds: ["second", "third", "first"],
    })).toBe(first);
    expect(createRouteProgressFingerprint({
      ...input,
      confidencePolicy: "supported-only",
    })).not.toBe(first);
    expect(createRouteProgressFingerprint({
      ...input,
      preset: "experimental",
      confidencePolicy: "experimental",
    })).not.toBe(first);
    expect(createRouteProgressFingerprint({
      ...input,
      segments: segments.slice(0, 2),
    })).not.toBe(first);
  });

  it("persists completion only for the matching route fingerprint", () => {
    const storage = memoryStorage();
    expect(writeRouteProgress({
      fingerprint: "route-a",
      completedSegmentKeys: ["one", "one", "two"],
    }, storage)).toBe(true);
    expect(readRouteProgress("route-a", storage)).toEqual({
      fingerprint: "route-a",
      completedSegmentKeys: ["one", "two"],
    });
    expect(readRouteProgress("route-b", storage)).toEqual({
      fingerprint: "route-b",
      completedSegmentKeys: [],
    });
  });

  it("fails closed when browser storage is unavailable", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readRouteProgress("route-a", blocked).completedSegmentKeys).toEqual([]);
    expect(writeRouteProgress({
      fingerprint: "route-a",
      completedSegmentKeys: ["one"],
    }, blocked)).toBe(false);
  });
});
