import { describe, expect, it } from "vitest";
import { auditImportedBuildDataset, renderDataQualityMarkdown } from "./data-quality.js";

describe("imported build data-quality reporting", () => {
  it("reports uncertainty without discarding usable records", () => {
    const report = auditImportedBuildDataset({
      build: { id: "1.60.1.69977", version: "1.60.1" },
      sources: [
        { id: "client", kind: "client-data", label: "Client snapshot" },
      ],
      professions: [
        {
          id: "leatherworking",
          slug: "leatherworking",
          name: "Leatherworking",
          recipes: [
            {
              id: "spell-1",
              name: "Test recipe",
              thresholds: { orange: 1, yellow: 10, green: 20, gray: 30 },
              reagents: [
                {
                  item: { id: "item-2", gameId: 2, name: "Unknown item #2" },
                  quantity: 1,
                },
              ],
              outputs: [
                {
                  item: { id: "item-3", gameId: 3, name: "Result" },
                  minimumQuantity: 1,
                  maximumQuantity: 1,
                },
              ],
              sourceId: "client",
              verification: {
                status: "unverified",
                notes: "Output quantity is provisionally one.",
              },
              provenanceNotes: "A borrowed required skill was deliberately not imported.",
            },
          ],
        },
      ],
    });

    expect(report).toMatchObject({
      recipes: 1,
      items: 2,
      sourceKinds: { "client-data": 1 },
      verificationStatuses: { unverified: 1 },
    });
    expect(report.findings.map(({ code }) => code)).toEqual([
      "unverified-recipe",
      "missing-item-name",
      "borrowed-required-skill-omitted",
      "provisional-output-quantity",
    ]);
    expect(renderDataQualityMarkdown(report)).toContain(
      "WARNING · missing-item-name (1)",
    );
  });

  it("enforces review metadata conventions in the audit", () => {
    const recipe = {
      name: "Test recipe",
      thresholds: { orange: 1, yellow: 10, green: 20, gray: 30 },
      reagents: [
        { item: { id: "item-2", gameId: 2, name: "Reagent" }, quantity: 1 },
      ],
      outputs: [
        {
          item: { id: "item-3", gameId: 3, name: "Result" },
          minimumQuantity: 1,
          maximumQuantity: 1,
        },
      ],
      sourceId: "client",
    } as const;
    const report = auditImportedBuildDataset({
      build: { id: "review-test", version: "review-test" },
      sources: [{ id: "client", kind: "client-data", label: "Client snapshot" }],
      professions: [
        {
          id: "leatherworking",
          slug: "leatherworking",
          name: "Leatherworking",
          recipes: [
            { ...recipe, id: "verified-without-reviewer", verification: { status: "verified" } },
            {
              ...recipe,
              id: "unverified-with-review-time",
              verification: {
                status: "unverified",
                verifiedAt: "2026-10-08T12:00:00.000Z",
              },
            },
            {
              ...recipe,
              id: "rejected-without-rationale",
              verification: {
                status: "rejected",
                verifiedAt: "2026-10-08T12:00:00.000Z",
                verifiedBy: "reviewer@example.invalid",
              },
            },
          ],
        },
      ],
    });

    expect(report.findings.map(({ code }) => code)).toEqual([
      "incomplete-review-metadata",
      "premature-review-metadata",
      "missing-rejection-rationale",
      "rejected-recipe",
      "unverified-recipe",
    ]);
  });
});
