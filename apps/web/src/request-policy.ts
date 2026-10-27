export type CatalogState = "loading" | "ready" | "fixture" | "fallback";
export type RecipeListView = "guide" | "recipes" | "changes";

export function recipeListViewFromUrlValue(url: string): RecipeListView {
  const view = new URL(url).searchParams.get("view");
  return view === "recipes" || view === "changes" ? view : "guide";
}

export function urlWithRecipeListView(url: string, view: RecipeListView): string {
  const nextUrl = new URL(url);
  if (view === "guide") nextUrl.searchParams.delete("view");
  else nextUrl.searchParams.set("view", view);
  return nextUrl.toString();
}

export function shouldLoadRecipeChanges(
  view: RecipeListView,
  alreadyLoaded: boolean,
): boolean {
  return (view === "recipes" || view === "changes") && !alreadyLoaded;
}

export function shouldLoadRecipePrices(
  catalogState: CatalogState,
  marketsLoading: boolean,
): boolean {
  return catalogState !== "loading" && !marketsLoading;
}
