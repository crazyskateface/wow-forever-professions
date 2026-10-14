import { describe, expect, it } from "vitest";
import { guideReferenceSchema } from "./guide-validation.js";

const reference = {
  schemaVersion: 1,
  id: "example-guide",
  title: "Example guide",
  professionId: "leatherworking",
  startSkill: 1,
  targetSkill: 5,
  optimizationIntent: "fewest-crafts",
  source: {
    publisher: "Example",
    url: "https://example.com/guide",
    capturedAt: "2026-10-14T12:00:00.000Z",
  },
  assumptions: [],
  steps: [
    { startSkill: 1, endSkill: 3, recipeName: "Recipe A" },
    { startSkill: 3, endSkill: 5, recipeName: "Recipe B" },
  ],
} as const;

describe("guide reference contract", () => {
  it("accepts a contiguous, source-attributed route", () => {
    expect(guideReferenceSchema.parse(reference)).toEqual(reference);
  });

  it("rejects gaps and routes that do not reach the target", () => {
    expect(() =>
      guideReferenceSchema.parse({
        ...reference,
        steps: [
          { startSkill: 1, endSkill: 2, recipeName: "Recipe A" },
          { startSkill: 3, endSkill: 4, recipeName: "Recipe B" },
        ],
      }),
    ).toThrow(/contiguous|finish at target skill/i);
  });
});
