import { describe, expect, it } from "vitest";
import {
  shouldLoadRecipeChanges,
  shouldLoadRecipePrices,
} from "./request-policy.js";

describe("initial request policy", () => {
  it("defers comparison data until the changes view is opened", () => {
    expect(shouldLoadRecipeChanges("guide", false)).toBe(false);
    expect(shouldLoadRecipeChanges("recipes", false)).toBe(false);
    expect(shouldLoadRecipeChanges("changes", false)).toBe(true);
    expect(shouldLoadRecipeChanges("changes", true)).toBe(false);
  });

  it("does not price the temporary catalog or an unresolved market", () => {
    expect(shouldLoadRecipePrices("loading", false)).toBe(false);
    expect(shouldLoadRecipePrices("ready", true)).toBe(false);
    expect(shouldLoadRecipePrices("ready", false)).toBe(true);
    expect(shouldLoadRecipePrices("fallback", false)).toBe(true);
  });
});
