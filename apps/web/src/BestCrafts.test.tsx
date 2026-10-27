import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { leatherworkingFixture } from "@forever-professions/fixtures";
import type { Recipe } from "@forever-professions/contracts";
import { importedBuildDatasetSchema } from "@forever-professions/contracts";
import { CRAFT_LEVEL_TARGETS, recommendCrafts } from "@forever-professions/domain";
import { bestCraftDefaults } from "./best-crafts-professions.js";
import { BestCrafts } from "./BestCrafts.js";
import { ItemTooltipProvider } from "./ItemTooltip.js";
import type { CatalogState } from "./request-policy.js";

const supported: Recipe = {
  ...leatherworkingFixture.recipes[0]!,
  id: "spell-test", name: "Test craft", learnSkill: null, availability: "unknown", acquisition: "unknown", faction: "unknown",
  provenance: { ...leatherworkingFixture.recipes[0]!.provenance, source: "client-data" },
  outputs: [{ itemId: "test", name: "Test boots", quantity: 1, itemClassId: 4, itemSubClassId: 2, inventoryType: "INVTYPE_FEET", clientData: {
    displayName: "Test boots", requiredLevel: 19, sellPriceCopper: 0, qualityId: 3,
    stats: [{ statId: 3, value: 5, displayText: "+5 Agility", displayTone: "attribute" }],
    source: { product: "wowf", build: "1.60.1.70630", locale: "enUS" },
  } }],
};

function render(catalogState: CatalogState = "ready", recipes: readonly Recipe[] = [supported]) {
  return renderToStaticMarkup(<ItemTooltipProvider><BestCrafts
    catalogState={catalogState} currentSkill={1} faction="alliance" professionName="Leatherworking" recipes={recipes}
    selection={{ classId: "rogue", roleId: "melee", level: 20 }} onSelectionChange={() => {}} onOpenRecipe={() => {}}
    getTooltip={(_, __, output) => ({ name: output.name })}
  /></ItemTooltipProvider>);
}

describe("Best crafts presentation", () => {
  it.each(["leatherworking", "tailoring", "blacksmithing"])("ranks the imported %s catalog at every level target", (professionId) => {
    const data = importedBuildDatasetSchema.parse(JSON.parse(readFileSync(new URL("../../../data/imports/forever-1.60.1.69977-professions.json", import.meta.url), "utf8")));
    const profession = data.professions.find(p => p.id === professionId)!;
    const recipes = profession.recipes.map(recipe => ({
      id: recipe.id, faction: recipe.metadata.faction, availability: recipe.metadata.availability,
      provenance: { source: data.sources.find(source => source.id === recipe.sourceId)!.kind, verification: recipe.verification },
      outputs: recipe.outputs.map(({ item }) => ({ ...item, itemId: item.id })),
    }));
    for (const level of CRAFT_LEVEL_TARGETS) {
      const result = recommendCrafts(recipes, { ...bestCraftDefaults(professionId)!, level, faction: "horde" });
      expect(result.slots.length).toBeGreaterThan(0);
      for (const slot of result.slots) {
        expect(slot.best.output.clientData!.source.product).toBe("wowf");
        expect(slot.best.output.clientData!.requiredLevel).toBeLessThanOrEqual(level);
        expect(slot.best.recipe.availability).not.toBe("unavailable");
      }
    }
  });

  it("shows equip level separately from unknown learning rank and source", () => {
    const markup = render();
    expect(markup).toContain("Requires character level 19");
    expect(markup).toContain("Learning skill unknown");
    expect(markup).toContain("Pattern source unknown");
    expect(markup).toContain("availability unconfirmed");
    expect(markup).toContain("Faction restriction unknown");
    expect(markup).toContain("View recipe for Test boots");
    expect(markup).toContain("+5 Agility");
    expect(markup).toContain("not an all-source best-in-slot list");
  });

  it("offers six fixed targets with the selected target announced", () => {
    const markup = render();
    expect(markup.match(/<span>By level<\/span>/g)).toHaveLength(6);
    expect(markup).toMatch(/<button[^>]*aria-pressed="true"[^>]*><span>By level<\/span><strong>20<\/strong>/);
    expect(markup).toContain("Aim to craft by level 20");
  });

  it("separates loading and sample-catalog states from genuine recommendations", () => {
    expect(render("loading")).toContain("Loading the profession");
    const markup = render("fixture", leatherworkingFixture.recipes);
    expect(markup).toContain("Sample recipes cannot provide equipment recommendations");
    expect(markup).not.toContain('class="craft-slot"');
    expect(render("ready", [])).toContain("No supported matches at this milestone");
  });
});
