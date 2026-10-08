export type RecipeDifficulty =
  | "unavailable"
  | "orange"
  | "yellow"
  | "green"
  | "gray";

export interface SkillThresholds {
  readonly orange: number;
  readonly yellow: number;
  readonly green: number;
  readonly gray: number;
}

export type ProvenanceSource =
  | "client-data"
  | "observed-in-game"
  | "classic-fallback"
  | "community-verified"
  | "manual-override"
  | "fixture";

export type VerificationStatus = "unverified" | "verified" | "rejected";
export type DataQualityLevel = "verified" | "unverified" | "fallback" | "rejected";

export interface DataQualityAssessment {
  readonly level: DataQualityLevel;
  readonly label: string;
  readonly authoritative: boolean;
  readonly explanation: string;
}

export function assessDataQuality(
  source: ProvenanceSource,
  verificationStatus: VerificationStatus,
): DataQualityAssessment {
  if (verificationStatus === "rejected") {
    return {
      level: "rejected",
      label: "Rejected",
      authoritative: false,
      explanation: "This data failed verification and should not be treated as reliable.",
    };
  }

  if (source === "classic-fallback") {
    return {
      level: "fallback",
      label: "Classic fallback",
      authoritative: false,
      explanation:
        "This value comes from Classic reference data and has not been established as correct for Forever.",
    };
  }

  if (verificationStatus === "verified") {
    return {
      level: "verified",
      label: "Verified",
      authoritative: true,
      explanation: "This data has supporting Forever-specific verification.",
    };
  }

  return {
    level: "unverified",
    label: "Unverified",
    authoritative: false,
    explanation:
      "This data has not yet been independently verified for World of Warcraft: Forever.",
  };
}

function assertThresholds(thresholds: SkillThresholds): void {
  const ordered = [
    thresholds.orange,
    thresholds.yellow,
    thresholds.green,
    thresholds.gray,
  ];

  if (ordered.some((value) => !Number.isFinite(value))) {
    throw new Error("Skill thresholds must be finite numbers.");
  }

  if (ordered.some((value, index) => index > 0 && value < ordered[index - 1]!)) {
    throw new Error("Skill thresholds must be ordered orange <= yellow <= green <= gray.");
  }
}

export function getRecipeDifficulty(
  skill: number,
  thresholds: SkillThresholds,
): RecipeDifficulty {
  assertThresholds(thresholds);

  if (skill < thresholds.orange) return "unavailable";
  if (skill < thresholds.yellow) return "orange";
  if (skill < thresholds.green) return "yellow";
  if (skill < thresholds.gray) return "green";
  return "gray";
}

export function getSkillUpProbability(
  skill: number,
  thresholds: SkillThresholds,
): number {
  const difficulty = getRecipeDifficulty(skill, thresholds);

  if (difficulty === "unavailable" || difficulty === "gray") return 0;
  if (difficulty === "orange") return 1;

  if (difficulty === "yellow") {
    const width = thresholds.green - thresholds.yellow;
    if (width === 0) return 0.5;
    return 1 - ((skill - thresholds.yellow) / width) * 0.5;
  }

  const width = thresholds.gray - thresholds.green;
  if (width === 0) return 0;
  return 0.5 * (1 - (skill - thresholds.green) / width);
}

export function getExpectedCraftsForSkillUp(probability: number): number {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError("Probability must be between 0 and 1.");
  }

  return probability === 0 ? Number.POSITIVE_INFINITY : 1 / probability;
}

export function getExpectedReagentQuantity(
  reagentQuantityPerCraft: number,
  probability: number,
): number {
  if (!Number.isFinite(reagentQuantityPerCraft) || reagentQuantityPerCraft < 0) {
    throw new RangeError("Reagent quantity must be a non-negative finite number.");
  }

  return reagentQuantityPerCraft * getExpectedCraftsForSkillUp(probability);
}
