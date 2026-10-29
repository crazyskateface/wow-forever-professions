import { getProfessionDefinition } from "@forever-professions/contracts";

export function professionHref(id: string): string {
  return `/professions/${encodeURIComponent(id)}`;
}

export function professionIdFromUrl(value: string): string | undefined {
  const url = new URL(value);
  const match = /^\/professions\/([^/]+)\/?$/.exec(url.pathname);
  if (match) return getProfessionDefinition(match[1]!)?.id;
  // Preserve published calculator links from before the profession landing page.
  if (url.pathname === "/" && (url.searchParams.has("recipe") || url.searchParams.has("view"))) {
    const recipeId = url.searchParams.get("recipe") ?? "";
    return getProfessionDefinition(recipeId.split(":")[0]!)?.id ?? "leatherworking";
  }
  return undefined;
}

export function readProfessionSkill(id: string, legacySkill: number): number {
  try {
    const value = window.localStorage.getItem(`forever-professions.skill.${id}`);
    if (value !== null) {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === "number" && Number.isInteger(parsed) && parsed >= 1 && parsed <= 300) return parsed;
    }
  } catch { /* Browser storage is optional. */ }
  return id === "leatherworking" ? legacySkill : 1;
}

export function writeProfessionSkill(id: string, skill: number): void {
  try { window.localStorage.setItem(`forever-professions.skill.${id}`, JSON.stringify(skill)); }
  catch { /* Browser storage is optional. */ }
}
