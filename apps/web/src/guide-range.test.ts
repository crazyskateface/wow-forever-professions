import { describe, expect, it } from "vitest";
import { FOREVER_BUILD_CONFIG } from "@forever-professions/domain";
import { getFullGuideRange } from "./guide-range.js";

describe("full leveling-guide range", () => {
  it("always covers the complete base profession progression", () => {
    expect(getFullGuideRange(FOREVER_BUILD_CONFIG.maxBaseSkill)).toEqual({
      startSkill: 1,
      targetSkill: 300,
    });
  });

  it("rejects invalid profession caps", () => {
    expect(() => getFullGuideRange(0)).toThrow(RangeError);
    expect(() => getFullGuideRange(300.5)).toThrow(RangeError);
  });
});
