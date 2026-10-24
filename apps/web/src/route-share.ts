import type { RoutePreset } from "@forever-professions/contracts";

const ROUTE_SHARE_VERSION = "2";
const ROUTE_PRESETS = new Set<RoutePreset>([
  "practical",
  "trainer-friendly",
  "cheapest",
  "fewest-crafts",
  "fewest-materials",
  "experimental",
]);

export interface SharedRouteState {
  readonly preset: RoutePreset;
}

export function sharedRouteStateFromUrl(url: string): SharedRouteState | undefined {
  const parsedUrl = new URL(url);
  if (parsedUrl.searchParams.get("route") !== ROUTE_SHARE_VERSION) return undefined;
  const preset = parsedUrl.searchParams.get("preset") as RoutePreset | null;
  if (preset === null || !ROUTE_PRESETS.has(preset)) {
    return undefined;
  }
  return { preset };
}

export function sharedRouteUrl(
  currentUrl: string,
  state: SharedRouteState,
): string {
  const url = new URL("/", currentUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("route", ROUTE_SHARE_VERSION);
  url.searchParams.set("preset", state.preset);
  return url.toString();
}
