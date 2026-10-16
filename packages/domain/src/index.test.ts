import { describe, expect, it } from "vitest";
import {
  FOREVER_BUILD_CONFIG,
  assessDataQuality,
  getRecipeSkillCapStatus,
  getExpectedCraftsForSkillUp,
  getRecipeDifficulty,
  getSkillUpProbability,
} from "./index.js";

const thresholds = { orange: 150, yellow: 170, green: 180, gray: 190 };

describe("profession difficulty", () => {
  it("changes classification at each threshold", () => {
    expect(getRecipeDifficulty(149, thresholds)).toBe("unavailable");
    expect(getRecipeDifficulty(150, thresholds)).toBe("orange");
    expect(getRecipeDifficulty(170, thresholds)).toBe("yellow");
    expect(getRecipeDifficulty(180, thresholds)).toBe("green");
    expect(getRecipeDifficulty(190, thresholds)).toBe("gray");
  });
});

describe("skill-up probability", () => {
  it("interpolates from orange through gray", () => {
    expect(getSkillUpProbability(160, thresholds)).toBe(1);
    expect(getSkillUpProbability(175, thresholds)).toBeCloseTo(0.75);
    expect(getSkillUpProbability(185, thresholds)).toBeCloseTo(0.25);
    expect(getSkillUpProbability(190, thresholds)).toBe(0);
  });

  it("returns infinite expected crafts when a skill-up is impossible", () => {
    expect(getExpectedCraftsForSkillUp(0)).toBe(Number.POSITIVE_INFINITY);
    expect(getExpectedCraftsForSkillUp(0.25)).toBe(4);
  });

  it("continues evaluating raw thresholds above the base profession cap", () => {
    const rawThresholds = { orange: 280, yellow: 300, green: 320, gray: 340 };

    expect(getSkillUpProbability(299, rawThresholds)).toBe(1);
    expect(getSkillUpProbability(320, rawThresholds)).toBe(0.5);
    expect(rawThresholds).toEqual({
      orange: 280,
      yellow: 300,
      green: 320,
      gray: 340,
    });
  });
});

describe("profession base skill cap", () => {
  it("classifies thresholds below, at, and above the configured cap", () => {
    const maxBaseSkill = FOREVER_BUILD_CONFIG.maxBaseSkill;

    expect(
      getRecipeSkillCapStatus(
        { orange: 260, yellow: 270, green: 280, gray: 290 },
        260,
        maxBaseSkill,
      ),
    ).toEqual({
      hasThresholdAboveCap: false,
      requiredSkillAboveCap: false,
    });
    expect(
      getRecipeSkillCapStatus(
        { orange: 270, yellow: 280, green: 290, gray: maxBaseSkill },
        maxBaseSkill,
        maxBaseSkill,
      ),
    ).toEqual({
      hasThresholdAboveCap: false,
      requiredSkillAboveCap: false,
    });
    expect(
      getRecipeSkillCapStatus(
        { orange: 280, yellow: 300, green: 320, gray: 340 },
        315,
        maxBaseSkill,
      ),
    ).toEqual({
      hasThresholdAboveCap: true,
      requiredSkillAboveCap: true,
    });
  });
});

describe("data quality", () => {
  it("does not promote Classic fallback data to authoritative", () => {
    expect(assessDataQuality("classic-fallback", "verified")).toMatchObject({
      level: "fallback",
      authoritative: false,
    });
  });

  it("surfaces rejected data ahead of its source classification", () => {
    expect(assessDataQuality("observed-in-game", "rejected")).toMatchObject({
      level: "rejected",
      authoritative: false,
    });
  });

  it("only treats verified Forever provenance as authoritative", () => {
    expect(assessDataQuality("community-verified", "verified")).toMatchObject({
      level: "verified",
      authoritative: true,
    });
    expect(assessDataQuality("client-data", "unverified")).toMatchObject({
      level: "unverified",
      authoritative: false,
    });
  });
});
