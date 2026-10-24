import { describe, expect, it } from "vitest";
import type { ProfessionFixture, Recipe } from "@forever-professions/contracts";
import {
  LEATHERWORKING_KNOWLEDGE_PAGES,
  leatherworkingKnowledgePageFromPath,
  isIllustrativeKnowledgeCatalog,
  plannerRecipeHref,
  primaryRecipesForAcquisition,
  recipeKnowledgeHref,
  supplementalRecipesForSourceKind,
  summarizeKnowledgeCatalog,
} from "./leatherworking-knowledge.js";

function recipe(overrides: Partial<Recipe> & Pick<Recipe, "id" | "name">): Recipe {
  const { id, name, ...rest } = overrides;
  return {
    id,
    spellId: 1,
    name,
    professionId: "leatherworking",
    buildId: "1.60.1.69977",
    learnSkill: 1,
    acquisition: "unknown",
    faction: "unknown",
    specializationSpellId: null,
    cooldownSeconds: null,
    availability: "unknown",
    thresholds: { orange: 1, yellow: 10, green: 20, gray: 30 },
    reagents: [],
    outputs: [{ itemId: `item-${id}`, name, quantity: 1 }],
    provenance: {
      source: "client-data",
      sourceLabel: "Forever client",
      verification: { status: "unverified" },
    },
    ...rest,
  };
}

function profession(recipes: readonly Recipe[]): ProfessionFixture {
  return {
    build: "1.60.1.69977",
    id: "leatherworking",
    name: "Leatherworking",
    recipes: [...recipes],
  };
}

describe("Leatherworking knowledge pages", () => {
  it("gives every knowledge page a unique direct route that round-trips", () => {
    const entries = Object.entries(LEATHERWORKING_KNOWLEDGE_PAGES);
    expect(new Set(entries.map(([, definition]) => definition.href)).size).toBe(entries.length);
    for (const [id, definition] of entries) {
      expect(leatherworkingKnowledgePageFromPath(definition.href)).toBe(id);
      expect(definition.description.length).toBeGreaterThan(20);
      expect(definition.title.length).toBeGreaterThan(5);
    }
  });

  it("recognizes every directly addressable guide family", () => {
    expect(leatherworkingKnowledgePageFromPath("/leatherworking/")).toBe("overview");
    expect(leatherworkingKnowledgePageFromPath("/LEATHERWORKING/CHANGES")).toBe("changes");
    expect(leatherworkingKnowledgePageFromPath("/leatherworking/trainers")).toBe("trainers");
    expect(leatherworkingKnowledgePageFromPath("/leatherworking/sources/drop")).toBe("source-drop");
    expect(leatherworkingKnowledgePageFromPath("/leatherworking/unknown")).toBeUndefined();
  });

  it("summarizes supported and unknown evidence without smoothing the gaps", () => {
    const supported = recipe({
      id: "supported",
      name: "Supported",
      acquisition: "trainer",
      availability: "available",
      sourceKinds: ["trainer"],
      sourceDataOrigin: "forever",
      teachingItemId: 999,
      specializationSpellId: 10656,
    });
    const unknown = recipe({ id: "unknown", name: "Unknown", learnSkill: null });

    expect(summarizeKnowledgeCatalog(profession([supported, unknown]))).toEqual({
      availableRecipes: 1,
      foreverSourceEvidenceRecipes: 1,
      knownAcquisitionRecipes: 1,
      knownAvailabilityRecipes: 1,
      knownLearningRankRecipes: 1,
      sourceEvidenceRecipes: 1,
      specializationRecipes: 1,
      teachingItemRecipes: 1,
      totalRecipes: 2,
      unverifiedRecipes: 2,
    });
  });

  it("distinguishes the illustrative local fixture from build-scoped knowledge", () => {
    const fixtureRecipe = recipe({
      id: "fixture",
      name: "Fixture",
      provenance: {
        source: "fixture",
        sourceLabel: "Illustrative fixture",
        verification: { status: "unverified" },
      },
    });
    expect(isIllustrativeKnowledgeCatalog(profession([fixtureRecipe]))).toBe(true);
    expect(isIllustrativeKnowledgeCatalog(profession([
      fixtureRecipe,
      recipe({ id: "client", name: "Client" }),
    ]))).toBe(false);
  });

  it("keeps primary acquisition separate from supplemental source evidence", () => {
    const primary = recipe({
      id: "primary",
      name: "Primary",
      acquisition: "trainer",
      sourceKinds: ["trainer"],
      sourceDataOrigin: "forever",
    });
    const fallback = recipe({
      id: "fallback",
      name: "Fallback",
      sourceKinds: ["trainer"],
      sourceDataOrigin: "classic-borrowed",
    });
    const catalog = profession([fallback, primary]);

    expect(primaryRecipesForAcquisition(catalog, "trainer").map(({ id }) => id)).toEqual(["primary"]);
    expect(supplementalRecipesForSourceKind(catalog, "trainer", "trainer").map(({ id }) => id)).toEqual(["fallback"]);
  });

  it("builds guide and planner links without losing recipe identity", () => {
    expect(recipeKnowledgeHref("trainer", "spell-2162")).toBe(
      "/leatherworking/trainers#spell-2162",
    );
    expect(recipeKnowledgeHref("unknown", "spell-2162")).toBeUndefined();
    const plannerUrl = new URL(plannerRecipeHref("spell-2162"), "https://example.test");
    expect(plannerUrl.searchParams.get("recipe")).toBe("spell-2162");
    expect(plannerUrl.searchParams.get("view")).toBe("recipes");
  });
});
