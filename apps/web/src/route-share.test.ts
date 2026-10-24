import { describe, expect, it } from "vitest";
import { sharedRouteStateFromUrl, sharedRouteUrl } from "./route-share.js";

describe("shareable guide state", () => {
  it("round-trips the selected route style", () => {
    const url = sharedRouteUrl("https://example.test/?recipe=spell-2162&owned=99#private", {
      preset: "trainer-friendly",
    });
    expect(sharedRouteStateFromUrl(url)).toEqual({
      preset: "trainer-friendly",
    });
  });

  it("removes unrelated, local, and recipe state from generated links", () => {
    const url = new URL(sharedRouteUrl(
      "https://example.test/path?recipe=spell-2162&market=private&owned=99#route-step",
      { preset: "practical" },
    ));
    expect(url.pathname).toBe("/");
    expect([...url.searchParams.keys()].sort()).toEqual(["preset", "route"]);
    expect(url.hash).toBe("");
  });

  it("rejects missing, obsolete, and unsupported state", () => {
    expect(sharedRouteStateFromUrl("https://example.test/?preset=practical")).toBeUndefined();
    expect(sharedRouteStateFromUrl("https://example.test/?route=1&start=1&target=300&preset=practical")).toBeUndefined();
    expect(sharedRouteStateFromUrl("https://example.test/?route=2&preset=fastest")).toBeUndefined();
  });
});
