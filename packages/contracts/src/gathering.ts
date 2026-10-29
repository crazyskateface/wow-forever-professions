import { z } from "zod";

export const gatheringProfessionIdSchema = z.enum(["herbalism", "mining", "skinning"]);
const id = z.string().min(1).max(128);
const integer = z.number().int().nonnegative();
const positive = z.number().int().positive();
const evidenceIds = z.array(id).min(1);
export const gatheringEvidenceSchema = z.object({
  id, kind: z.enum(["client-data", "community-data", "observed-in-game"]),
  product: z.literal("wowf"), build: z.string().nullable(), locale: z.string(),
  sourceUrl: z.url().refine(value => /^https?:\/\//.test(value), "Source URLs must use HTTP(S).").nullable(), revision: z.string().nullable(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  license: z.string().nullable(), verification: z.enum(["unverified", "observed"]), notes: z.string(),
});
export const gatheringAbilitySchema = z.object({
  id, professionId: gatheringProfessionIdSchema, skillLineAbilityId: positive, spellId: positive,
  name: z.string().min(1), description: z.string().nullable(), minimumSkill: integer.nullable(),
  availability: z.literal("unknown"),
  clientRanks: z.object({ minimum: integer, trivialLow: integer, trivialHigh: integer }),
  reagents: z.array(z.object({ itemId: positive, name: z.string().nullable(), quantity: positive })),
  outputs: z.array(z.object({ itemId: positive, name: z.string().nullable(), quantity: positive.nullable() })),
  evidenceIds,
});
export const gatheringSourceSchema = z.object({
  id, professionId: gatheringProfessionIdSchema, kind: z.enum(["node", "creature"]), gameId: positive,
  name: z.string().min(1), minimumSkill: integer.nullable(),
  reportedMinimumSkill: integer.nullable(), evidenceIds,
});
export const gatheringLocationSchema = z.object({
  id, sourceId: id, mapId: positive, mapName: z.string().nullable(),
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  coordinateKind: z.enum(["reported-node", "observer"]), evidenceIds,
});
export const gatheringYieldSchema = z.object({
  id, sourceId: id, itemId: positive, itemName: z.string().nullable(),
  minimumQuantity: integer.nullable(), maximumQuantity: integer.nullable(),
  observations: positive.nullable(), evidenceIds,
}).refine(v => v.minimumQuantity === null || v.maximumQuantity === null || v.maximumQuantity >= v.minimumQuantity, "Yield range is reversed.");
export const gatheringDatasetSchema = z.object({
  schemaVersion: z.literal(1), client: z.object({ product: z.literal("wowf"), build: z.string().regex(/^1\.60\.\d+\.\d+$/), locale: z.string() }),
  evidence: z.array(gatheringEvidenceSchema).min(1), abilities: z.array(gatheringAbilitySchema),
  sources: z.array(gatheringSourceSchema), locations: z.array(gatheringLocationSchema), yields: z.array(gatheringYieldSchema),
}).superRefine((data, ctx) => {
  const evidence = new Set(data.evidence.map(v => v.id));
  const sources = new Set(data.sources.map(v => v.id));
  for (const [kind, records] of Object.entries({ evidence: data.evidence, abilities: data.abilities, sources: data.sources, locations: data.locations, yields: data.yields })) {
    const seen = new Set<string>();
    for (const record of records) {
      if (seen.has(record.id)) ctx.addIssue({ code: "custom", message: `Duplicate ${kind} ID ${record.id}` });
      seen.add(record.id);
      if ("evidenceIds" in record && record.evidenceIds.some(key => !evidence.has(key))) ctx.addIssue({ code: "custom", message: `Missing evidence on ${record.id}` });
      if ("sourceId" in record && !sources.has(record.sourceId)) ctx.addIssue({ code: "custom", message: `Missing gathering source on ${record.id}` });
    }
  }
});
export const gatheringCatalogSchema = z.object({
  datasetId: id, client: gatheringDatasetSchema.shape.client,
  professionId: gatheringProfessionIdSchema, evidence: z.array(gatheringEvidenceSchema),
  abilities: z.array(gatheringAbilitySchema),
  sources: z.array(gatheringSourceSchema.extend({ locationCount: integer })),
  yields: z.array(gatheringYieldSchema),
  maps: z.array(z.object({ mapId: positive, mapName: z.string().nullable(), locationCount: integer })),
});
export const gatheringLocationsQuerySchema = z.object({
  sourceId: id, datasetId: id, mapId: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).max(100000).default(0), limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const gatheringLocationsResponseSchema = z.object({ total: integer, locations: z.array(gatheringLocationSchema) });
export type GatheringDataset = z.infer<typeof gatheringDatasetSchema>;
export type GatheringCatalog = z.infer<typeof gatheringCatalogSchema>;
export type GatheringLocationsQuery = z.infer<typeof gatheringLocationsQuerySchema>;
export type GatheringLocationsResponse = z.infer<typeof gatheringLocationsResponseSchema>;
