import {
  assertSkillThresholds,
  type SkillThresholds,
} from "./skill-up.js";

export interface ProfessionBuildConfig {
  readonly maxBaseSkill: number;
}

export const FOREVER_BUILD_CONFIG = {
  maxBaseSkill: 300,
} as const satisfies ProfessionBuildConfig;

export interface RecipeSkillCapStatus {
  readonly hasThresholdAboveCap: boolean;
  readonly requiredSkillAboveCap: boolean;
}

function assertMaxBaseSkill(maxBaseSkill: number): void {
  if (!Number.isInteger(maxBaseSkill) || maxBaseSkill < 0) {
    throw new RangeError("maxBaseSkill must be a non-negative integer.");
  }
}

export function getRecipeSkillCapStatus(
  thresholds: SkillThresholds,
  learnSkill: number | null,
  maxBaseSkill: number,
): RecipeSkillCapStatus {
  assertSkillThresholds(thresholds);
  assertMaxBaseSkill(maxBaseSkill);

  return {
    hasThresholdAboveCap: Object.values(thresholds).some(
      (threshold) => threshold > maxBaseSkill,
    ),
    requiredSkillAboveCap:
      learnSkill !== null && learnSkill > maxBaseSkill,
  };
}

export function assertTargetSkillWithinBaseCap(
  targetSkill: number,
  maxBaseSkill: number,
): void {
  assertMaxBaseSkill(maxBaseSkill);
  if (targetSkill > maxBaseSkill) {
    throw new RangeError(
      `targetSkill cannot exceed the configured base profession cap of ${maxBaseSkill}.`,
    );
  }
}
