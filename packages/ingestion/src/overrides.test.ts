import { describe, expect, it } from "vitest";
import { applyRecipeOverrides } from "./overrides.js";

const baseDataset = {
  build: { id: "1.60.1.69977", version: "1.60.1" },
  sources: [{ id: "client", kind: "client-data", label: "Client snapshot" }],
  professions: [
    {
      id: "leatherworking",
      slug: "leatherworking",
      name: "Leatherworking",
      recipes: [
        {
          id: "spell-2161",
          name: "Embossed Leather Boots",
          metadata: {
            spellId: 2161,
            learnSkill: null,
            borrowedLearnSkill: 40,
            acquisition: "unknown",
            sourceKinds: ["trainer"],
            sourceDataOrigin: "classic-borrowed",
            orangeSkillKnown: false,
            faction: "unknown",
            specializationSpellId: null,
            cooldownSeconds: null,
            availability: "unknown",
          },
          thresholds: { orange: 1, yellow: 80, green: 95, gray: 110 },
          reagents: [
            { item: { id: "item-2318", gameId: 2318, name: "Light Leather" }, quantity: 8 },
          ],
          outputs: [
            {
              item: { id: "item-2309", gameId: 2309, name: "Embossed Leather Boots" },
              minimumQuantity: 1,
              maximumQuantity: 1,
            },
          ],
          sourceId: "client",
          verification: { status: "unverified" },
        },
      ],
    },
  ],
} as const;

describe("recipe overrides", () => {
  it("merges corrected facts while preserving client-derived recipe structure", () => {
    const result = applyRecipeOverrides(baseDataset, {
      version: 1,
      sources: [{ id: "manual", kind: "manual-override", label: "Manual correction" }],
      recipes: [
        {
          id: "spell-2161",
          metadata: {
            learnSkill: 40,
            acquisition: "trainer",
            sourceKinds: ["trainer"],
            sourceDataOrigin: "forever",
            orangeSkillKnown: true,
            availability: "available",
          },
          thresholds: { orange: 40, yellow: 80, green: 95, gray: 110 },
          sourceId: "manual",
          verification: { status: "unverified", notes: "Observed in Forever." },
        },
      ],
    });

    const recipe = result.dataset.professions[0]?.recipes[0];
    expect(recipe).toMatchObject({
      sourceId: "manual",
      metadata: {
        spellId: 2161,
        learnSkill: 40,
        borrowedLearnSkill: 40,
        acquisition: "trainer",
        sourceDataOrigin: "forever",
        orangeSkillKnown: true,
        availability: "available",
      },
      thresholds: { orange: 40, yellow: 80, green: 95, gray: 110 },
    });
    expect(recipe?.reagents).toHaveLength(1);
    expect(result.appliedRecipeIds).toEqual(["spell-2161"]);
  });

  it("rejects overrides that do not match a recipe", () => {
    expect(() =>
      applyRecipeOverrides(baseDataset, {
        version: 1,
        sources: [{ id: "manual", kind: "manual-override", label: "Manual correction" }],
        recipes: [
          {
            id: "spell-9999",
            sourceId: "manual",
            verification: { status: "unverified" },
          },
        ],
      }),
    ).toThrow("spell-9999");
  });
});
