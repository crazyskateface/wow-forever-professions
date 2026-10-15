import { describe, expect, it } from "vitest";
import { normalizeProfessionId } from "./ForeverChanges.js";

describe("Forever Changes profession filters", () => {
  const professions = [["leatherworking", "Leatherworking"]] as const;

  it("keeps empty and available profession filters", () => {
    expect(normalizeProfessionId("", professions)).toBe("");
    expect(normalizeProfessionId("leatherworking", professions)).toBe("leatherworking");
  });

  it("normalizes unavailable saved profession filters to all professions", () => {
    expect(normalizeProfessionId("alchemy", professions)).toBe("");
    expect(normalizeProfessionId("leatherworking", [])).toBe("");
  });
});
