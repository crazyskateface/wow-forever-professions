export * from "./leveling-cost.js";
export * from "./profession-cap.js";
export * from "./skill-up.js";

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
