import { createHash } from "node:crypto";
import { gatheringDatasetSchema, type GatheringDataset } from "@forever-professions/contracts";
import { parseLuaLiteralTable } from "./professiondb.js";

type Row = Readonly<Record<string, unknown>>;
export function gatheringHash(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
const professions: Readonly<Record<number, "herbalism" | "mining" | "skinning">> = { 182: "herbalism", 186: "mining", 393: "skinning" };
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid client integer.");
  return value;
}
export function convertGatheringClient(input: {
  build: string; abilities: readonly Row[]; spells: readonly Row[]; reagents: readonly Row[];
  effects: readonly Row[]; items: readonly Row[];
}): GatheringDataset {
  const spells = new Map(input.spells.map(row => [number(row.ID), row]));
  const names = new Map(input.items.map(row => [number(row.ID), String(row.Display_lang)]));
  const reagents = new Map(input.reagents.map(row => [number(row.SpellID), row]));
  const sourceHash = gatheringHash(JSON.stringify(input));
  const evidenceId = `client-${sourceHash}`;
  const abilities = input.abilities.map(row => {
    const professionId = professions[number(row.SkillLine)];
    if (!professionId) throw new Error("Unexpected gathering skill line.");
    const spellId = number(row.Spell);
    const spell = spells.get(spellId);
    if (!spell || typeof spell.Name_lang !== "string") throw new Error(`Missing spell ${spellId}.`);
    const reagent = reagents.get(spellId);
    const ids = reagent?.Reagent;
    const counts = reagent?.ReagentCount;
    if (reagent && (!Array.isArray(ids) || !Array.isArray(counts) || ids.length !== counts.length)) throw new Error(`Malformed reagents for ${spellId}.`);
    return {
      id: `${professionId}:ability-${number(row.ID)}`, professionId, skillLineAbilityId: number(row.ID), spellId,
      name: spell.Name_lang, description: typeof spell.Description_lang === "string" ? spell.Description_lang : null,
      // SkillLineAbility ranks on gathering spells are not harvest requirements.
      minimumSkill: null, availability: "unknown" as const,
      clientRanks: { minimum: number(row.MinSkillLineRank), trivialLow: number(row.TrivialSkillLineRankLow), trivialHigh: number(row.TrivialSkillLineRankHigh) },
      reagents: (Array.isArray(ids) ? ids : []).flatMap((itemId: unknown, index: number) => {
        if (itemId === 0 || itemId === -1) return [];
        return [{ itemId: number(itemId), name: names.get(number(itemId)) ?? null, quantity: number((counts as unknown[])[index]) }];
      }),
      // Create-item effects identify outputs; stack size is deliberately unknown.
      outputs: input.effects.filter(effect => effect.SpellID === spellId && effect.Effect === 24 && typeof effect.EffectItemType === "number" && effect.EffectItemType > 0)
        .map(effect => ({ itemId: number(effect.EffectItemType), name: names.get(number(effect.EffectItemType)) ?? null, quantity: null })),
      evidenceIds: [evidenceId],
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return gatheringDatasetSchema.parse({ schemaVersion: 1, client: { product: "wowf", build: input.build, locale: "enUS" },
    evidence: [{ id: evidenceId, kind: "client-data", product: "wowf", build: input.build, locale: "enUS", sourceUrl: null, revision: null,
      sha256: sourceHash, license: "Blizzard game data", verification: "unverified", notes: "SkillLineAbility, SpellName, Spell, SpellReagents, SpellEffect and ItemSparse. Client presence does not establish obtainability. Gathering ranks are retained raw, not treated as harvest thresholds. Output stack sizes unknown." }],
    abilities, sources: [], locations: [], yields: [],
  });
}

export function addGatherLite(input: GatheringDataset, upstream: {
  nodes: string; coordinates: string; revision: string; mapNames: ReadonlyMap<number, string>; mapProjectionBuild?: string;
}): GatheringDataset {
  const sourceHash = gatheringHash(upstream.nodes + upstream.coordinates);
  const evidenceId = `gatherlite-${sourceHash}`;
  const evidence: GatheringDataset["evidence"][number] = {
    id: evidenceId, kind: "community-data", product: "wowf", build: null, locale: "enUS", revision: upstream.revision,
    sourceUrl: `https://github.com/Wuild/GatherLite/tree/${upstream.revision}`, sha256: sourceHash,
    license: "MIT (GatherLite); upstream coordinate origin: Wowhead Forever", verification: "unverified",
    notes: `Reported coordinates from the Forever dataset. Upstream map projection build: ${upstream.mapProjectionBuild ?? "unknown"}. Exact game-data build unknown; compatibility with the client snapshot is unverified. Alias names do not establish variant requirements. Reported skill minima are community claims, not verified requirements. Map labels use the pinned client snapshot.`,
  };
  const sources: GatheringDataset["sources"] = [];
  for (const match of upstream.nodes.matchAll(/InsertObject\(\s*("(?:ore|herb)"[\s\S]*?)\)/g)) {
    const args = parseLuaLiteralTable(`{${match[1]}}`);
    const ids = args.get(2);
    const key = args.get(3);
    const levels = args.get(5);
    if (!(ids instanceof Map) || typeof key !== "string" || !(levels instanceof Map)) throw new Error("Invalid GatherLite node definition.");
    for (const gameId of ids.values()) sources.push({
      id: `object-${number(gameId)}`, professionId: args.get(1) === "herb" ? "herbalism" : "mining", kind: "node", gameId: number(gameId),
      name: key.replaceAll("_", " "), minimumSkill: null, reportedMinimumSkill: gameId === ids.get(1) ? number(levels.get(1)) : null, evidenceIds: [evidenceId],
    });
  }
  if (sources.length === 0) throw new Error("No supported GatherLite definitions found.");
  const byId = new Set(sources.map(source => source.gameId));
  const marker = upstream.coordinates.indexOf("addon.predefined =");
  if (marker < 0) throw new Error("Missing GatherLite coordinate table.");
  const root = parseLuaLiteralTable(upstream.coordinates.slice(marker));
  const locations: GatheringDataset["locations"] = [];
  for (const [objectId, maps] of root) {
    if (!byId.has(number(objectId))) continue; // Chests and fishing are outside this adapter.
    if (!(maps instanceof Map)) throw new Error("Invalid GatherLite map table.");
    for (const [mapId, coords] of maps) {
      if (!(coords instanceof Map) || coords.size % 2) throw new Error("Malformed coordinate pairs.");
      for (let i = 1; i <= coords.size; i += 2) {
        const x = coords.get(i), y = coords.get(i + 1);
        locations.push({ id: gatheringHash(JSON.stringify([objectId, mapId, x, y])), sourceId: `object-${objectId}`,
          mapId: number(mapId), mapName: upstream.mapNames.get(number(mapId)) ?? null,
          x: x as number, y: y as number, coordinateKind: "reported-node", evidenceIds: [evidenceId, ...input.evidence.filter(e => e.kind === "client-data").map(e => e.id)] });
      }
    }
  }
  // Repeated upstream coordinates describe the same report, not extra observations.
  return gatheringDatasetSchema.parse({ ...input, evidence: [...input.evidence, evidence], sources,
    locations: [...new Map(locations.map(location => [location.id, location])).values()].sort((a, b) => a.id.localeCompare(b.id)) });
}

export function renderGatheringAudit(data: GatheringDataset): string {
  const lines = [`# Gathering evidence audit — ${data.client.build}`, "", `Product: ${data.client.product} · Locale: ${data.client.locale}`, "",
    "| Profession | Client abilities | Sources | Locations | Yield records |", "| --- | ---: | ---: | ---: | ---: |"];
  for (const professionId of ["herbalism", "mining", "skinning"]) {
    const sources = new Set(data.sources.filter(s => s.professionId === professionId).map(s => s.id));
    lines.push(`| ${professionId} | ${data.abilities.filter(a => a.professionId === professionId).length} | ${sources.size} | ${data.locations.filter(l => sources.has(l.sourceId)).length} | ${data.yields.filter(y => sources.has(y.sourceId)).length} |`);
  }
  lines.push("", `Unknown ability requirements: ${data.abilities.filter(a => a.minimumSkill === null).length}. Unknown source requirements: ${data.sources.filter(s => s.minimumSkill === null).length}.`, "",
    "All client presence and community reports remain unverified. Create-item stack sizes are unknown. No route or drop-rate model is inferred. Repeated coordinate pairs are deduplicated, not counted as observations.", "", "## Evidence", "");
  for (const e of data.evidence) lines.push(`- ${e.kind}; build ${e.build ?? "unknown"}; revision ${e.revision ?? "client snapshot"}; SHA-256 ${e.sha256}. ${e.notes}`);
  return lines.join("\n") + "\n";
}
