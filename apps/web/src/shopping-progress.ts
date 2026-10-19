interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ShoppingProgressState {
  readonly fingerprint: string;
  readonly ownedQuantities: Readonly<Record<string, number>>;
  readonly checkedItemIds: readonly string[];
}

interface StoredShoppingProgress {
  readonly version: 1;
  readonly fingerprint: string;
  readonly ownedQuantities: Readonly<Record<string, number>>;
  readonly checkedItemIds: readonly string[];
}

const STORAGE_PREFIX = "forever-professions.shopping-progress.v1";

function storageKey(fingerprint: string): string {
  return `${STORAGE_PREFIX}.${fingerprint}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeQuantity(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(1_000_000, value)
    : undefined;
}

export function readShoppingProgress(
  fingerprint: string,
  storage?: BrowserStorage,
): ShoppingProgressState {
  const empty = { fingerprint, ownedQuantities: {}, checkedItemIds: [] } as const;
  try {
    const resolvedStorage = storage ?? (
      typeof window === "undefined" ? undefined : window.localStorage
    );
    if (resolvedStorage === undefined) return empty;
    const stored = resolvedStorage.getItem(storageKey(fingerprint));
    if (stored === null) return empty;
    const parsed: unknown = JSON.parse(stored);
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      parsed.fingerprint !== fingerprint ||
      !isRecord(parsed.ownedQuantities) ||
      !Array.isArray(parsed.checkedItemIds)
    ) {
      return empty;
    }
    const ownedQuantities = Object.fromEntries(
      Object.entries(parsed.ownedQuantities).flatMap(([itemId, value]) => {
        const quantity = safeQuantity(value);
        return itemId.length === 0 || quantity === undefined || quantity === 0
          ? []
          : [[itemId, quantity] as const];
      }),
    );
    const checkedItemIds = [
      ...new Set(
        parsed.checkedItemIds.filter(
          (value): value is string => typeof value === "string" && value.length > 0,
        ),
      ),
    ].slice(0, 2_000);
    return { fingerprint, ownedQuantities, checkedItemIds };
  } catch {
    return empty;
  }
}

export function writeShoppingProgress(
  progress: ShoppingProgressState,
  storage?: BrowserStorage,
): boolean {
  try {
    const resolvedStorage = storage ?? (
      typeof window === "undefined" ? undefined : window.localStorage
    );
    if (resolvedStorage === undefined) return false;
    const ownedQuantities = Object.fromEntries(
      Object.entries(progress.ownedQuantities).flatMap(([itemId, value]) => {
        const quantity = safeQuantity(value);
        return itemId.length === 0 || quantity === undefined || quantity === 0
          ? []
          : [[itemId, quantity] as const];
      }),
    );
    const stored: StoredShoppingProgress = {
      version: 1,
      fingerprint: progress.fingerprint,
      ownedQuantities,
      checkedItemIds: [...new Set(progress.checkedItemIds)].slice(0, 2_000),
    };
    resolvedStorage.setItem(storageKey(progress.fingerprint), JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

export function remainingShoppingQuantity(expected: number, owned: number): number {
  return Math.max(0, expected - Math.max(0, owned));
}
