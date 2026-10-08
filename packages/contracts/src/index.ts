import { z } from "zod";

export const healthResponseSchema = z.object({
  service: z.literal("forever-professions-api"),
  status: z.literal("ok"),
  timestamp: z.iso.datetime(),
});

export const errorResponseSchema = z.object({
  error: z.string().min(1),
});

export const skillThresholdsSchema = z
  .object({
    orange: z.number().int().nonnegative(),
    yellow: z.number().int().nonnegative(),
    green: z.number().int().nonnegative(),
    gray: z.number().int().nonnegative(),
  })
  .refine(
    ({ orange, yellow, green, gray }) =>
      orange <= yellow && yellow <= green && green <= gray,
    { message: "Thresholds must be ordered orange <= yellow <= green <= gray." },
  );

export const provenanceSchema = z.object({
  source: z.enum([
    "client-data",
    "observed-in-game",
    "classic-fallback",
    "community-verified",
    "manual-override",
    "fixture",
  ]),
  verified: z.boolean(),
  notes: z.string().min(1).optional(),
});

export const wowBuildSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  releasedAt: z.iso.datetime().optional(),
});

export const dataSourceKindSchema = z.enum([
  "client-data",
  "observed-in-game",
  "classic-fallback",
  "community-verified",
  "manual-override",
  "fixture",
]);

export const dataSourceSchema = z.object({
  id: z.string().min(1),
  kind: dataSourceKindSchema,
  label: z.string().min(1),
  url: z.url().optional(),
});

export const verificationStatusSchema = z.enum([
  "unverified",
  "verified",
  "rejected",
]);

export const verificationSchema = z.object({
  id: z.string().min(1),
  status: verificationStatusSchema,
  verifiedAt: z.iso.datetime().optional(),
  verifiedBy: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export const professionModelSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
});

export const itemModelSchema = z.object({
  id: z.string().min(1),
  gameId: z.number().int().nonnegative().optional(),
  name: z.string().min(1),
});

export const recipeModelSchema = z.object({
  id: z.string().min(1),
  professionId: z.string().min(1),
});

export const recipeVersionSchema = z.object({
  id: z.string().min(1),
  recipeId: z.string().min(1),
  buildId: z.string().min(1),
  name: z.string().min(1),
});

export const recipeReagentSchema = z.object({
  recipeVersionId: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.number().int().positive(),
});

export const recipeOutputSchema = z
  .object({
    recipeVersionId: z.string().min(1),
    itemId: z.string().min(1),
    minimumQuantity: z.number().int().positive(),
    maximumQuantity: z.number().int().positive(),
  })
  .refine(({ minimumQuantity, maximumQuantity }) => minimumQuantity <= maximumQuantity, {
    message: "Output quantities must be ordered minimum <= maximum.",
  });

export const recipeThresholdSchema = skillThresholdsSchema.extend({
  recipeVersionId: z.string().min(1),
});

export const provenanceRecordSchema = z.object({
  id: z.string().min(1),
  recipeVersionId: z.string().min(1),
  sourceId: z.string().min(1),
  verificationId: z.string().min(1),
  notes: z.string().min(1).optional(),
});

export const importedItemSchema = itemModelSchema;

export const importedRecipeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  thresholds: skillThresholdsSchema,
  reagents: z.array(
    z.object({
      item: importedItemSchema,
      quantity: z.number().int().positive(),
    }),
  ),
  outputs: z
    .array(
      z
        .object({
          item: importedItemSchema,
          minimumQuantity: z.number().int().positive(),
          maximumQuantity: z.number().int().positive(),
        })
        .refine(
          ({ minimumQuantity, maximumQuantity }) => minimumQuantity <= maximumQuantity,
          { message: "Output quantities must be ordered minimum <= maximum." },
        ),
    )
    .min(1),
  sourceId: z.string().min(1),
  verification: verificationSchema.omit({ id: true }),
  provenanceNotes: z.string().min(1).optional(),
});

export const importedProfessionSchema = professionModelSchema.extend({
  recipes: z.array(importedRecipeSchema),
});

export const importedBuildDatasetSchema = z.object({
  build: wowBuildSchema,
  sources: z.array(dataSourceSchema).min(1),
  professions: z.array(importedProfessionSchema),
});

export const normalizedBuildSchema = z.object({
  build: wowBuildSchema,
  sources: z.array(dataSourceSchema),
  professions: z.array(professionModelSchema),
  items: z.array(itemModelSchema),
  recipes: z.array(recipeModelSchema),
  recipeVersions: z.array(recipeVersionSchema),
  reagents: z.array(recipeReagentSchema),
  outputs: z.array(recipeOutputSchema),
  thresholds: z.array(recipeThresholdSchema),
  provenance: z.array(provenanceRecordSchema),
  verifications: z.array(verificationSchema),
});

