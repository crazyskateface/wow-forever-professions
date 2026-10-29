import { z } from "zod";

export const recipeChangeTypeSchema = z.enum(["NEW", "UPDATED", "REMOVED", "UNCHANGED"]);
export const recipeComparisonTypeSchema = z.enum([
  "CLASSIC_TO_FOREVER",
  "FOREVER_BUILD_TO_BUILD",
]);

export const recipeChangeComparisonQuerySchema = z.enum([
  "classic-forever",
  "forever-build",
]);
export const recipeChangeTypeQuerySchema = z.enum([
  "new",
  "updated",
  "removed",
  "unchanged",
]);

export const recipeChangesQuerySchema = z.object({
  comparison: recipeChangeComparisonQuerySchema.default("classic-forever"),
  profession: z.string().trim().min(1).max(128).optional(),
  changeType: recipeChangeTypeQuerySchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export const recipeChangesSummaryQuerySchema = recipeChangesQuerySchema.pick({
  comparison: true,
  profession: true,
});

export const recipeChangeIdentitySchema = z.object({
  professionId: z.string().min(1),
  spellId: z.number().int().positive(),
});

export const recipeChangeItemSchema = z.object({
  itemId: z.string().min(1),
  gameItemId: z.number().int().nonnegative().optional(),
  name: z.string().min(1),
  itemClassId: z.number().int().nonnegative().optional(),
  itemSubClassId: z.number().int().nonnegative().optional(),
  inventoryType: z.string().min(1).optional(),
});

export const recipeChangeReagentSchema = recipeChangeItemSchema.extend({
  quantity: z.number().int().positive(),
});

export const recipeChangeOutputSchema = recipeChangeItemSchema
  .extend({
    minimumQuantity: z.number().int().positive(),
    maximumQuantity: z.number().int().positive(),
  })
  .refine(({ minimumQuantity, maximumQuantity }) => minimumQuantity <= maximumQuantity, {
    message: "Output quantities must be ordered minimum <= maximum.",
  });

export const recipeChangeProvenanceSchema = z.object({
  sourceId: z.string().min(1),
  source: z.enum([
    "client-data",
    "observed-in-game",
    "classic-fallback",
    "community-verified",
    "manual-override",
    "fixture",
  ]),
  sourceLabel: z.string().min(1),
  sourceUrl: z.url().optional(),
  verificationStatus: z.enum(["unverified", "verified", "rejected"]),
  verifiedAt: z.iso.datetime().optional(),
  verifiedBy: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export const recipeComparisonSnapshotSchema = z.object({
  recipeId: z.string().min(1),
  identity: recipeChangeIdentitySchema,
  professionName: z.string().min(1),
  name: z.string().min(1),
  reagents: z.array(recipeChangeReagentSchema),
  outputs: z.array(recipeChangeOutputSchema),
  orangeSkill: z.number().int().nonnegative(),
  yellowSkill: z.number().int().nonnegative(),
  greenSkill: z.number().int().nonnegative(),
  graySkill: z.number().int().nonnegative(),
  learnSkill: z.number().int().nonnegative().nullable(),
  borrowedLearnSkill: z.number().int().nonnegative().nullable().optional(),
  acquisition: z.enum(["automatic", "trainer", "vendor", "quest", "drop", "reputation", "unknown"]),
  teachingItemId: z.number().int().positive().nullable().optional(),
  sourceKinds: z.array(z.enum(["trainer", "vendor", "quest", "container", "drop"])).optional(),
  sourceDataOrigin: z.enum(["forever", "classic", "classic-borrowed", "unknown"]).optional(),
  hiddenStatus: z.boolean().nullable().optional(),
  hiddenDataOrigin: z.enum(["forever", "classic", "classic-borrowed", "unknown"]).optional(),
  orangeSkillKnown: z.boolean().optional(),
  faction: z.enum(["alliance", "horde", "both", "unknown"]),
  specializationSpellId: z.number().int().positive().nullable(),
  cooldownSeconds: z.number().int().positive().nullable(),
  availability: z.enum(["available", "unavailable", "unknown"]),
  provenance: recipeChangeProvenanceSchema,
});

const recipeFieldChangeSchema = z.object({
  before: z.unknown(),
  after: z.unknown(),
});

export const recipeChangedFieldsSchema = z.object({
  name: recipeFieldChangeSchema.optional(),
  reagents: recipeFieldChangeSchema.optional(),
  outputs: recipeFieldChangeSchema.optional(),
  orangeSkill: recipeFieldChangeSchema.optional(),
  yellowSkill: recipeFieldChangeSchema.optional(),
  greenSkill: recipeFieldChangeSchema.optional(),
  graySkill: recipeFieldChangeSchema.optional(),
  learnSkill: recipeFieldChangeSchema.optional(),
  acquisition: recipeFieldChangeSchema.optional(),
  faction: recipeFieldChangeSchema.optional(),
  specializationSpellId: recipeFieldChangeSchema.optional(),
  cooldownSeconds: recipeFieldChangeSchema.optional(),
  availability: recipeFieldChangeSchema.optional(),
});

export const recipeChangeSchema = z.object({
  identity: recipeChangeIdentitySchema,
  professionName: z.string().min(1),
  name: z.string().min(1),
  changeType: recipeChangeTypeSchema,
  changedFields: recipeChangedFieldsSchema,
  base: recipeComparisonSnapshotSchema.optional(),
  target: recipeComparisonSnapshotSchema.optional(),
});

export const recipeChangeCountsSchema = z.object({
  new: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const recipeComparisonDescriptorSchema = z.object({
  id: z.string().min(1),
  baseBuildId: z.string().min(1),
  targetBuildId: z.string().min(1),
  comparisonType: recipeComparisonTypeSchema,
  createdAt: z.iso.datetime(),
});

export const recipeChangesResponseSchema = z.object({
  comparison: recipeComparisonDescriptorSchema,
  changes: z.array(recipeChangeSchema),
});

export const recipeChangesSummaryResponseSchema = z.object({
  comparison: recipeComparisonDescriptorSchema,
  professionId: z.string().min(1).optional(),
  professionName: z.string().min(1).optional(),
  summary: recipeChangeCountsSchema,
});

export type RecipeChangeType = z.infer<typeof recipeChangeTypeSchema>;
export type RecipeComparisonType = z.infer<typeof recipeComparisonTypeSchema>;
export type RecipeChangesQuery = z.infer<typeof recipeChangesQuerySchema>;
export type RecipeChangesSummaryQuery = z.infer<typeof recipeChangesSummaryQuerySchema>;
export type RecipeChange = z.infer<typeof recipeChangeSchema>;
export type RecipeComparisonSnapshot = z.infer<typeof recipeComparisonSnapshotSchema>;
export type RecipeChangeCounts = z.infer<typeof recipeChangeCountsSchema>;
export type RecipeComparisonDescriptor = z.infer<typeof recipeComparisonDescriptorSchema>;
export type RecipeChangesResponse = z.infer<typeof recipeChangesResponseSchema>;
export type RecipeChangesSummaryResponse = z.infer<typeof recipeChangesSummaryResponseSchema>;
