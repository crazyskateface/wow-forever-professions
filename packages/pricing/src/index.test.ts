import type {
  AuctionMarket,
  AuctionPriceObservation,
} from "@forever-professions/contracts";
import { describe, expect, it } from "vitest";
import {
  AhLedgerAuctionPriceProvider,
  AuctionPriceProviderError,
  ManualAuctionPriceProvider,
  NoPriceProvider,
  refreshAuctionPrices,
  type CurrentAuctionPriceStore,
} from "./index.js";

const now = () => new Date("2026-10-08T01:46:13.000Z");

const manualMarket: AuctionMarket = {
  id: "manual.test.alliance.us",
  provider: "manual",
  game: "forever",
  ruleset: "test",
  faction: "alliance",
  region: "us",
  label: "Test Alliance US",
};

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("AH Ledger provider", () => {
  it("normalizes available, empty, and unknown items without inventing zero prices", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(input.toString());
      expect(url.pathname).toBe(
        "/v1/tooltip/forever.pvp.horde.us",
      );
      return jsonResponse({
        market: { slug: "forever/pvp/horde/us", label: "PvP Horde US" },
        items: [
          {
            id: 2589,
            median: 30,
            minBuyout: 18,
            quantity: 11_343,
            observedAt: "2026-10-07T22:46:00.000Z",
            salesPerDay: 36_612.8,
          },
          {
            id: 2592,
            median: null,
            minBuyout: null,
            quantity: null,
            observedAt: null,
            salesPerDay: null,
          },
        ],
      });
    };
    const provider = new AhLedgerAuctionPriceProvider({ fetch: fetchImpl, now });

    const prices = await provider.getCurrentPrices({
      marketId: "forever.pvp.horde.us",
      gameItemIds: [2589, 2592, 99_999_999],
    });

    expect(prices[0]).toMatchObject({
      status: "available",
      medianUnitPriceCopper: 30,
      minimumBuyoutUnitPriceCopper: 18,
      quantity: 11_343,
    });
    expect(prices[1]).toMatchObject({
      status: "unavailable",
      reason: "no-market-data",
    });
    expect(prices[2]).toMatchObject({
      status: "unavailable",
      reason: "item-not-found",
    });
  });

  it("chunks bulk tooltip requests at the provider limit", async () => {
    const batchSizes: number[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(input.toString());
      const ids = url.searchParams.get("items")!.split(",").map(Number);
      batchSizes.push(ids.length);
      return jsonResponse({
        market: { slug: "forever/pvp/horde/us", label: "PvP Horde US" },
        items: ids.map((id) => ({
          id,
          median: id,
          minBuyout: id,
          quantity: 1,
          observedAt: "2026-10-07T22:46:00.000Z",
          salesPerDay: null,
        })),
      });
    };
    const provider = new AhLedgerAuctionPriceProvider({ fetch: fetchImpl, now });

    const prices = await provider.getCurrentPrices({
      marketId: "forever.pvp.horde.us",
      gameItemIds: Array.from({ length: 205 }, (_, index) => index + 1),
    });

    expect(batchSizes).toEqual([100, 100, 5]);
    expect(prices).toHaveLength(205);
  });

  it("surfaces Retry-After on provider throttling", async () => {
    const provider = new AhLedgerAuctionPriceProvider({
      fetch: async () =>
        jsonResponse(
          { error: "busy" },
          { status: 503, headers: { "retry-after": "17" } },
        ),
      now,
    });

    await expect(
      provider.getCurrentPrices({
        marketId: "forever.pvp.horde.us",
        gameItemIds: [2589],
      }),
    ).rejects.toMatchObject<Partial<AuctionPriceProviderError>>({
      status: 503,
      retryAfterSeconds: 17,
    });
  });
});

describe("fallback providers", () => {
  it("uses explicit manual values and marks missing values unavailable", async () => {
    const provider = new ManualAuctionPriceProvider({
      markets: [manualMarket],
      now,
      prices: [
        {
          marketId: manualMarket.id,
          gameItemId: 2589,
          medianUnitPriceCopper: 42,
          observedAt: "2026-10-08T00:00:00.000Z",
        },
      ],
    });

    await expect(
      provider.getCurrentPrices({
        marketId: manualMarket.id,
        gameItemIds: [2589, 2592],
      }),
    ).resolves.toMatchObject([
      { status: "available", medianUnitPriceCopper: 42 },
      { status: "unavailable", reason: "manual-price-missing" },
    ]);
  });

  it("represents a disabled price source explicitly", async () => {
    const provider = new NoPriceProvider({ now });
    await expect(
      provider.getCurrentPrices({
        marketId: "forever.pvp.horde.us",
        gameItemIds: [2589],
      }),
    ).resolves.toMatchObject([
      { provider: "none", status: "unavailable", reason: "provider-disabled" },
    ]);
  });
});

describe("scheduled refresh orchestration", () => {
  it("validates complete provider coverage before writing current prices", async () => {
    const provider = new ManualAuctionPriceProvider({
      markets: [manualMarket],
      now,
      prices: [
        {
          marketId: manualMarket.id,
          gameItemId: 2589,
          minimumBuyoutUnitPriceCopper: 25,
          observedAt: "2026-10-08T00:00:00.000Z",
        },
      ],
    });
    const written: AuctionPriceObservation[][] = [];
    const store: CurrentAuctionPriceStore = {
      async upsertCurrentPrices(observations) {
        written.push([...observations]);
      },
    };

    const report = await refreshAuctionPrices(
      provider,
      store,
      { marketId: manualMarket.id, gameItemIds: [2589, 2592, 2589] },
      { now },
    );

    expect(report).toMatchObject({
      requestedItems: 2,
      availableItems: 1,
      unavailableItems: 1,
    });
    expect(written).toHaveLength(1);
    expect(written[0]).toHaveLength(2);
  });
});