export const auctionPriceProviderIdSchema = z.enum([
  "ah-ledger",
  "blizzard",
  "manual",
  "none",
]);

export const auctionMarketSchema = z.object({
  id: z.string().min(1),
  provider: auctionPriceProviderIdSchema,
  game: z.string().min(1),
  ruleset: z.string().min(1),
  faction: z.string().min(1),
  region: z.string().min(1),
  label: z.string().min(1),
});

export const auctionPriceAttributionSchema = z.object({
  text: z.string().min(1),
  url: z.url(),
});

const auctionPriceObservationBaseSchema = z.object({
  provider: auctionPriceProviderIdSchema,
  marketId: z.string().min(1),
  gameItemId: z.number().int().positive(),
  fetchedAt: z.iso.datetime(),
  attribution: auctionPriceAttributionSchema.optional(),
});

export const availableAuctionPriceObservationSchema =
  auctionPriceObservationBaseSchema
    .extend({
      status: z.literal("available"),
      observedAt: z.iso.datetime(),
      medianUnitPriceCopper: z.number().int().nonnegative().optional(),
      minimumBuyoutUnitPriceCopper: z.number().int().nonnegative().optional(),
      quantity: z.number().int().nonnegative().optional(),
      estimatedSalesPerDay: z.number().nonnegative().optional(),
    })
    .refine(
      ({ medianUnitPriceCopper, minimumBuyoutUnitPriceCopper }) =>
        medianUnitPriceCopper !== undefined ||
        minimumBuyoutUnitPriceCopper !== undefined,
      { message: "An available auction price must include at least one price field." },
    );

export const unavailableAuctionPriceObservationSchema =
  auctionPriceObservationBaseSchema.extend({
    status: z.literal("unavailable"),
    reason: z.enum([
      "item-not-found",
      "no-market-data",
      "manual-price-missing",
      "provider-disabled",
    ]),
  });

export const auctionPriceObservationSchema = z.discriminatedUnion("status", [
  availableAuctionPriceObservationSchema,
  unavailableAuctionPriceObservationSchema,
]);

export const auctionPriceRequestSchema = z.object({
  marketId: z.string().min(1),
  gameItemIds: z.array(z.number().int().positive()).min(1),
});

export const reagentSchema = z.object({
  itemId: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
});

export const recipeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  professionId: z.string().min(1),
  thresholds: skillThresholdsSchema,
  reagents: z.array(reagentSchema),
  provenance: provenanceSchema,
});

export const professionFixtureSchema = z.object({
  build: z.string().min(1),
  id: z.string().min(1),
  name: z.string().min(1),
  recipes: z.array(recipeSchema),
});

export const professionSummarySchema = professionFixtureSchema.pick({
  id: true,
  name: true,
});

export const professionsResponseSchema = z.array(professionSummarySchema);
export const recipesResponseSchema = z.array(recipeSchema);

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type AuctionMarket = z.infer<typeof auctionMarketSchema>;
export type AuctionPriceAttribution = z.infer<
  typeof auctionPriceAttributionSchema
>;
export type AuctionPriceObservation = z.infer<
  typeof auctionPriceObservationSchema
>;
export type AuctionPriceProviderId = z.infer<
  typeof auctionPriceProviderIdSchema
>;
export type AuctionPriceRequest = z.infer<typeof auctionPriceRequestSchema>;
export type AvailableAuctionPriceObservation = z.infer<
  typeof availableAuctionPriceObservationSchema
>;
export type UnavailableAuctionPriceObservation = z.infer<
  typeof unavailableAuctionPriceObservationSchema
>;
export type DataSource = z.infer<typeof dataSourceSchema>;
export type ImportedBuildDataset = z.infer<typeof importedBuildDatasetSchema>;
export type ImportedProfession = z.infer<typeof importedProfessionSchema>;
export type ImportedRecipe = z.infer<typeof importedRecipeSchema>;
export type ItemModel = z.infer<typeof itemModelSchema>;
export type NormalizedBuild = z.infer<typeof normalizedBuildSchema>;
export type ProfessionModel = z.infer<typeof professionModelSchema>;
export type ProvenanceRecord = z.infer<typeof provenanceRecordSchema>;
export type ProfessionFixture = z.infer<typeof professionFixtureSchema>;
export type ProfessionSummary = z.infer<typeof professionSummarySchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type RecipeModel = z.infer<typeof recipeModelSchema>;
export type RecipeOutput = z.infer<typeof recipeOutputSchema>;
export type RecipeReagent = z.infer<typeof recipeReagentSchema>;
export type RecipeThreshold = z.infer<typeof recipeThresholdSchema>;
export type RecipeVersion = z.infer<typeof recipeVersionSchema>;
export type Verification = z.infer<typeof verificationSchema>;
export type WowBuild = z.infer<typeof wowBuildSchema>;
