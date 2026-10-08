import type {
  AuctionMarket,
  AuctionPriceObservation,
  AuctionPriceRequest,
} from "@forever-professions/contracts";
import type { CurrentAuctionPriceReader } from "@forever-professions/pricing";

const market: AuctionMarket = {
  id: "forever.pvp.horde.us",
  provider: "manual",
  game: "forever",
  ruleset: "pvp",
  faction: "horde",
  region: "us",
  label: "Local pricing fixture",
};

const fetchedAt = "2026-10-08T06:00:00.000Z";
const observations: readonly AuctionPriceObservation[] = [
  [4234, 425],
  [2321, 95],
  [4304, 610],
  [4291, 170],
].map(([gameItemId, medianUnitPriceCopper]) => ({
  provider: "manual",
  marketId: market.id,
  gameItemId: gameItemId!,
  status: "available",
  observedAt: fetchedAt,
  fetchedAt,
  medianUnitPriceCopper: medianUnitPriceCopper!,
  attribution: { text: "Local pricing fixture", url: "https://example.invalid/pricing" },
}));

export const localPricingReader: CurrentAuctionPriceReader = {
  async listMarkets() {
    return [market];
  },
  async getCurrentPrices(request: AuctionPriceRequest) {
    const requested = new Set(request.gameItemIds);
    return observations.filter(
      (observation) =>
        observation.marketId === request.marketId && requested.has(observation.gameItemId),
    );
  },
  async listTrackedGameItemIds() {
    return observations.map(({ gameItemId }) => gameItemId);
  },
};
