import { describe, expect, it } from "vitest";
import {
  assessDataQuality,
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
