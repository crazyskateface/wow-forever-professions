import { describe, expect, it } from "vitest";
import { getProfessionDefinition, RECIPE_PROFESSIONS } from "./professions.js";

describe("profession import support", () => {
  it("keeps gathering identities separate from available recipe tables", () => {
    expect(getProfessionDefinition("herbalism")).toMatchObject({ skillLineId: 182, sourceName: null, group: "Gathering" });
    expect(getProfessionDefinition("skinning")).toMatchObject({ skillLineId: 393, sourceName: null, group: "Gathering" });
    expect(RECIPE_PROFESSIONS).toHaveLength(10);
    expect(RECIPE_PROFESSIONS.find(({ id }) => id === "mining")?.sourceName).toBe("Mining");
    expect(RECIPE_PROFESSIONS.every(({ sourceName }) => typeof sourceName === "string")).toBe(true);
  });
});
