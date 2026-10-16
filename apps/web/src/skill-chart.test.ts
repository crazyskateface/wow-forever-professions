import { describe, expect, it } from "vitest";
import { FOREVER_BUILD_CONFIG } from "@forever-professions/domain";
import { buildSkillChartData } from "./skill-chart.js";

describe("skill chart presentation data", () => {
  const maxBaseSkill = FOREVER_BUILD_CONFIG.maxBaseSkill;

  it("ends at a gray threshold below the profession cap", () => {
    const chart = buildSkillChartData(
      { orange: 260, yellow: 270, green: 280, gray: 290 },
      maxBaseSkill,
    );

    expect(chart.endSkill).toBe(290);
    expect(chart.points.at(-1)?.skill).toBe(290);
  });

  it("ends at and labels a gray threshold exactly on the profession cap", () => {
    const chart = buildSkillChartData(
      { orange: 270, yellow: 280, green: 290, gray: maxBaseSkill },
      maxBaseSkill,
    );

    expect(chart.endSkill).toBe(maxBaseSkill);
    expect(chart.points.at(-1)?.skill).toBe(maxBaseSkill);
    expect(chart.ticks.at(-1)).toEqual({
      kind: "cap",
      label: `${maxBaseSkill} · Max`,
      skill: maxBaseSkill,
    });
  });

  it("caps visible points without changing above-cap source thresholds", () => {
    const rawThresholds = { orange: 280, yellow: 300, green: 320, gray: 340 };
    const chart = buildSkillChartData(rawThresholds, maxBaseSkill);

    expect(chart.endSkill).toBe(maxBaseSkill);
    expect(Math.max(...chart.points.map(({ skill }) => skill))).toBe(maxBaseSkill);
    expect(rawThresholds).toEqual({
      orange: 280,
      yellow: 300,
      green: 320,
      gray: 340,
    });
  });
});
