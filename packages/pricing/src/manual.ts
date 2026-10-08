import {
  auctionMarketSchema,
  auctionPriceObservationSchema,
  auctionPriceRequestSchema,
  type AuctionMarket,
  type AuctionPriceObservation,
  type AuctionPriceRequest,
} from "@forever-professions/contracts";
import type { AuctionPriceProvider } from "./types.js";

export interface ManualAuctionPriceInput {
  readonly marketId: string;
  readonly gameItemId: number;
  readonly observedAt: string;
  readonly medianUnitPriceCopper?: number;
  readonly minimumBuyoutUnitPriceCopper?: number;
  readonly quantity?: number;
  readonly estimatedSalesPerDay?: number;
}

export interface ManualAuctionPriceProviderOptions {
  readonly markets: readonly AuctionMarket[];
  readonly prices?: readonly ManualAuctionPriceInput[];
  readonly now?: () => Date;
}

function priceKey(marketId: string, gameItemId: number): string {
  return `${marketId}:${gameItemId}`;
}

export class ManualAuctionPriceProvider implements AuctionPriceProvider {
  readonly id = "manual" as const;
  private readonly markets: readonly AuctionMarket[];
  private readonly prices: Map<string, ManualAuctionPriceInput>;
  private readonly now: () => Date;

  constructor(options: ManualAuctionPriceProviderOptions) {
    this.markets = options.markets.map((market) =>
      auctionMarketSchema.parse({ ...market, provider: this.id }),
    );
    this.now = options.now ?? (() => new Date());
    this.prices = new Map(
      (options.prices ?? []).map((price) => [
        priceKey(price.marketId, price.gameItemId),
        price,
      ]),
    );
  }

  async listMarkets(): Promise<readonly AuctionMarket[]> {
    return this.markets;
  }

  async getCurrentPrices(
    input: AuctionPriceRequest,
  ): Promise<readonly AuctionPriceObservation[]> {
    const request = auctionPriceRequestSchema.parse(input);
    const fetchedAt = this.now().toISOString();
    return [...new Set(request.gameItemIds)].map((gameItemId) => {
      const price = this.prices.get(priceKey(request.marketId, gameItemId));
      if (price === undefined) {
        return auctionPriceObservationSchema.parse({
          provider: this.id,
          marketId: request.marketId,
          gameItemId,
          fetchedAt,
          status: "unavailable",
          reason: "manual-price-missing",
        });
      }
      return auctionPriceObservationSchema.parse({
        provider: this.id,
        status: "available",
        fetchedAt,
        ...price,
      });
    });
  }
}
