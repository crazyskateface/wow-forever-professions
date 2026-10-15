import type { ImportedBuildDataset } from "@forever-professions/contracts";
import { describe, expect, it } from "vitest";
import {
  createDsqlBatches,
  createRawDatasetKey,
  diffBuilds,
  normalizeBuildDataset,
  renderBuildDiffMarkdown,
} from "./index.js";

function buildDataset(buildId: string): ImportedBuildDataset {
  return {
    build: { id: buildId, version: buildId },
    sources: [{ id: `client-${buildId}`, kind: "client-data", label: `Client ${buildId}` }],
    professions: [
      {
        id: "leatherworking",
        slug: "leatherworking",
        name: "Leatherworking",
        recipes: [
          {
            id: "heavy-armor-kit",
            name: "Heavy Armor Kit",
            metadata: {
              spellId: 3780,
              learnSkill: 150,
              acquisition: "trainer",
              faction: "both",
              specializationSpellId: null,
              cooldownSeconds: null,
              availability: "available",
            },
            thresholds: { orange: 150, yellow: 170, green: 180, gray: 190 },
            reagents: [
              {
                item: { id: "heavy-leather", gameId: 4234, name: "Heavy Leather" },
                quantity: 5,
              },
            ],
            outputs: [
              {
                item: { id: "heavy-armor-kit-item", name: "Heavy Armor Kit" },
                minimumQuantity: 1,
                maximumQuantity: 1,
              },
            ],
            sourceId: `client-${buildId}`,
            verification: { status: "unverified" },
          },
        ],
      },
    ],
  };
}

describe("build normalization", () => {
  it("creates stable versioned rows without overwriting recipe identity", () => {
    const dataset = buildDataset("11.2.7.65000");
    dataset.professions[0]!.recipes[0]!.reagents[0]!.item.classification = {
      id: 14483,
      label: "Scarce",
      color: -7885825,
      source: {
        product: "wow_classic_beta",
        build: "1.60.1.70374",
        locale: "enUS",
      },
    };
    Object.assign(dataset.professions[0]!.recipes[0]!.reagents[0]!.item, {
      itemClassId: 7,
      itemSubClassId: 6,
      inventoryType: "INVTYPE_NON_EQUIP_IGNORE",
      clientData: {
        displayName: "Heavy Leather",
        qualityId: 1,
        requiredLevel: 0,
        sellPriceCopper: 15,
        source: {
          product: "wow_classic_beta",
          build: "1.60.1.70374",
          locale: "enUS",
        },
      },
    });
    const normalized = normalizeBuildDataset(dataset);

    expect(normalized.recipeVersions[0]?.id).toBe("heavy-armor-kit@11.2.7.65000");
    expect(normalized.recipes[0]).toEqual({
      id: "heavy-armor-kit",
      professionId: "leatherworking",
    });
    expect(normalized.recipeMetadata[0]).toMatchObject({
      recipeVersionId: "heavy-armor-kit@11.2.7.65000",
      spellId: 3780,
      learnSkill: 150,
    });
    expect(normalized.items.map(({ id }) => id)).toEqual([
      "heavy-armor-kit-item",
      "heavy-leather",
    ]);
    expect(normalized.items.find(({ id }) => id === "heavy-leather")?.classification).toEqual({
      id: 14483,
      label: "Scarce",
      color: -7885825,
      source: {
        product: "wow_classic_beta",
        build: "1.60.1.70374",
        locale: "enUS",
      },
    });
    expect(normalized.items.find(({ id }) => id === "heavy-leather")?.clientData).toEqual({
      displayName: "Heavy Leather",
      qualityId: 1,
      requiredLevel: 0,
      sellPriceCopper: 15,
      source: {
        product: "wow_classic_beta",
        build: "1.60.1.70374",
        locale: "enUS",
      },
    });
  });

  it("rejects recipes whose source was not declared", () => {
    const dataset = buildDataset("11.2.7.65000");
    dataset.professions[0]!.recipes[0]!.sourceId = "missing";

    expect(() => normalizeBuildDataset(dataset)).toThrow("unknown source");
  });
});

describe("raw dataset object keys", () => {
  it("addresses immutable raw data by build and checksum", () => {
    expect(createRawDatasetKey("11.2.7.65000", "a".repeat(64))).toBe(
      `raw/11.2.7.65000/${"a".repeat(64)}.json`,
    );
  });

  it("rejects path traversal in build IDs", () => {
    expect(() => createRawDatasetKey("../latest", "a".repeat(64))).toThrow("safe path");
  });
});

describe("build diffs", () => {
  it("reports changed, added, and removed recipes in readable Markdown", () => {
    const previousDataset = buildDataset("11.2.7.65000");
    previousDataset.professions[0]!.recipes.push({
      ...previousDataset.professions[0]!.recipes[0]!,
      id: "retired-recipe",
      name: "Retired Recipe",
    });
    const previous = normalizeBuildDataset(previousDataset);
    const currentDataset = buildDataset("11.2.8.65100");
    currentDataset.professions[0]!.recipes[0]!.thresholds.yellow = 175;
    currentDataset.professions[0]!.recipes.push({
      ...currentDataset.professions[0]!.recipes[0]!,
      id: "nightscape-headband",
      name: "Nightscape Headband",
    });
    const current = normalizeBuildDataset(currentDataset);

    const diff = diffBuilds(previous, current);
    expect(diff.changed[0]?.changedFields).toContain("thresholds");
    expect(diff.added).toEqual([
      { recipeId: "nightscape-headband", name: "Nightscape Headband" },
    ]);
    expect(diff.removed).toEqual([{ recipeId: "retired-recipe", name: "Retired Recipe" }]);
    expect(renderBuildDiffMarkdown(diff)).toContain("## Changed recipes");
  });
});

describe("DSQL write batches", () => {
  it("splits rows by conservative row limits", () => {
    expect(createDsqlBatches([1, 2, 3, 4, 5], { maximumRows: 2 })).toEqual([
      [1, 2],
      [3, 4],
      [5],
    ]);
  });

  it("refuses service-limit-breaking configuration", () => {
    expect(() => createDsqlBatches([1], { maximumRows: 3_001 })).toThrow("3000");
    expect(() => createDsqlBatches(["too large"], { maximumBytes: 2 })).toThrow(
      "exceeding",
    );
  });
});
