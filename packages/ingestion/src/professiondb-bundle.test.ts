import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROFESSIONS } from "@forever-professions/contracts";
import { bundleProfessionDbSnapshots, normalizeBuildDataset, parseRawDatasetBytes, compareRecipeBuilds } from "./index.js";

const target = parseRawDatasetBytes(readFileSync(new URL("../../../data/imports/forever-1.60.1.69977-professions.json", import.meta.url)));
const base = parseRawDatasetBytes(readFileSync(new URL("../../../data/imports/classic-era-1.15.9.69722-professions.json", import.meta.url)));

describe("complete profession snapshots", () => {
  it("normalizes every crafting, secondary, and smelting profession in one immutable build", () => {
    for (const dataset of [base, target]) {
      expect(dataset.professions.map(({ id }) => id)).toEqual(PROFESSIONS.map(({ id }) => id));
      const normalized = normalizeBuildDataset(dataset);
      expect(normalized.professions).toHaveLength(10);
      expect(new Set(normalized.recipes.map(({ id }) => id)).size).toBe(normalized.recipes.length);
    }
    expect(target.professions.flatMap(({ recipes }) => recipes)).toHaveLength(2511);
    expect(base.professions.flatMap(({ recipes }) => recipes)).toHaveLength(1565);
  });

  it("compares all logical recipes and preserves non-item enchantments and fishing training", () => {
    const comparison = compareRecipeBuilds(normalizeBuildDataset(base), normalizeBuildDataset(target), { comparisonType: "CLASSIC_TO_FOREVER", includeUnchanged: true });
    expect(comparison.summary.total).toBeGreaterThanOrEqual(2511);
    expect(new Set(comparison.changes.map(({ identity }) => identity.professionId)).size).toBe(10);
    const enchantment = target.professions.find(({ id }) => id === "enchanting")!.recipes.find(({ metadata }) => metadata.spellId === 7418)!;
    expect(enchantment.outputs).toEqual([]);
    expect(enchantment.reagents.length).toBeGreaterThan(0);
    const fishingRank = target.professions.find(({ id }) => id === "fishing")!.recipes.find(({ metadata }) => metadata.spellId === 7732)!;
    expect(fishingRank.outputs).toEqual([]);
    expect(fishingRank.metadata.teachingItemId).not.toBeUndefined();
  });

  it("namespaces the same spell across professions and rejects mixed or duplicate snapshots", () => {
    const leatherworking = { ...base, professions: base.professions.filter(({ id }) => id === "leatherworking") };
    const other = { ...leatherworking, professions: leatherworking.professions.map((profession) => ({ ...profession, id: "tailoring", slug: "tailoring", name: "Tailoring" })) };
    const bundled = bundleProfessionDbSnapshots([leatherworking, other]);
    expect(bundled.professions[0]!.recipes[0]!.id).toMatch(/^spell-/);
    expect(bundled.professions[1]!.recipes[0]!.id).toMatch(/^tailoring:spell-/);
    expect(() => normalizeBuildDataset(bundled)).not.toThrow();
    expect(() => bundleProfessionDbSnapshots([leatherworking, leatherworking])).toThrow(/Duplicate profession/);
    expect(() => bundleProfessionDbSnapshots([base, target])).toThrow(/same build/);
  });
});
