import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { PROFESSIONS } from "@forever-professions/contracts";
import { professionHref, professionIdFromUrl, readProfessionSkill, writeProfessionSkill } from "./profession-navigation.js";
import { ProfessionLanding } from "./ProfessionLanding.js";
import { ProfessionSwitcher } from "./ProfessionNavigation.js";
import { App } from "./App.js";
import { ItemTooltipProvider } from "./ItemTooltip.js";
import { leatherworkingFixture } from "@forever-professions/fixtures";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
afterEach(() => {
  if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window");
  else Object.defineProperty(globalThis, "window", originalWindow);
});

describe("profession entry and navigation", () => {
  it("makes every profession reachable from the landing page and native switcher", () => {
    const landing = renderToStaticMarkup(<ProfessionLanding />);
    const switcher = renderToStaticMarkup(<ProfessionSwitcher professionId="first-aid" />);
    for (const profession of PROFESSIONS) {
      expect(landing).toContain(`href="${professionHref(profession.id)}"`);
      expect(switcher).toContain(`value="${profession.id}"`);
      expect(professionIdFromUrl(`https://example.com${professionHref(profession.id)}`)).toBe(profession.id);
    }
    expect(switcher).toContain('aria-label="Switch profession"');
    expect(professionIdFromUrl("https://example.com/")).toBeUndefined();
    expect(professionIdFromUrl("https://example.com/professions/unknown")).toBeUndefined();
  });

  it("preserves old recipe links and identifies new namespaced recipe links", () => {
    expect(professionIdFromUrl("https://example.com/?recipe=spell-2162")).toBe("leatherworking");
    expect(professionIdFromUrl("https://example.com/?recipe=enchanting%3Aspell-7418")).toBe("enchanting");
  });

  it("keeps skill independent per profession and handles invalid or unavailable storage", () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } } });
    writeProfessionSkill("cooking", 150);
    writeProfessionSkill("first-aid", 75);
    expect(readProfessionSkill("cooking", 290)).toBe(150);
    expect(readProfessionSkill("first-aid", 290)).toBe(75);
    expect(readProfessionSkill("leatherworking", 290)).toBe(290);
    expect(readProfessionSkill("fishing", 290)).toBe(1);
    values.set("forever-professions.skill.fishing", "900");
    expect(readProfessionSkill("fishing", 290)).toBe(1);
  });

  it("renders an enchantment without item outputs or Leatherworking acquisition links", () => {
    const profession = { ...leatherworkingFixture, id: "enchanting", name: "Enchanting", recipes: [{ ...leatherworkingFixture.recipes[0]!, professionId: "enchanting", outputs: [] }] };
    const markup = renderToStaticMarkup(<ItemTooltipProvider><App initialProfession={profession} initialCatalogState="ready" /></ItemTooltipProvider>);
    expect(markup).toContain("No crafted item output is recorded");
    expect(markup).not.toContain('href="/leatherworking');
    expect(markup).toContain('value="enchanting" selected');
  });
});
