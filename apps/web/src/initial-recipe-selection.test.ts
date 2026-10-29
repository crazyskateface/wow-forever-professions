import { describe, expect, it } from "vitest";
import { createInitialRecipeSelection } from "./initial-recipe-selection.js";

const recipes = [{ id: "alphabetical-first" }, { id: "guide-first" }, { id: "other" }];

describe("profession landing recipe selection", () => {
  it("selects the first guide recipe when a landing without a recipe link finishes loading", () => {
    const selection = createInitialRecipeSelection(recipes, undefined, "guide");
    expect(selection.pendingGuide).toBe(true);
    expect(selection.resolveGuide("guide-first")).toBe("guide-first");
    expect(selection.pendingGuide).toBe(false);
    expect(selection.resolveGuide("other")).toBeUndefined();
  });

  it.each(["alphabetical-first", "guide-first", "other"])("preserves the explicit recipe link %s", requested => {
    const selection = createInitialRecipeSelection(recipes, requested, "guide");
    expect(selection.recipeId).toBe(requested);
    expect(selection.resolveGuide("guide-first")).toBeUndefined();
  });

  it("does not let a delayed guide response replace a manual selection or history navigation", () => {
    const selection = createInitialRecipeSelection(recipes, undefined, "guide");
    selection.cancelGuide();
    expect(selection.resolveGuide("guide-first")).toBeUndefined();
  });

  it("waits for a usable guide without inventing a recipe for an empty or blocked route", () => {
    const selection = createInitialRecipeSelection(recipes, undefined, "guide");
    expect(selection.resolveGuide(undefined)).toBeUndefined();
    expect(selection.resolveGuide("missing-from-catalog")).toBeUndefined();
    expect(selection.pendingGuide).toBe(true);
    expect(selection.resolveGuide("guide-first")).toBe("guide-first");
  });

  it("treats an invalid deep link as an unselected landing", () => {
    const selection = createInitialRecipeSelection(recipes, "missing", "guide");
    expect(selection.resolveGuide("guide-first")).toBe("guide-first");
  });

  it.each(["recipes", "changes"] as const)("preserves a direct %s discovery view", view => {
    const selection = createInitialRecipeSelection(recipes, undefined, view);
    expect(selection.resolveGuide("guide-first")).toBeUndefined();
  });
});
