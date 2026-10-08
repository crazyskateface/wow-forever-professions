import {
  auctionPriceObservationSchema,
  auctionPriceRequestSchema,
  type AuctionPriceRequest,
} from "@forever-professions/contracts";
import type {
  AuctionPriceProvider,
  AuctionPriceRefreshReport,
  CurrentAuctionPriceStore,
} from "./types.js";

export interface RefreshAuctionPricesOptions {
  readonly now?: () => Date;
  readonly signal?: AbortSignal;
}

export async function refreshAuctionPrices(
  provider: AuctionPriceProvider,
  store: CurrentAuctionPriceStore,
  input: AuctionPriceRequest,
  options: RefreshAuctionPricesOptions = {},
): Promise<AuctionPriceRefreshReport> {
  const request = auctionPriceRequestSchema.parse(input);
  const requestedItemIds = [...new Set(request.gameItemIds)];
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const observations = (
    await provider.getCurrentPrices(request, options.signal)
  ).map((observation) => auctionPriceObservationSchema.parse(observation));

  const seen = new Set<number>();
  for (const observation of observations) {
    if (observation.provider !== provider.id) {
      throw new Error(
        `Provider ${provider.id} returned an observation owned by ${observation.provider}.`,
      );
    }
    if (observation.marketId !== request.marketId) {
      throw new Error(
        `Provider ${provider.id} returned market ${observation.marketId} for ${request.marketId}.`,
      );
    }
    if (seen.has(observation.gameItemId)) {
      throw new Error(
        `Provider ${provider.id} returned duplicate item ${observation.gameItemId}.`,
      );
    }
    seen.add(observation.gameItemId);
  }

  const missing = requestedItemIds.filter((itemId) => !seen.has(itemId));
  const unexpected = [...seen].filter(
    (itemId) => !requestedItemIds.includes(itemId),
  );
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Provider ${provider.id} returned incomplete coverage (missing: ${missing.join(",") || "none"}; unexpected: ${unexpected.join(",") || "none"}).`,
    );
  }

  await store.upsertCurrentPrices(observations);

  return {
    provider: provider.id,
    marketId: request.marketId,
    requestedItems: requestedItemIds.length,
    availableItems: observations.filter(({ status }) => status === "available")
      .length,
    unavailableItems: observations.filter(
      ({ status }) => status === "unavailable",
    ).length,
    startedAt,
    completedAt: now().toISOString(),
  };
}
