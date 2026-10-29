import { describe, expect, it } from "vitest";
import type { RecipeChange } from "@forever-professions/contracts";
import { nextChangeSort, sortRecipeChanges, type ChangeSort } from "./change-sort.js";

function change(name: string, spellId: number, learnSkill?: number | null, removed = false): RecipeChange {
  const snapshot = { learnSkill };
  return { name, identity: { professionId: "tailoring", spellId }, ...(removed ? { base: snapshot } : { target: snapshot }) } as RecipeChange;
}
const order = (changes: readonly RecipeChange[], sort: ChangeSort) => sortRecipeChanges(changes, sort).map(c => c.identity.spellId);

describe("Forever Changes sorting", () => {
  const changes = [change("Zebra", 1, 5), change("Alpha", 2, 225), change("Beta", 3, 75), change("Unknown", 4, null), change("Absent", 5)];

  it("sorts names ascending and descending without mutating the loaded list", () => {
    expect(order(changes, { sortBy: "name", sortDirection: "asc" })).toEqual([5, 2, 3, 4, 1]);
    expect(order(changes, { sortBy: "name", sortDirection: "desc" })).toEqual([1, 4, 3, 2, 5]);
    expect(changes.map(c => c.identity.spellId)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps null and missing learning requirements last in both skill directions", () => {
    expect(order(changes, { sortBy: "skill", sortDirection: "asc" })).toEqual([1, 3, 2, 5, 4]);
    expect(order(changes, { sortBy: "skill", sortDirection: "desc" })).toEqual([2, 3, 1, 4, 5]);
  });

  it("uses removed base ranks but never fills a target gap from Classic or borrowed ranks", () => {
    const unknown = { ...change("Unknown", 2, null), base: { learnSkill: 1 }, target: { learnSkill: null, borrowedLearnSkill: 1 } } as RecipeChange;
    expect(order([unknown, change("Removed", 3, 50, true), change("Known", 1, 0)], { sortBy: "skill", sortDirection: "asc" })).toEqual([1, 3, 2]);
  });

  it("breaks equal names and ranks deterministically by profession and spell identity", () => {
    const ties = [change("Same", 5, 25), change("Same", 2, 25), { ...change("Same", 8, 25), identity: { professionId: "alchemy", spellId: 8 } }];
    expect(order(ties, { sortBy: "skill", sortDirection: "desc" })).toEqual([8, 2, 5]);
    expect(order([], { sortBy: "name", sortDirection: "asc" })).toEqual([]);
  });

  it("reverses repeated choices and starts a different sort ascending", () => {
    const descending = nextChangeSort({ sortBy: "name", sortDirection: "asc" }, "name");
    expect(descending).toEqual({ sortBy: "name", sortDirection: "desc" });
    expect(nextChangeSort(descending, "name")).toEqual({ sortBy: "name", sortDirection: "asc" });
    const skill = nextChangeSort(descending, "skill");
    expect(skill).toEqual({ sortBy: "skill", sortDirection: "asc" });
    expect(nextChangeSort(skill, "skill")).toEqual({ sortBy: "skill", sortDirection: "desc" });
  });
});
