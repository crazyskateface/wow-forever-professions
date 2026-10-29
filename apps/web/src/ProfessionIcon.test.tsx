import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PROFESSIONS } from "@forever-professions/contracts";
import manifest from "../public/icons/professions/manifest.json";
import { ProfessionIcon } from "./ProfessionIcon.js";
import { ProfessionLanding } from "./ProfessionLanding.js";
import { ProfessionSwitcher } from "./ProfessionNavigation.js";
import { ItemIcon } from "./ItemIcon.js";

describe("profession artwork", () => {
  it("ships a matching client-derived asset for every profession and uses it in both entry points", () => {
    const landing = renderToStaticMarkup(<ProfessionLanding />);
    expect(manifest.source).toMatchObject({ product: "wowf", build: "1.60.1.70630", table: "SkillLine", iconField: "SpellIconFileID" });
    for (const profession of PROFESSIONS) {
      const icon = manifest.icons[profession.id];
      const bytes = readFileSync(new URL(`../public${icon.path}`, import.meta.url));
      expect(icon.skillLineId).toBe(profession.skillLineId);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(icon.sha256);
      expect(bytes.length).toBeLessThan(10000);
      expect(landing).toContain(`src="${icon.path}"`);
      expect(renderToStaticMarkup(<ProfessionSwitcher professionId={profession.id} />)).toContain(`src="${icon.path}"`);
    }
  });

  it("lazy-loads directory icons and eagerly loads the selected profession icon", () => {
    const listIcon = renderToStaticMarkup(<ProfessionIcon className="test-icon" professionId="alchemy" />);
    const headerIcon = renderToStaticMarkup(<ProfessionIcon className="test-icon" professionId="alchemy" eager />);
    expect(listIcon).toContain('loading="lazy"');
    expect(listIcon).toContain('aria-hidden="true"');
    expect(headerIcon).toContain('loading="eager"');
  });

  it("keeps item URLs and initials fallbacks available through the shared renderer", () => {
    expect(renderToStaticMarkup(<ItemIcon className="test-icon" gameItemId={2302} name="Handstitched Leather Boots" />)).toContain('src="/icons/items/2302.webp"');
    expect(renderToStaticMarkup(<ItemIcon className="test-icon" gameItemId={undefined} name="Alchemy" fallbackText="AL" />)).toContain(">AL</span>");
  });
});
