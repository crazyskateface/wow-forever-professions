import { describe, expect, it } from "vitest";
import {
  auctionPriceObservationSchema,
  auctionPriceRequestSchema,
  healthResponseSchema,
  importedBuildDatasetSchema,
  professionFixtureSchema,
  recipeOutputSchema,
  skillThresholdsSchema,
} from "./index.js";

describe("shared contracts", () => {
  it("accepts the health response shape", () => {
    expect(
      healthResponseSchema.parse({
        service: "forever-professions-api",
        status: "ok",
        timestamp: "2026-10-07T12:00:00.000Z",
      }),
    ).toBeDefined();
  });

  it("rejects unordered thresholds", () => {
    expect(() =>
      skillThresholdsSchema.parse({ orange: 150, yellow: 180, green: 170, gray: 190 }),
    ).toThrow();
  });

  it("requires build and provenance metadata for fixtures", () => {
    expect(() =>
      professionFixtureSchema.parse({ id: "leatherworking", name: "Leatherworking", recipes: [] }),
    ).toThrow();
  });

  it("accepts a versioned imported build dataset", () => {
    expect(
      importedBuildDatasetSchema.parse({
        build: { id: "11.2.7.65000", version: "11.2.7" },
        sources: [{ id: "client-11.2.7", kind: "client-data", label: "Client 11.2.7" }],
        professions: [
          {
            id: "leatherworking",
            slug: "leatherworking",
            name: "Leatherworking",
            recipes: [
              {
                id: "heavy-armor-kit",
                name: "Heavy Armor Kit",
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
                sourceId: "client-11.2.7",
                verification: { status: "unverified" },
              },
            ],
          },
        ],
      }),
    ).toBeDefined();
  });

  it("rejects inverted recipe output ranges", () => {
    expect(() =>
      recipeOutputSchema.parse({
        recipeVersionId: "heavy-armor-kit@11.2.7.65000",
        itemId: "heavy-armor-kit-item",
        minimumQuantity: 2,
        maximumQuantity: 1,
      }),
    ).toThrow();
  });

  it("accepts normalized available auction prices in copper", () => {
    expect(
      auctionPriceObservationSchema.parse({
        provider: "ah-ledger",
        marketId: "forever.pvp.horde.us",
        gameItemId: 2589,
        status: "available",
        medianUnitPriceCopper: 30,
        minimumBuyoutUnitPriceCopper: 18,
        quantity: 11_343,
        estimatedSalesPerDay: 36_612.8,
        observedAt: "2026-10-07T22:46:00.000Z",
        fetchedAt: "2026-10-08T01:46:13.000Z",
        attribution: {
          text: "Prices from AHledger",
          url: "https://ahledger.com",
        },
      }),
    ).toBeDefined();
  });

  it("does not represent missing auction prices as zero", () => {
    expect(() =>
      auctionPriceObservationSchema.parse({
        provider: "ah-ledger",
        marketId: "forever.rp.horde.us",
        gameItemId: 2589,
        status: "available",
        quantity: 0,
        observedAt: "2026-10-07T22:46:00.000Z",
        fetchedAt: "2026-10-08T01:46:13.000Z",
      }),
    ).toThrow("at least one price field");
  });

  it("rejects invalid auction price requests at the provider boundary", () => {
    expect(() =>
      auctionPriceRequestSchema.parse({
        marketId: "forever.pvp.horde.us",
        gameItemIds: [2589, -1],
      }),
    ).toThrow();
  });
});
