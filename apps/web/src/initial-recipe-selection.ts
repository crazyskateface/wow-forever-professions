import type { RecipeListView } from "./request-policy.js";

/** Resolve the asynchronous guide default once, without overriding explicit selections. */
export function createInitialRecipeSelection(
  recipes: readonly { readonly id: string }[],
  requestedRecipeId: string | undefined,
  view: RecipeListView,
) {
  const requested = recipes.find(recipe => recipe.id === requestedRecipeId);
  let pendingGuide = view === "guide" && requested === undefined;
  return {
    recipeId: requested?.id ?? recipes[0]!.id,
    get pendingGuide() { return pendingGuide; },
    cancelGuide() { pendingGuide = false; },
    resolveGuide(firstRecipeId: string | undefined): string | undefined {
      if (!pendingGuide || firstRecipeId === undefined || !recipes.some(recipe => recipe.id === firstRecipeId)) return undefined;
      pendingGuide = false;
      return firstRecipeId;
    },
  };
}
