import { FOREVER_BUILD_CONFIG } from "@forever-professions/domain";

export type PlayerFaction = "alliance" | "horde";
export type ChangeFilter =
  | "CHANGED"
  | "NEW"
  | "UPDATED"
  | "REMOVED"
  | "UNCHANGED";
export type RecipeItemType =
  | "ALL"
  | "GEAR"
  | "ARMOR_KIT"
  | "CONTAINER"
  | "MATERIAL"
  | "OTHER";

export interface ForeverChangeFilters {
  readonly professionId: string;
  readonly changeFilter: ChangeFilter;
  readonly itemType: RecipeItemType;
  readonly showAboveSkill: boolean;
  readonly showUnknownSkill: boolean;
}

export interface PersonalizationPreferences {
  readonly version: 3;
  readonly currentSkill: number;
  readonly region: string;
  readonly marketId: string;
  readonly faction: PlayerFaction;
  readonly legacyProfessionSkillBonus: number;
  readonly changeFilters: ForeverChangeFilters;
}

interface BrowserStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export const PERSONALIZATION_STORAGE_KEY =
  "forever-professions.personalization.v3";
const PREVIOUS_PERSONALIZATION_STORAGE_KEY =
  "forever-professions.personalization.v2";
const LEGACY_PERSONALIZATION_STORAGE_KEY =
  "forever-professions.personalization.v1";

export const DEFAULT_CHANGE_FILTERS: ForeverChangeFilters = {
  professionId: "",
  changeFilter: "CHANGED",
  itemType: "ALL",
  showAboveSkill: true,
  showUnknownSkill: true,
};

export const DEFAULT_PERSONALIZATION: PersonalizationPreferences = {
  version: 3,
  currentSkill: 1,
  region: "us",
  marketId: "forever.pvp.horde.us",
  faction: "horde",
  legacyProfessionSkillBonus: 0,
  changeFilters: DEFAULT_CHANGE_FILTERS,
};

const PLAYER_FACTIONS = ["alliance", "horde"] as const;
const CHANGE_FILTERS = [
  "CHANGED",
  "NEW",
  "UPDATED",
  "REMOVED",
  "UNCHANGED",
] as const;
const ITEM_TYPES = [
  "ALL",
  "GEAR",
  "ARMOR_KIT",
  "CONTAINER",
  "MATERIAL",
  "OTHER",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  fallback: Value,
): Value {
  return typeof value === "string" && allowed.includes(value as Value)
    ? value as Value
    : fallback;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.round(value)))
    : fallback;
}

function nonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function parsePersonalization(value: unknown): PersonalizationPreferences {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2 && value.version !== 3)) {
    return DEFAULT_PERSONALIZATION;
  }
  const currentSkill = boundedInteger(
    value.currentSkill,
    DEFAULT_PERSONALIZATION.currentSkill,
    1,
    FOREVER_BUILD_CONFIG.maxBaseSkill,
  );
  const changeFilters = isRecord(value.changeFilters) ? value.changeFilters : {};

  return {
    version: 3,
    currentSkill,
    region: nonEmptyString(value.region, DEFAULT_PERSONALIZATION.region),
    marketId: nonEmptyString(value.marketId, DEFAULT_PERSONALIZATION.marketId),
    faction: oneOf(
      value.faction,
      PLAYER_FACTIONS,
      DEFAULT_PERSONALIZATION.faction,
    ),
    legacyProfessionSkillBonus: boundedInteger(
      value.legacyProfessionSkillBonus,
      DEFAULT_PERSONALIZATION.legacyProfessionSkillBonus,
      0,
      100,
    ),
    changeFilters: {
      professionId: typeof changeFilters.professionId === "string"
        ? changeFilters.professionId
        : DEFAULT_CHANGE_FILTERS.professionId,
      changeFilter: oneOf(
        changeFilters.changeFilter,
        CHANGE_FILTERS,
        DEFAULT_CHANGE_FILTERS.changeFilter,
      ),
      itemType: oneOf(
        changeFilters.itemType,
        ITEM_TYPES,
        DEFAULT_CHANGE_FILTERS.itemType,
      ),
      showAboveSkill: booleanValue(
        changeFilters.showAboveSkill,
        DEFAULT_CHANGE_FILTERS.showAboveSkill,
      ),
      showUnknownSkill: booleanValue(
        changeFilters.showUnknownSkill,
        DEFAULT_CHANGE_FILTERS.showUnknownSkill,
      ),
    },
  };
}

export function readPersonalization(
  storage?: BrowserStorage,
): PersonalizationPreferences {
  try {
    const resolvedStorage = storage ?? (
      typeof window === "undefined" ? undefined : window.localStorage
    );
    if (resolvedStorage === undefined) return DEFAULT_PERSONALIZATION;
    const stored = resolvedStorage.getItem(PERSONALIZATION_STORAGE_KEY) ??
      resolvedStorage.getItem(PREVIOUS_PERSONALIZATION_STORAGE_KEY) ??
      resolvedStorage.getItem(LEGACY_PERSONALIZATION_STORAGE_KEY);
    return stored === null
      ? DEFAULT_PERSONALIZATION
      : parsePersonalization(JSON.parse(stored));
  } catch {
    return DEFAULT_PERSONALIZATION;
  }
}

export function writePersonalization(
  preferences: PersonalizationPreferences,
  storage?: BrowserStorage,
): boolean {
  try {
    const resolvedStorage = storage ?? (
      typeof window === "undefined" ? undefined : window.localStorage
    );
    if (resolvedStorage === undefined) return false;
    resolvedStorage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

export function clearPersonalization(storage?: BrowserStorage): boolean {
  try {
    const resolvedStorage = storage ?? (
      typeof window === "undefined" ? undefined : window.localStorage
    );
    if (resolvedStorage === undefined) return false;
    resolvedStorage.removeItem(PERSONALIZATION_STORAGE_KEY);
    resolvedStorage.removeItem(PREVIOUS_PERSONALIZATION_STORAGE_KEY);
    resolvedStorage.removeItem(LEGACY_PERSONALIZATION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
