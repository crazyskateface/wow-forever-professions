import { describe, expect, it } from "vitest";
import {
  auctionPriceObservationSchema,
  auctionPriceRequestSchema,
  healthResponseSchema,
  importedBuildDatasetSchema,
  professionFixtureSchema,
  recipeOutputSchema,
  routeOptimizationRequestSchema,
  routeOptimizationResponseSchema,
  shoppingListRequestSchema,
  shoppingListResponseSchema,
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

  it("preserves structured source and verification metadata for recipe data", () => {
    expect(
      professionFixtureSchema.parse({
        build: "fixture-0",
        id: "leatherworking",
        name: "Leatherworking",
        recipes: [
          {
            id: "heavy-armor-kit",
            spellId: null,
            name: "Heavy Armor Kit",
            professionId: "leatherworking",
            buildId: "fixture-0",
            learnSkill: 150,
            acquisition: "trainer",
            faction: "both",
            specializationSpellId: null,
            cooldownSeconds: null,
            availability: "available",
            thresholds: { orange: 150, yellow: 170, green: 180, gray: 190 },
            reagents: [],
            outputs: [
              { itemId: "heavy-armor-kit-item", name: "Heavy Armor Kit", quantity: 1 },
            ],
            provenance: {
              source: "classic-fallback",
              sourceLabel: "Classic reference",
              verification: { status: "unverified" },
              notes: "Awaiting Forever verification.",
            },
          },
        ],
      }).recipes[0]?.provenance,
    ).toEqual({
      source: "classic-fallback",
      sourceLabel: "Classic reference",
      verification: { status: "unverified" },
      notes: "Awaiting Forever verification.",
    });
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
                    item: {
                      id: "pristine-leather",
                      gameId: 249427,
                      name: "Pristine Leather",
                      classification: {
                        id: 14483,
                        label: "Scarce",
                        color: -7885825,
                        source: {
                          product: "wow_classic_beta",
                          build: "1.60.1.70374",
                          locale: "enUS",
                        },
                      },
                    },
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

  it("keeps spell-based recipe identity consistent with canonical metadata", () => {
    const parsed = importedBuildDatasetSchema.safeParse({
      build: { id: "1.60.1.69977", version: "1.60.1" },
      sources: [{ id: "client", kind: "client-data", label: "Client" }],
      professions: [
        {
          id: "leatherworking",
          slug: "leatherworking",
          name: "Leatherworking",
          recipes: [
            {
              id: "spell-1",
              name: "Mismatched recipe",
              metadata: {
                spellId: 2,
                learnSkill: 1,
                acquisition: "trainer",
                faction: "both",
                specializationSpellId: null,
                cooldownSeconds: null,
                availability: "available",
              },
              thresholds: { orange: 1, yellow: 2, green: 3, gray: 4 },
              reagents: [],
              outputs: [
                {
                  item: { id: "output", name: "Output" },
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
    });

    expect(parsed.success).toBe(false);
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

    expect(() =>
      auctionPriceObservationSchema.parse({
        provider: "ah-ledger",
        marketId: "forever.rp.horde.us",
        gameItemId: 2589,
        status: "available",
        medianUnitPriceCopper: 0,
        observedAt: "2026-10-07T22:46:00.000Z",
        fetchedAt: "2026-10-08T01:46:13.000Z",
      }),
    ).toThrow();
  });

  it("rejects invalid auction price requests at the provider boundary", () => {
    expect(() =>
      auctionPriceRequestSchema.parse({
        marketId: "forever.pvp.horde.us",
        gameItemIds: [2589, -1],
      }),
    ).toThrow();
  });

  it("validates route optimization requests and requires a market for cost", () => {
    expect(
      routeOptimizationRequestSchema.parse({
        professionId: "leatherworking",
        marketId: "forever.pvp.horde.us",
        startSkill: 150,
        targetSkill: 180,
        objective: "cost",
        constraints: {
          faction: "horde",
          specializationSpellIds: [10656],
          professionBranchId: "dragonscale",
          knownRecipeIds: ["heavy-armor-kit"],
          allowUnknownAvailability: true,
          allowUnknownFaction: true,
          allowCooldowns: false,
        },
        policy: {
          switchPenaltyRatio: 0.075,
          acquisitionPenaltyRatios: {
            vendor: 0.05,
            quest: 0.1,
            drop: 0.2,
            reputation: 0.2,
          },
          specializationPenaltyRatio: 0.1,
          cooldownPenaltyRatio: 0.25,
        },
      }),
    ).toBeDefined();
    expect(() =>
      routeOptimizationRequestSchema.parse({
        professionId: "leatherworking",
        startSkill: 150,
        targetSkill: 180,
        objective: "cost",
      }),
    ).toThrow("marketId");
    expect(
      routeOptimizationRequestSchema.safeParse({
        professionId: "leatherworking",
        startSkill: 150,
        targetSkill: 180,
        objective: "crafts",
        policy: { switchPenaltyRatio: 1.01 },
      }).success,
    ).toBe(false);
  });

  it("accepts a complete imported profession recipe selection", () => {
    expect(
      routeOptimizationRequestSchema.safeParse({
        professionId: "leatherworking",
        startSkill: 1,
        targetSkill: 300,
        objective: "crafts",
        constraints: {
          knownRecipeIds: Array.from(
            { length: 603 },
            (_, index) => `spell-${index + 1}`,
          ),
        },
      }).success,
    ).toBe(true);
  });

  it("accepts complete and blocked route results", () => {
    const base = {
      objective: "crafts",
      startSkill: 150,
      targetSkill: 151,
      steps: [
        {
          skill: 150,
          recipeId: "heavy-armor-kit",
          recipeName: "Heavy Armor Kit",
          skillUpProbability: 1,
          expectedCrafts: 1,
          expectedMaterials: 6,
        },
      ],
      segments: [
        {
          recipeId: "heavy-armor-kit",
          recipeName: "Heavy Armor Kit",
          startSkill: 150,
          endSkill: 151,
          expectedSkillUps: 1,
          expectedCrafts: 1,
          expectedMaterials: 6,
        },
      ],
      totals: {
        expectedSkillUps: 1,
        expectedCrafts: 1,
        expectedMaterials: 6,
      },
    } as const;
    expect(
      routeOptimizationResponseSchema.parse({
        professionId: "leatherworking",
        result: { status: "complete", ...base },
      }),
    ).toBeDefined();
    expect(
      routeOptimizationResponseSchema.parse({
        professionId: "leatherworking",
        result: {
          status: "blocked",
          ...base,
          blockedAtSkill: 151,
          reason: "no-eligible-recipe",
        },
      }),
    ).toBeDefined();
  });

  it("validates shopping-list requests and complete plans", () => {
    expect(
      shoppingListRequestSchema.parse({
        professionId: "leatherworking",
        marketId: "forever.pvp.horde.us",
        route: [{ recipeId: "heavy-armor-kit", expectedCrafts: 12.5 }],
      }),
    ).toMatchObject({ strategy: "cheapest" });

    expect(
      shoppingListResponseSchema.parse({
        professionId: "leatherworking",
        marketId: "forever.pvp.horde.us",
        plan: {
          status: "complete",
          strategy: "cheapest",
          routeReagents: [
            { itemId: "heavy-leather", itemName: "Heavy Leather", quantity: 62.5 },
          ],
          purchases: [
            {
              itemId: "heavy-leather",
              itemName: "Heavy Leather",
              quantity: 62.5,
              unitPriceCopper: 125,
              expectedCostCopper: 7_812.5,
            },
          ],
          crafts: [],
          unresolved: [],
          cycles: [],
          knownSubtotalCopper: 7_812.5,
          expectedCostCopper: 7_812.5,
        },
      }),
    ).toBeDefined();
  });

  it("keeps incomplete shopping totals explicit", () => {
    expect(() =>
      shoppingListResponseSchema.parse({
        professionId: "leatherworking",
        marketId: "forever.pvp.horde.us",
        plan: {
          status: "complete",
          strategy: "cheapest",
          routeReagents: [],
          purchases: [],
          crafts: [],
          unresolved: [
            {
              itemId: "unknown",
              itemName: "Unknown",
              quantity: 1,
              reason: "missing-price",
            },
          ],
          cycles: [],
          knownSubtotalCopper: 0,
        },
      }),
    ).toThrow("expected total");

    expect(() =>
      shoppingListRequestSchema.parse({
        professionId: "leatherworking",
        marketId: "forever.pvp.horde.us",
        route: [],
      }),
    ).toThrow();
  });
});
