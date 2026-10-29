import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { gatheringCatalogSchema, gatheringDatasetSchema } from "@forever-professions/contracts";
import { GatheringContent, GatheringWorkspace } from "./GatheringProfession.js";

describe("gathering content", () => {
  it("shows client recipes with exact reagents and unknown requirements and output quantities", () => {
    const data = gatheringDatasetSchema.parse(JSON.parse(readFileSync(new URL("../../../data/imports/forever-1.60.1.70630-gathering.json", import.meta.url), "utf8")));
    const ability = data.abilities.find(a => a.name === "Incense Candle")!;
    const catalog = gatheringCatalogSchema.parse({ datasetId: "test", client: data.client, professionId: "herbalism", evidence: data.evidence,
      abilities: [ability], sources: [], maps: [], yields: [] });
    const html = renderToStaticMarkup(<GatheringContent catalog={catalog} />);
    expect(html).toContain("Incense Candle");
    expect(html).toContain("Skill required: Unknown");
    expect(html).toContain("Quantity 1");
    expect(html).toContain("Quantity Unknown");
    expect(html).toContain("GatherLite community dataset");
    expect(html).not.toContain("Guaranteed");
    const workspace = renderToStaticMarkup(<GatheringWorkspace professionId="herbalism" catalog={catalog} onRetry={() => undefined} />);
    expect(workspace).toContain('class="workspace"');
    expect(workspace).toContain('class="profession-rail"');
    expect(workspace).toContain('class="main-workspace"');
    expect(workspace).toContain("Recipe calculator");
    expect(workspace).not.toContain("Best crafts");
    expect(workspace).toContain("For 1 craft");
    expect(workspace).toContain("Skill-up curve unavailable");
  });
  it("retains zero-location nodes and labels community skill claims without making them verified requirements", () => {
    const data = gatheringDatasetSchema.parse(JSON.parse(readFileSync(new URL("../../../data/imports/forever-1.60.1.70630-gathering.json", import.meta.url), "utf8")));
    const source = data.sources.find(s => s.professionId === "herbalism" && s.reportedMinimumSkill === 1)!;
    const html = renderToStaticMarkup(<GatheringContent catalog={gatheringCatalogSchema.parse({ datasetId: "test", client: data.client, professionId: "herbalism", evidence: data.evidence, abilities: [], sources: [{ ...source, locationCount: 0 }], maps: [], yields: [] })} />);
    expect(html).toContain("Locations (0)");
    expect(html).toContain("Community-reported minimum: 1");
    expect(html).toContain("Skill required: Unknown");
    expect(html).toContain("Gathering yields: unknown");
  });
});
