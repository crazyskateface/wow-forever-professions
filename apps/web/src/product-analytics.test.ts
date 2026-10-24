import { describe, expect, it, vi } from "vitest";
import { recordProductEvent } from "./product-analytics.js";

describe("anonymous product analytics", () => {
  it("sends only the strict event body without credentials or referrer", async () => {
    const send = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => new Response(undefined, { status: 204 }));
    await recordProductEvent({
      name: "checklist-progress",
      buildId: "1.60.1.69977",
      preset: "practical",
      completedSegments: 2,
      totalSegments: 8,
    }, send);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith("/api/product-events", expect.objectContaining({
      credentials: "omit",
      keepalive: true,
      referrerPolicy: "no-referrer",
    }));
    const init = send.mock.calls[0]![1]!;
    expect(JSON.parse(init.body as string)).toEqual({
      name: "checklist-progress",
      buildId: "1.60.1.69977",
      preset: "practical",
      completedSegments: 2,
      totalSegments: 8,
    });
  });

  it("does not turn analytics failure into a product failure", async () => {
    const send = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => { throw new Error("offline"); });
    await expect(recordProductEvent({
      name: "missing-data-encountered",
      buildId: "1.60.1.69977",
      kind: "acquisition",
    }, send)).resolves.toBeUndefined();
  });
});
