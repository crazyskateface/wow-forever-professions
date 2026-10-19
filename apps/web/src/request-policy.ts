export type CatalogState = "loading" | "ready" | "fixture" | "fallback";
export type RecipeListView = "guide" | "recipes" | "changes";

export function shouldLoadRecipeChanges(
  view: RecipeListView,
  alreadyLoaded: boolean,
): boolean {
  return view === "changes" && !alreadyLoaded;
}

export function shouldLoadRecipePrices(
  catalogState: CatalogState,
  marketsLoading: boolean,
): boolean {
  return catalogState !== "loading" && !marketsLoading;
}
