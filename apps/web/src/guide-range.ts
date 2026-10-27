export interface GuideRange {
  readonly startSkill: number;
  readonly targetSkill: number;
}

export const GUIDE_START_SKILL = 1;

export function getFullGuideRange(maximumSkill: number): GuideRange {
  if (!Number.isInteger(maximumSkill) || maximumSkill < GUIDE_START_SKILL) {
    throw new RangeError("maximumSkill must be a positive integer.");
  }
  return {
    startSkill: GUIDE_START_SKILL,
    targetSkill: maximumSkill,
  };
}
