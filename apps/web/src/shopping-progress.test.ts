import { describe, expect, it } from "vitest";
import {
  readShoppingProgress,
  remainingShoppingQuantity,
  writeShoppingProgress,
} from "./shopping-progress.js";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("shopping progress", () => {
  it("restores owned quantities and checks only for the matching route", () => {
    const storage = memoryStorage();
    expect(writeShoppingProgress({
      fingerprint: "route-a",
      ownedQuantities: { leather: 12.5, thread: 0 },
      checkedItemIds: ["route:leather", "route:leather"],
    }, storage)).toBe(true);
    expect(readShoppingProgress("route-a", storage)).toEqual({
      fingerprint: "route-a",
      ownedQuantities: { leather: 12.5 },
      checkedItemIds: ["route:leather"],
    });
    expect(readShoppingProgress("route-b", storage)).toEqual({
      fingerprint: "route-b",
      ownedQuantities: {},
      checkedItemIds: [],
    });
  });

  it("sanitizes invalid stored progress", () => {
    const storage = memoryStorage();
    writeShoppingProgress({
      fingerprint: "route-a",
      ownedQuantities: { leather: -2, thread: Number.NaN },
      checkedItemIds: ["route:leather"],
    }, storage);
    expect(readShoppingProgress("route-a", storage).ownedQuantities).toEqual({});
  });

  it("calculates remaining quantities without changing the expected total", () => {
    expect(remainingShoppingQuantity(12.5, 2)).toBe(10.5);
    expect(remainingShoppingQuantity(12.5, 20)).toBe(0);
    expect(remainingShoppingQuantity(12.5, -4)).toBe(12.5);
  });

  it("fails closed when storage is blocked", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readShoppingProgress("route-a", storage).ownedQuantities).toEqual({});
    expect(writeShoppingProgress({
      fingerprint: "route-a",
      ownedQuantities: { leather: 1 },
      checkedItemIds: [],
    }, storage)).toBe(false);
  });
});
