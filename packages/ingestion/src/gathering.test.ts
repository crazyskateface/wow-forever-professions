import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gatheringDatasetSchema } from "@forever-professions/contracts";
import { addGatherLite, convertGatheringClient } from "./gathering-conversion.js";

const client = () => convertGatheringClient({ build: "1.60.1.70630", abilities: [{ ID: 1, SkillLine: 182, Spell: 11, MinSkillLineRank: 1, TrivialSkillLineRankLow: 0, TrivialSkillLineRankHigh: 0 }],
  spells: [{ ID: 11, Name_lang: "Test ability", Description_lang: "Client text" }],
  reagents: [{ SpellID: 11, Reagent: [2447, 0, -1], ReagentCount: [2, 0, 0] }],
  effects: [{ SpellID: 11, Effect: 24, EffectItemType: 99 }, { SpellID: 11, Effect: 3, EffectItemType: 77 }],
  items: [{ ID: 2447, Display_lang: "Peacebloom" }],
});
describe("gathering evidence conversion", () => {
  it("keeps client ranks separate from unknown requirements and preserves exact reagents", () => {
    const data = client();
    expect(data.abilities[0]).toMatchObject({ minimumSkill: null, availability: "unknown", clientRanks: { minimum: 1, trivialLow: 0, trivialHigh: 0 }, reagents: [{ itemId: 2447, quantity: 2 }] });
    expect(data.abilities[0]!.outputs).toEqual([{ itemId: 99, name: null, quantity: null }]);
    expect(client()).toEqual(data);
  });
  it("parses literals without executing Lua, excludes unrelated objects, and deduplicates coordinate reports", () => {
    const data = addGatherLite(client(), { nodes: 'InsertObject("herb", {1617,3725}, "silverleaf", "icon", {1,25})',
      coordinates: '-- comment { x, y }\naddon.predefined = { [1617] = {[1411] = {0.25,0.5,0.25,0.5}}, [555]={ [1411]={0.1,0.1}} }', revision: "abc", mapNames: new Map([[1411, "Durotar"]]) });
    expect(data.sources).toHaveLength(2);
    expect(data.sources[1]).toMatchObject({ minimumSkill: null, reportedMinimumSkill: null });
    expect(data.locations).toHaveLength(1);
    expect(data.locations[0]).toMatchObject({ x: .25, y: .5, mapName: "Durotar" });
    expect(() => addGatherLite(client(), { nodes: 'InsertObject("herb", {1617}, "x", "i", {1})', coordinates: 'addon.predefined = { [1617] = {[1411] = {os.execute("bad"),.5}} }', revision: "abc", mapNames: new Map() })).toThrow();
  });
  it("rejects out-of-range coordinates and missing evidence or parent sources", () => {
    const data = client();
    expect(gatheringDatasetSchema.safeParse({ ...data, locations: [{ id: "bad", sourceId: "missing", mapId: 1, mapName: null, x: 1.5, y: .5, coordinateKind: "reported-node", evidenceIds: ["missing"] }] }).success).toBe(false);
    expect(gatheringDatasetSchema.safeParse({ ...data, abilities: [data.abilities[0], data.abilities[0]] }).success).toBe(false);
    expect(gatheringDatasetSchema.safeParse({ ...data, client: { ...data.client, build: "1.60.1/../../escape" } }).success).toBe(false);
    expect(gatheringDatasetSchema.safeParse({ ...data, evidence: [{ ...data.evidence[0], sourceUrl: "javascript:alert(1)" }] }).success).toBe(false);
  });
  it("ships all gathering client records and retains community build uncertainty", () => {
    const data = gatheringDatasetSchema.parse(JSON.parse(readFileSync(new URL("../../../data/imports/forever-1.60.1.70630-gathering.json", import.meta.url), "utf8")));
    expect(data.abilities).toHaveLength(62);
    expect(data.sources.length).toBeGreaterThan(0);
    expect(data.locations.length).toBeGreaterThan(20000);
    expect(data.abilities.some(a => a.professionId === "skinning" && a.outputs.length > 0)).toBe(true);
    expect(data.evidence.find(e => e.kind === "community-data")).toMatchObject({ build: null, verification: "unverified" });
    expect(data.sources.every(s => s.minimumSkill === null)).toBe(true);
  });
});
