import type { RecipeChange } from "@forever-professions/contracts";

export type ChangeSortBy = "name" | "skill";
export type SortDirection = "asc" | "desc";
export interface ChangeSort {
  readonly sortBy: ChangeSortBy;
  readonly sortDirection: SortDirection;
}

export function nextChangeSort(current: ChangeSort, sortBy: ChangeSortBy): ChangeSort {
  return { sortBy, sortDirection: current.sortBy === sortBy && current.sortDirection === "asc" ? "desc" : "asc" };
}

const names = new Intl.Collator("en", { sensitivity: "base", numeric: true });

export function sortRecipeChanges(changes: readonly RecipeChange[], { sortBy, sortDirection }: ChangeSort): RecipeChange[] {
  const direction = sortDirection === "asc" ? 1 : -1;
  return [...changes].sort((left, right) => {
    if (sortBy === "skill") {
      const a = (left.target ?? left.base)?.learnSkill;
      const b = (right.target ?? right.base)?.learnSkill;
      // Unknown ranks remain last in either direction; Classic ranks never fill target gaps.
      if (a == null && b != null) return 1;
      if (a != null && b == null) return -1;
      if (a != null && b != null && a !== b) return (a - b) * direction;
    }
    return names.compare(left.name, right.name) * direction ||
      names.compare(left.identity.professionId, right.identity.professionId) ||
      left.identity.spellId - right.identity.spellId;
  });
}
