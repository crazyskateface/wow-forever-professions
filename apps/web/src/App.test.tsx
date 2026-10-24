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
  it("keeps the guide slider on the full profession range", () => {
    const personalization = {
      ...DEFAULT_PERSONALIZATION,
      currentSkill: 120,
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
          href: "http://127.0.0.1:5173/",
          pathname: "/",
        },
      },
    });

    const markup = renderToStaticMarkup(
      <ItemTooltipProvider>
        <App />
      </ItemTooltipProvider>,
    );

    expect(markup).toContain("Current skill");
    expect(markup).toContain("120 / 300");
    expect(markup).toContain(
      'aria-label="Current leveling skill" max="300" min="1" step="1" type="range" value="120"',
    );
    expect(markup).toContain('aria-label="Decrease skill"');
    expect(markup).toContain('aria-label="Increase skill"');
  });

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
