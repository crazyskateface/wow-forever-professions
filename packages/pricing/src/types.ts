import type {
  AuctionMarket,
  AuctionPriceObservation,
  AuctionPriceProviderId,
  AuctionPriceRequest,
} from "@forever-professions/contracts";

export interface AuctionPriceProvider {
  readonly id: AuctionPriceProviderId;
  listMarkets(signal?: AbortSignal): Promise<readonly AuctionMarket[]>;
  getCurrentPrices(
    request: AuctionPriceRequest,
    signal?: AbortSignal,
  ): Promise<readonly AuctionPriceObservation[]>;
}

export interface CurrentAuctionPriceStore {
  upsertCurrentPrices(
    observations: readonly AuctionPriceObservation[],
  ): Promise<void>;
}

export interface AuctionMarketStore {
  upsertMarkets(markets: readonly AuctionMarket[], refreshedAt?: string): Promise<void>;
}

export interface CurrentAuctionPriceReader {
  listMarkets(): Promise<readonly AuctionMarket[]>;
  getCurrentPrices(request: AuctionPriceRequest): Promise<readonly AuctionPriceObservation[]>;
  listTrackedGameItemIds(): Promise<readonly number[]>;
}

export interface AuctionPricingRepository
  extends AuctionMarketStore,
    CurrentAuctionPriceStore,
    CurrentAuctionPriceReader {}

export interface AuctionPriceRefreshReport {
  readonly provider: AuctionPriceProviderId;
  readonly marketId: string;
  readonly requestedItems: number;
  readonly availableItems: number;
  readonly unavailableItems: number;
  readonly startedAt: string;
  readonly completedAt: string;
}
