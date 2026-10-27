import { describe, expect, it } from "vitest";
import {
  PRICE_STALE_AFTER_MILLISECONDS,
  getPriceFreshness,
  priceFreshnessLabel,
} from "./price-freshness.js";

describe("price freshness", () => {
  const observedAt = "2026-10-20T12:00:00.000Z";
  const observed = Date.parse(observedAt);

  it("keeps the exact two-hour boundary fresh", () => {
    expect(getPriceFreshness(observedAt, observed + PRICE_STALE_AFTER_MILLISECONDS)).toBe("fresh");
  });

  it("marks observations beyond two hours stale", () => {
    expect(getPriceFreshness(observedAt, observed + PRICE_STALE_AFTER_MILLISECONDS + 1)).toBe("stale");
    expect(priceFreshnessLabel("stale")).toContain("older than 2 hours");
  });

  it("keeps missing and invalid timestamps explicit", () => {
    expect(getPriceFreshness(undefined, observed)).toBe("unknown");
    expect(getPriceFreshness("not-a-date", observed)).toBe("unknown");
  });
});
