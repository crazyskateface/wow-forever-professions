import type {
  RouteConfidencePolicy,
  RouteObjective,
  RouteSegment,
} from "@forever-professions/contracts";

interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface RouteProgressFingerprintInput {
  readonly build: string;
  readonly professionId: string;
  readonly startSkill: number;
  readonly targetSkill: number;
  readonly objective: RouteObjective;
  readonly confidencePolicy: RouteConfidencePolicy;
  readonly marketId: string;
  readonly faction: string;
  readonly trainerOnly: boolean;
  readonly knownRecipeIds: readonly string[];
  readonly segments: readonly Pick<
    RouteSegment,
    "recipeId" | "startSkill" | "endSkill"
  >[];
}

export interface RouteProgressState {
  readonly fingerprint: string;
  readonly completedSegmentKeys: readonly string[];
}

interface StoredRouteProgress {
  readonly version: 1;
  readonly fingerprint: string;
  readonly completedSegmentKeys: readonly string[];
}

const STORAGE_PREFIX = "forever-professions.route-progress.v1";

function routeHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function storageKey(fingerprint: string): string {
  return `${STORAGE_PREFIX}.${fingerprint}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function routeSegmentKey(
  segment: Pick<RouteSegment, "recipeId" | "startSkill" | "endSkill">,
): string {
  return `${segment.startSkill}:${segment.endSkill}:${segment.recipeId}`;
}

export function createRouteProgressFingerprint(
  input: RouteProgressFingerprintInput,
): string {
  const canonical = JSON.stringify({
    build: input.build,
    professionId: input.professionId,
    range: [input.startSkill, input.targetSkill],
    objective: input.objective,
    confidencePolicy: input.confidencePolicy,
    marketId: input.marketId,
    constraints: {
      faction: input.faction,
      trainerOnly: input.trainerOnly,
      knownRecipeIds: [...input.knownRecipeIds].sort(),
    },
    segments: input.segments.map((segment) => [
      segment.startSkill,
      segment.endSkill,
      segment.recipeId,
    ]),
  });
  return routeHash(canonical);
}

export function readRouteProgress(
  fingerprint: string,
  storage?: BrowserStorage,
): RouteProgressState {
  try {
    const resolvedStorage = storage ?? (
      typeof window === "undefined" ? undefined : window.localStorage
    );
    if (resolvedStorage === undefined) {
      return { fingerprint, completedSegmentKeys: [] };
    }
    const stored = resolvedStorage.getItem(storageKey(fingerprint));
    if (stored === null) return { fingerprint, completedSegmentKeys: [] };
    const parsed: unknown = JSON.parse(stored);
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      parsed.fingerprint !== fingerprint ||
      !Array.isArray(parsed.completedSegmentKeys)
    ) {
      return { fingerprint, completedSegmentKeys: [] };
    }
    const completedSegmentKeys = [
      ...new Set(
        parsed.completedSegmentKeys.filter(
          (value): value is string => typeof value === "string",
        ),
      ),
    ].slice(0, 500);
    return { fingerprint, completedSegmentKeys };
  } catch {
    return { fingerprint, completedSegmentKeys: [] };
  }
}

export function writeRouteProgress(
  progress: RouteProgressState,
  storage?: BrowserStorage,
): boolean {
  try {
    const resolvedStorage = storage ?? (
      typeof window === "undefined" ? undefined : window.localStorage
    );
    if (resolvedStorage === undefined) return false;
    const stored: StoredRouteProgress = {
      version: 1,
      fingerprint: progress.fingerprint,
      completedSegmentKeys: [...new Set(progress.completedSegmentKeys)].slice(0, 500),
    };
    resolvedStorage.setItem(storageKey(progress.fingerprint), JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

export function completedThroughSkill(
  segments: readonly Pick<RouteSegment, "recipeId" | "startSkill" | "endSkill">[],
  completedSegmentKeys: ReadonlySet<string>,
  skill: number,
): readonly string[] {
  const completed = new Set(completedSegmentKeys);
  for (const segment of segments) {
    if (segment.endSkill <= skill) completed.add(routeSegmentKey(segment));
  }
  return [...completed];
}

export function activeRouteSegmentKey(
  segments: readonly Pick<RouteSegment, "recipeId" | "startSkill" | "endSkill">[],
  completedSegmentKeys: ReadonlySet<string>,
  currentSkill: number,
): string | undefined {
  const containing = segments.find(
    (segment) =>
      !completedSegmentKeys.has(routeSegmentKey(segment)) &&
      currentSkill >= segment.startSkill &&
      currentSkill < segment.endSkill,
  );
  if (containing !== undefined) return routeSegmentKey(containing);
  const next = segments.find(
    (segment) =>
      !completedSegmentKeys.has(routeSegmentKey(segment)) &&
      segment.startSkill >= currentSkill,
  );
  return next === undefined ? undefined : routeSegmentKey(next);
}
