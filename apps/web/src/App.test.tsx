import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App.js";
import { ItemTooltipProvider } from "./ItemTooltip.js";
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

  it("uses current skill for guide position without exposing route bounds", () => {
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

    expect(markup).toContain("Build the 1–300 guide");
    expect(markup).toContain("Route style");
    expect(markup).not.toContain("Starting skill");
    expect(markup).not.toContain("Target skill");
    expect(markup).not.toContain("Use current skill as the route start");
  });
});
