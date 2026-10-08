import {
  auctionMarketSchema,
  auctionPriceObservationSchema,
  auctionPriceRequestSchema,
  type AuctionMarket,
  type AuctionPriceObservation,
  type AuctionPriceRequest,
} from "@forever-professions/contracts";
import type { AuctionPriceProvider } from "./types.js";

export interface NoPriceProviderOptions {
  readonly markets?: readonly AuctionMarket[];
  readonly now?: () => Date;
}

export class NoPriceProvider implements AuctionPriceProvider {
  readonly id = "none" as const;
  private readonly markets: readonly AuctionMarket[];
  private readonly now: () => Date;

  constructor(options: NoPriceProviderOptions = {}) {
    this.markets = (options.markets ?? []).map((market) =>
      auctionMarketSchema.parse({ ...market, provider: this.id }),
    );
    this.now = options.now ?? (() => new Date());
  }

  async listMarkets(): Promise<readonly AuctionMarket[]> {
    return this.markets;
  }

  async getCurrentPrices(
    input: AuctionPriceRequest,
  ): Promise<readonly AuctionPriceObservation[]> {
    const request = auctionPriceRequestSchema.parse(input);
    const fetchedAt = this.now().toISOString();
    return [...new Set(request.gameItemIds)].map((gameItemId) =>
      auctionPriceObservationSchema.parse({
        provider: this.id,
        marketId: request.marketId,
        gameItemId,
        fetchedAt,
        status: "unavailable",
        reason: "provider-disabled",
      }),
    );
  }
}
