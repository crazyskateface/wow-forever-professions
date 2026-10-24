export const PRICE_STALE_AFTER_MILLISECONDS = 2 * 60 * 60 * 1_000;

export type PriceFreshness = "fresh" | "stale" | "unknown";

export function getPriceFreshness(
  observedAt: string | undefined,
  nowMilliseconds = Date.now(),
): PriceFreshness {
  if (observedAt === undefined) return "unknown";
  const observedMilliseconds = Date.parse(observedAt);
  if (!Number.isFinite(observedMilliseconds)) return "unknown";
  return nowMilliseconds - observedMilliseconds > PRICE_STALE_AFTER_MILLISECONDS
    ? "stale"
    : "fresh";
}

export function priceFreshnessLabel(freshness: PriceFreshness): string {
  if (freshness === "fresh") return "Fresh (within 2 hours)";
  if (freshness === "stale") return "Stale (older than 2 hours)";
  return "Freshness unknown";
}
