import { describe, expect, it } from "vitest";
import {
  createGuideValidation,
  renderGuideValidationMarkdown,
  type CompleteRouteResult,
  type ReferenceGuide,
  type ValidationRecipe,
} from "./index.js";

const route: CompleteRouteResult = {
  status: "complete",
  objective: "crafts",
  startSkill: 1,
  targetSkill: 4,
  steps: [
    {
      skill: 1,
      recipeId: "a",
      recipeName: "Recipe A",
      skillUpProbability: 1,
      expectedCrafts: 1,
      expectedMaterials: 2,
    },
    {
      skill: 2,
      recipeId: "a",
      recipeName: "Recipe A",
      skillUpProbability: 1,
      expectedCrafts: 1,
      expectedMaterials: 2,
    },
    {
      skill: 3,
      recipeId: "b",
      recipeName: "Recipe B",
      skillUpProbability: 0.5,
      expectedCrafts: 2,
      expectedMaterials: 6,
    },
  ],
  segments: [
    {
      recipeId: "a",
      recipeName: "Recipe A",
      startSkill: 1,
      endSkill: 3,
      expectedSkillUps: 2,
      expectedCrafts: 2,
      expectedMaterials: 4,
      alternatives: [],
    },
    {
      recipeId: "b",
      recipeName: "Recipe B",
      startSkill: 3,
      endSkill: 4,
      expectedSkillUps: 1,
      expectedCrafts: 2,
      expectedMaterials: 6,
      alternatives: [],
    },
  ],
  totals: {
    expectedSkillUps: 3,
    expectedCrafts: 4,
    expectedMaterials: 10,
  },
};

const recipes: readonly ValidationRecipe[] = [
  {
    id: "a",
    name: "Recipe A",
    learnSkill: 1,
    acquisition: "trainer",
    availability: "available",
    verificationStatus: "verified",
    reagents: [{ itemId: "leather", name: "Leather", quantity: 2 }],
  },
  {
    id: "b",
    name: "Recipe B",
    learnSkill: 3,
    acquisition: "unknown",
    availability: "unknown",
    verificationStatus: "unverified",
    reagents: [
      {
        itemId: "hide",
        name: "Pristine Hide",
        quantity: 3,
        classificationLabel: "Scarce",
      },
    ],
  },
  {
    id: "c",
    name: "Recipe C",
    learnSkill: 3,
    acquisition: "trainer",
    availability: "available",
    verificationStatus: "verified",
    reagents: [{ itemId: "leather", name: "Leather", quantity: 1 }],
  },
];

const reference: ReferenceGuide = {
  schemaVersion: 1,
  id: "reference",
  title: "Reference",
  professionId: "leatherworking",
  startSkill: 1,
  targetSkill: 4,
  optimizationIntent: "material-cost-proxy",
  source: {
    publisher: "Example",
    url: "https://example.com",
    capturedAt: "2026-10-14T12:00:00.000Z",
  },
  assumptions: ["Example assumption."],
  steps: [
    {
      startSkill: 1,
      endSkill: 3,
      recipeName: "Recipe A",
      expectedCrafts: 2,
      reagents: [{ name: "Leather", quantity: 4 }],
    },
    {
      startSkill: 3,
      endSkill: 4,
      recipeName: "Recipe C",
      expectedCrafts: 1,
      reagents: [{ name: "Leather", quantity: 1 }],
    },
  ],
};

describe("guide route validation", () => {
  it("compares skill decisions and exposes evidence risks without changing data", () => {
    const result = createGuideValidation({
      generatedAt: "2026-10-14T12:30:00.000Z",
      professionId: "leatherworking",
      professionName: "Leatherworking",
      recipeBuildId: "forever-test",
      route,
      recipes,
      reference,
    });

    expect(result.summary).toMatchObject({
      comparedSkills: 3,
      matchingSkills: 2,
      mismatchingSkills: 1,
      matchPercent: 66.667,
      generatedExpectedCrafts: 4,
      referenceExpectedCrafts: 3,
      expectedCraftDelta: 1,
      uncertainGeneratedRecipes: ["Recipe B"],
      scarceGeneratedRecipes: ["Recipe B"],
    });
    expect(result.disagreements).toEqual([
      expect.objectContaining({
        startSkill: 3,
        endSkill: 4,
        classification: "project-data-uncertainty",
      }),
    ]);
    expect(result.materials).toContainEqual({
      materialName: "Leather",
      generatedQuantity: 4,
      referenceQuantity: 5,
      delta: -1,
    });
    expect(result.materials).toContainEqual({
      materialName: "Pristine Hide",
      generatedQuantity: 6,
    });
  });

  it("renders a source-attributed Markdown review report", () => {
    const report = renderGuideValidationMarkdown(
      createGuideValidation({
        generatedAt: "2026-10-14T12:30:00.000Z",
        professionId: "leatherworking",
        professionName: "Leatherworking",
        recipeBuildId: "forever-test",
        route,
        recipes,
        reference,
      }),
    );

    expect(report).toContain("# Guide validation: Leatherworking 1–4");
    expect(report).toContain("[Example](https://example.com)");
    expect(report).toContain("`project-data-uncertainty`");
    expect(report).toContain("Pristine Hide");
  });

  it("rejects a reference for a different route range", () => {
    expect(() =>
      createGuideValidation({
        generatedAt: "2026-10-14T12:30:00.000Z",
        professionId: "leatherworking",
        professionName: "Leatherworking",
        recipeBuildId: "forever-test",
        route,
        recipes,
        reference: { ...reference, targetSkill: 5 },
      }),
    ).toThrow(/does not match generated range/i);
  });
});
