import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App.js";
import { ItemTooltipProvider } from "./ItemTooltip.js";
import { leatherworkingFixture } from "@forever-professions/fixtures";
import {
  DEFAULT_PERSONALIZATION,
  PERSONALIZATION_STORAGE_KEY,
} from "./personalization.js";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
  } else {
    Object.defineProperty(globalThis, "window", originalWindow);
  }
});

describe("recipe materials", () => {
  it.each([150, 175, 300])("shows integer quantities for one craft at skill %s", (skill) => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => key === PERSONALIZATION_STORAGE_KEY
            ? JSON.stringify({ ...DEFAULT_PERSONALIZATION, currentSkill: skill })
            : null,
        },
        location: { href: "http://127.0.0.1:5173/?view=recipes", pathname: "/" },
      },
    });
    const markup = renderToStaticMarkup(<ItemTooltipProvider><App initialProfession={leatherworkingFixture} /></ItemTooltipProvider>);
    const materials = markup.match(/<section class="materials-card"[\s\S]*?<\/section>/)![0];
    const quantities = [...materials.matchAll(/<strong role="cell">([^<]+)<\/strong>/g)].map((match) => match[1]);
    expect(quantities).toEqual(leatherworkingFixture.recipes[0]!.reagents.map(({ quantity }) => String(quantity)));
    expect(materials).toContain('role="columnheader">Quantity</span>');
    expect(materials).toContain("For 1 craft");
    expect(materials).not.toContain("attempts");
  });
});

describe("current skill control", () => {
  it.each([
    { view: "guide", label: "Current leveling skill" },
    { view: "recipes", label: "Current profession skill" },
    { view: "changes", label: "Current skill for changed recipes" },
  ].flatMap((view) => [1, 120, 300].map((skill) => ({ ...view, skill }))))(
    "keeps the $view slider usable at skill $skill, including while data loads",
    ({ view, label, skill }) => {
      const personalization = {
        ...DEFAULT_PERSONALIZATION,
        currentSkill: skill,
      };
      const storage = {
        getItem(key: string) {
          return key === PERSONALIZATION_STORAGE_KEY
            ? JSON.stringify(personalization)
            : null;
        },
      };

      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
          localStorage: storage,
          location: {
            href: `http://127.0.0.1:5173/?view=${view}`,
            pathname: "/",
          },
        },
      });

      const markup = renderToStaticMarkup(
        <ItemTooltipProvider>
          <App />
        </ItemTooltipProvider>,
      );

      const slider = markup.match(/<input\b[^>]*type="range"[^>]*>/g);
      expect(slider).toHaveLength(1);
      expect(slider![0]).toContain(`aria-label="${label}"`);
      expect(slider![0]).toContain('draggable="false"');
      expect(slider![0]).toContain('max="300" min="1"');
      expect(slider![0]).toContain(`value="${skill}"`);
      expect(slider![0]).not.toContain("disabled");
      expect(markup).toContain(`${skill} / 300`);
      expect(markup).toContain('aria-label="Decrease skill"');
      expect(markup).toContain('aria-label="Increase skill"');
    },
  );

  it("keeps removed controls unavailable even through an old shared-route URL", () => {
    const storage = {
      getItem() {
        return JSON.stringify({
          ...DEFAULT_PERSONALIZATION,
          currentSkill: 120,
        });
      },
    };

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: storage,
        location: {
          href: "http://127.0.0.1:5173/?route=2&preset=practical",
          pathname: "/",
        },
      },
    });

    const markup = renderToStaticMarkup(
      <ItemTooltipProvider>
        <App />
      </ItemTooltipProvider>,
    );

    expect(markup).toContain("Best crafts");
    expect(markup).not.toContain(">Leveling route</button>");
    expect(markup).not.toContain("Guide settings");
    expect(markup).not.toContain("Shopping list");
    expect(markup).not.toContain("Route style");
    expect(markup).not.toContain("Copy guide link");
    expect(markup).not.toContain("Complete through");
    expect(markup).not.toContain("<dialog");
    expect(markup).not.toContain("Starting skill");
    expect(markup).not.toContain("Target skill");
    expect(markup).not.toContain("Use current skill as the route start");
  });
});
