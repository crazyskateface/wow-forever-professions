import { describe, expect, it } from "vitest";
import {
  recipeListViewFromUrlValue,
  shouldLoadRecipeChanges,
  shouldLoadRecipePrices,
  urlWithRecipeListView,
} from "./request-policy.js";

describe("initial request policy", () => {
  it("defers comparison data until a discovery view is opened", () => {
    expect(shouldLoadRecipeChanges("guide", false)).toBe(false);
    expect(shouldLoadRecipeChanges("recipes", false)).toBe(true);
    expect(shouldLoadRecipeChanges("changes", false)).toBe(true);
    expect(shouldLoadRecipeChanges("recipes", true)).toBe(false);
    expect(shouldLoadRecipeChanges("changes", true)).toBe(false);
  });

  it("does not price the temporary catalog or an unresolved market", () => {
    expect(shouldLoadRecipePrices("loading", false)).toBe(false);
    expect(shouldLoadRecipePrices("ready", true)).toBe(false);
    expect(shouldLoadRecipePrices("ready", false)).toBe(true);
    expect(shouldLoadRecipePrices("fallback", false)).toBe(true);
  });

  it("round-trips directly addressable recipe views", () => {
    expect(recipeListViewFromUrlValue("https://example.test/?view=changes")).toBe("changes");
    expect(recipeListViewFromUrlValue("https://example.test/?view=unsupported")).toBe("guide");
    const recipesUrl = urlWithRecipeListView(
      "https://example.test/?recipe=spell-2162",
      "recipes",
    );
    expect(new URL(recipesUrl).searchParams.get("recipe")).toBe("spell-2162");
    expect(new URL(recipesUrl).searchParams.get("view")).toBe("recipes");
    expect(new URL(urlWithRecipeListView(recipesUrl, "guide")).searchParams.has("view")).toBe(false);
  });
});
