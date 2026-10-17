import {
  assertSkillThresholds,
  getSkillUpProbability,
  type SkillThresholds,
} from "@forever-professions/domain";

export type SkillChartTickKind = keyof SkillThresholds | "cap";

export interface SkillChartPoint {
  readonly probability: number;
  readonly skill: number;
}

export interface SkillChartTick {
  readonly kind: SkillChartTickKind;
  readonly label: string;
  readonly skill: number;
}

export interface SkillChartData {
  readonly endSkill: number;
  readonly points: readonly SkillChartPoint[];
  readonly startSkill: number;
  readonly ticks: readonly SkillChartTick[];
}

const THRESHOLD_KINDS = [
  "orange",
  "yellow",
  "green",
  "gray",
] as const satisfies readonly (keyof SkillThresholds)[];

export function buildSkillChartData(
  thresholds: SkillThresholds,
  maxBaseSkill: number,
): SkillChartData {
  assertSkillThresholds(thresholds);
  if (!Number.isInteger(maxBaseSkill) || maxBaseSkill < 0) {
    throw new RangeError("maxBaseSkill must be a non-negative integer.");
  }

  const startSkill = Math.min(thresholds.orange, maxBaseSkill);
  const endSkill = Math.min(thresholds.gray, maxBaseSkill);
  const points = Array.from(
    { length: endSkill - startSkill + 1 },
    (_, index) => {
      const skill = startSkill + index;
      return {
        probability: getSkillUpProbability(skill, thresholds),
        skill,
      };
    },
  );
  const ticksBySkill = new Map<number, SkillChartTick>();
  for (const kind of THRESHOLD_KINDS) {
    const skill = thresholds[kind];
    if (skill >= startSkill && skill <= endSkill) {
      ticksBySkill.set(skill, { kind, label: String(skill), skill });
    }
  }
  if (endSkill === maxBaseSkill) {
    ticksBySkill.set(maxBaseSkill, {
      kind: "cap",
      label: `${maxBaseSkill} · Max`,
      skill: maxBaseSkill,
    });
  }

  return {
    endSkill,
    points,
    startSkill,
    ticks: [...ticksBySkill.values()].sort((left, right) => left.skill - right.skill),
  };
}
