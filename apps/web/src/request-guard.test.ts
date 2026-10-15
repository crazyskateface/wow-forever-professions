import { describe, expect, it } from "vitest";
import { createRequestGuard } from "./request-guard.js";

describe("request guard", () => {
  it("rejects results from invalidated and superseded requests", () => {
    const guard = createRequestGuard();
    const firstRequest = guard.begin();

    expect(guard.isCurrent(firstRequest)).toBe(true);

    guard.invalidate();
    expect(guard.isCurrent(firstRequest)).toBe(false);

    const secondRequest = guard.begin();
    const thirdRequest = guard.begin();
    expect(guard.isCurrent(secondRequest)).toBe(false);
    expect(guard.isCurrent(thirdRequest)).toBe(true);
  });
});
