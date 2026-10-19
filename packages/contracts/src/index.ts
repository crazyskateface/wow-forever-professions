import { z } from "zod";

export * from "./recipe-changes.js";
export * from "./guide-validation.js";

export const healthResponseSchema = z.object({
  service: z.literal("forever-professions-api"),
  status: z.literal("ok"),
  timestamp: z.iso.datetime(),
});

export const readinessResponseSchema = z.object({
  service: z.literal("forever-professions-api"),
  status: z.enum(["ready", "unavailable"]),
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

export const recipeAcquisitionSchema = z.enum([
  "automatic",
  "trainer",
  "vendor",
  "quest",
  "drop",
  "reputation",
  "unknown",
]);

export const recipeFactionSchema = z.enum([
  "alliance",
  "horde",
  "both",
  "unknown",
]);

export const recipeAvailabilitySchema = z.enum([
  "available",
  "unavailable",
  "unknown",
]);

export const recipeSourceKindSchema = z.enum([
  "trainer",
  "vendor",
  "quest",
  "container",
  "drop",
]);

export const recipeEvidenceOriginSchema = z.enum([
  "forever",
  "classic",
  "classic-borrowed",
  "unknown",
]);

export const canonicalRecipeMetadataSchema = z.object({
  spellId: z.number().int().positive(),
  learnSkill: z.number().int().nonnegative().nullable(),
  borrowedLearnSkill: z.number().int().nonnegative().nullable().optional(),
  acquisition: recipeAcquisitionSchema,
  teachingItemId: z.number().int().positive().nullable().optional(),
  sourceKinds: z.array(recipeSourceKindSchema).optional(),
  sourceDataOrigin: recipeEvidenceOriginSchema.optional(),
  hiddenStatus: z.boolean().nullable().optional(),
  hiddenDataOrigin: recipeEvidenceOriginSchema.optional(),
  orangeSkillKnown: z.boolean().optional(),
  faction: recipeFactionSchema,
  specializationSpellId: z.number().int().positive().nullable(),
  cooldownSeconds: z.number().int().positive().nullable(),
  availability: recipeAvailabilitySchema,
});

export const provenanceSchema = z.object({
  source: dataSourceKindSchema,
  sourceLabel: z.string().min(1),
  verification: verificationSchema.omit({ id: true }),
  notes: z.string().min(1).optional(),
});

export const professionModelSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
});

export const itemClientSourceSchema = z.object({
  product: z.string().min(1),
  build: z.string().min(1),
  locale: z.string().min(1),
});

export const itemClassificationSchema = z.object({
  id: z.number().int().positive(),
  label: z.string().min(1),
  color: z.number().int(),
  source: itemClientSourceSchema,
});

export const itemStatSchema = z.object({
  statId: z.number().int().nonnegative(),
  value: z.number().int(),
  displayText: z.string().min(1),
  displayTone: z.enum(["attribute", "effect"]),
});

export const itemClientDataSchema = z.object({
  displayName: z.string().min(1),
  qualityId: z.number().int().nonnegative().optional(),
  equipmentSlot: z.string().min(1).optional(),
  armor: z.number().int().nonnegative().optional(),
  stats: z.array(itemStatSchema).max(10).optional(),
  requiredLevel: z.number().int().nonnegative(),
  sellPriceCopper: z.number().int().nonnegative(),
  source: itemClientSourceSchema,
});

export const itemModelSchema = z.object({
  id: z.string().min(1),
  gameId: z.number().int().nonnegative().optional(),
  name: z.string().min(1),
  itemClassId: z.number().int().nonnegative().optional(),
  itemSubClassId: z.number().int().nonnegative().optional(),
  inventoryType: z.string().min(1).optional(),
  classification: itemClassificationSchema.optional(),
  clientData: itemClientDataSchema.optional(),
}).superRefine((item, context) => {
  if (
    item.clientData !== undefined &&
    (item.itemClassId === undefined ||
      item.itemSubClassId === undefined ||
      item.inventoryType === undefined)
  ) {
    context.addIssue({
      code: "custom",
      path: ["clientData"],
      message: "Client-enriched items require class, subclass, and inventory type metadata.",
    });
  }
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

export const recipeMetadataSchema = canonicalRecipeMetadataSchema.extend({
  recipeVersionId: z.string().min(1),
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

export const importedRecipeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    metadata: canonicalRecipeMetadataSchema,
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
  })
  .superRefine(({ id, metadata }, context) => {
    if (id.startsWith("spell-") && id !== `spell-${metadata.spellId}`) {
      context.addIssue({
        code: "custom",
        path: ["metadata", "spellId"],
        message: "Canonical recipe spellId must match its spell-based recipe ID.",
      });
    }
  });

export const importedProfessionSchema = professionModelSchema.extend({
  recipes: z.array(importedRecipeSchema),
});

export const importedBuildDatasetSchema = z.object({
  build: wowBuildSchema,
  sources: z.array(dataSourceSchema).min(1),
  professions: z.array(importedProfessionSchema),
});

export const importedRecipeOverrideSchema = z.object({
  id: z.string().min(1),
  metadata: canonicalRecipeMetadataSchema.partial().optional(),
  thresholds: skillThresholdsSchema.optional(),
  sourceId: z.string().min(1),
  verification: verificationSchema.omit({ id: true }),
  provenanceNotes: z.string().min(1).optional(),
});

export const importedRecipeOverridesSchema = z.object({
  version: z.literal(1),
  sources: z.array(dataSourceSchema),
  recipes: z.array(importedRecipeOverrideSchema),
});

export const normalizedBuildSchema = z.object({
  build: wowBuildSchema,
  sources: z.array(dataSourceSchema),
  professions: z.array(professionModelSchema),
  items: z.array(itemModelSchema),
  recipes: z.array(recipeModelSchema),
  recipeVersions: z.array(recipeVersionSchema),
  recipeMetadata: z.array(recipeMetadataSchema),
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
      medianUnitPriceCopper: z.number().int().positive().optional(),
      minimumBuyoutUnitPriceCopper: z.number().int().positive().optional(),
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

export const auctionMarketsResponseSchema = z.object({
  markets: z.array(auctionMarketSchema),
});

export const auctionPricesResponseSchema = z.object({
  marketId: z.string().min(1),
  observations: z.array(auctionPriceObservationSchema),
});

export const routeObjectiveSchema = z.enum(["cost", "crafts", "materials"]);

export const routeConfidencePolicySchema = z.enum([
  "practical",
  "supported-only",
]);

const recipeIdSelectionSchema = z.array(z.string().min(1)).max(3_000);

export const routeConstraintsSchema = z.object({
  faction: z.enum(["alliance", "horde"]).optional(),
  specializationSpellIds: z.array(z.number().int().positive()).max(100).optional(),
  professionBranchId: z.string().min(1).optional(),
  knownRecipeIds: recipeIdSelectionSchema.optional(),
  trainerOnly: z.boolean().optional(),
  excludedRecipeIds: recipeIdSelectionSchema.optional(),
  excludedItemIds: recipeIdSelectionSchema.optional(),
  allowUnknownAcquisition: z.boolean().optional(),
  allowUnknownAvailability: z.boolean().optional(),
  allowUnknownFaction: z.boolean().optional(),
  allowCooldowns: z.boolean().optional(),
});

const routePenaltyRatioSchema = z.number().min(0).max(1);

export const routeAcquisitionPenaltyRatiosSchema = z.object({
  automatic: routePenaltyRatioSchema.optional(),
  trainer: routePenaltyRatioSchema.optional(),
  vendor: routePenaltyRatioSchema.optional(),
  quest: routePenaltyRatioSchema.optional(),
  drop: routePenaltyRatioSchema.optional(),
  reputation: routePenaltyRatioSchema.optional(),
  unknown: routePenaltyRatioSchema.optional(),
});

export const routeOptimizationPolicySchema = z.object({
  switchPenaltyRatio: routePenaltyRatioSchema.optional(),
  acquisitionPenaltyRatios: routeAcquisitionPenaltyRatiosSchema.optional(),
  specializationPenaltyRatio: routePenaltyRatioSchema.optional(),
  cooldownPenaltyRatio: routePenaltyRatioSchema.optional(),
});

export const routeOptimizationRequestSchema = z
  .object({
    professionId: z.string().min(1),
    marketId: z.string().min(1).optional(),
    startSkill: z.number().int().nonnegative(),
    targetSkill: z.number().int().nonnegative(),
    objective: routeObjectiveSchema,
    confidencePolicy: routeConfidencePolicySchema.optional(),
    constraints: routeConstraintsSchema.optional(),
    policy: routeOptimizationPolicySchema.optional(),
  })
  .superRefine(({ startSkill, targetSkill, objective, marketId }, context) => {
    if (targetSkill < startSkill) {
      context.addIssue({
        code: "custom",
        path: ["targetSkill"],
        message: "targetSkill must be at least startSkill.",
      });
    }
    if (targetSkill - startSkill > 500) {
      context.addIssue({
        code: "custom",
        path: ["targetSkill"],
        message: "A route may cover at most 500 skill points.",
      });
    }
    if (objective === "cost" && marketId === undefined) {
      context.addIssue({
        code: "custom",
        path: ["marketId"],
        message: "marketId is required for cost optimization.",
      });
    }
  });

export const routeSkillStepSchema = z.object({
  skill: z.number().int().nonnegative(),
  recipeId: z.string().min(1),
  recipeName: z.string().min(1),
  skillUpProbability: z.number().positive().max(1),
  expectedCrafts: z.number().positive(),
  expectedMaterials: z.number().nonnegative(),
  expectedCostCopper: z.number().nonnegative().optional(),
});

export const routeEvidenceReasonSchema = z.enum([
  "unknown-acquisition",
  "unknown-availability",
  "classic-fallback",
  "unverified-recipe",
  "rejected-recipe",
]);

export const routeRecipeEvidenceSchema = z.object({
  level: z.enum(["verified", "unverified", "fallback", "unknown", "rejected"]),
  reasons: z.array(routeEvidenceReasonSchema).max(5),
  acquisition: recipeAcquisitionSchema,
  availability: recipeAvailabilitySchema,
  provenanceSource: dataSourceKindSchema,
  verificationStatus: verificationStatusSchema,
});

export const routeAlternativeSchema = z.object({
  recipeId: z.string().min(1),
  recipeName: z.string().min(1),
  startSkill: z.number().int().nonnegative(),
  endSkill: z.number().int().nonnegative(),
  expectedSkillUps: z.number().int().positive(),
  expectedCrafts: z.number().positive(),
  expectedMaterials: z.number().nonnegative(),
  expectedCostCopper: z.number().nonnegative().optional(),
  evidence: routeRecipeEvidenceSchema,
});

export const routeSegmentSchema = routeAlternativeSchema.extend({
  alternatives: z.array(routeAlternativeSchema).max(6).default([]),
});

export const routeTotalsSchema = z.object({
  expectedSkillUps: z.number().int().nonnegative(),
  expectedCrafts: z.number().nonnegative(),
  expectedMaterials: z.number().nonnegative(),
  expectedCostCopper: z.number().nonnegative().optional(),
});

const routeOptimizationResultBase = {
  objective: routeObjectiveSchema,
  confidencePolicy: routeConfidencePolicySchema,
  startSkill: z.number().int().nonnegative(),
  targetSkill: z.number().int().nonnegative(),
  steps: z.array(routeSkillStepSchema),
  segments: z.array(routeSegmentSchema),
  totals: routeTotalsSchema,
} as const;

export const completeRouteOptimizationResultSchema = z.object({
  status: z.literal("complete"),
  ...routeOptimizationResultBase,
});

export const blockedRouteOptimizationResultSchema = z.object({
  status: z.literal("blocked"),
  ...routeOptimizationResultBase,
  blockedAtSkill: z.number().int().nonnegative(),
  reason: z.enum([
    "no-eligible-recipe",
    "missing-price-data",
    "unsupported-recipe-evidence",
  ]),
});

export const routeOptimizationResultSchema = z.discriminatedUnion("status", [
  completeRouteOptimizationResultSchema,
  blockedRouteOptimizationResultSchema,
]);

export const routeOptimizationResponseSchema = z.object({
  professionId: z.string().min(1),
  marketId: z.string().min(1).optional(),
  attribution: auctionPriceAttributionSchema.optional(),
  result: routeOptimizationResultSchema,
});

export const shoppingStrategySchema = z.enum([
  "cheapest",
  "buy-only",
  "craft-first",
]);

export const shoppingRouteCraftRequirementSchema = z.object({
  recipeId: z.string().min(1),
  expectedCrafts: z.number().positive().max(1_000_000),
});

export const shoppingListRequestSchema = z.object({
  professionId: z.string().min(1),
  marketId: z.string().min(1),
  route: z.array(shoppingRouteCraftRequirementSchema).min(1).max(500),
  strategy: shoppingStrategySchema.default("cheapest"),
  knownRecipeIds: recipeIdSelectionSchema.optional(),
});

export const shoppingQuantitySchema = z.object({
  itemId: z.string().min(1),
  itemName: z.string().min(1),
  quantity: z.number().positive(),
});

export const shoppingPurchaseSchema = shoppingQuantitySchema.extend({
  unitPriceCopper: z.number().int().positive(),
  expectedCostCopper: z.number().nonnegative(),
});

export const shoppingCraftSchema = z.object({
  recipeId: z.string().min(1),
  recipeName: z.string().min(1),
  outputItemId: z.string().min(1),
  outputItemName: z.string().min(1),
  expectedCrafts: z.number().positive(),
  expectedOutputQuantity: z.number().positive(),
});

export const unresolvedShoppingReasonSchema = z.enum([
  "missing-price",
  "no-source",
  "cycle-detected",
]);

export const unresolvedShoppingItemSchema = shoppingQuantitySchema.extend({
  reason: unresolvedShoppingReasonSchema,
});

export const shoppingPlanSchema = z
  .object({
    status: z.enum(["complete", "partial"]),
    strategy: shoppingStrategySchema,
    routeReagents: z.array(shoppingQuantitySchema),
    purchases: z.array(shoppingPurchaseSchema),
    crafts: z.array(shoppingCraftSchema),
    unresolved: z.array(unresolvedShoppingItemSchema),
    cycles: z.array(z.array(z.string().min(1)).min(2)),
    knownSubtotalCopper: z.number().nonnegative(),
    expectedCostCopper: z.number().nonnegative().optional(),
  })
  .superRefine(({ status, expectedCostCopper, unresolved }, context) => {
    if (status === "complete" && expectedCostCopper === undefined) {
      context.addIssue({
        code: "custom",
        path: ["expectedCostCopper"],
        message: "Complete shopping plans require an expected total.",
      });
    }
    if (status === "complete" && unresolved.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["unresolved"],
        message: "Complete shopping plans cannot contain unresolved items.",
      });
    }
  });

export const shoppingListResponseSchema = z.object({
  professionId: z.string().min(1),
  marketId: z.string().min(1),
  attribution: auctionPriceAttributionSchema.optional(),
  plan: shoppingPlanSchema,
});

export const reagentSchema = z.object({
  itemId: z.string().min(1),
  gameItemId: z.number().int().positive().optional(),
  name: z.string().min(1),
  itemClassId: z.number().int().nonnegative().optional(),
  itemSubClassId: z.number().int().nonnegative().optional(),
  inventoryType: z.string().min(1).optional(),
  classification: itemClassificationSchema.optional(),
  clientData: itemClientDataSchema.optional(),
  quantity: z.number().int().positive(),
});

export const fixtureRecipeOutputSchema = z.object({
  itemId: z.string().min(1),
  gameItemId: z.number().int().positive().optional(),
  name: z.string().min(1),
  itemClassId: z.number().int().nonnegative().optional(),
  itemSubClassId: z.number().int().nonnegative().optional(),
  inventoryType: z.string().min(1).optional(),
  classification: itemClassificationSchema.optional(),
  clientData: itemClientDataSchema.optional(),
  quantity: z.number().int().positive(),
});

export const recipeSchema = z.object({
  id: z.string().min(1),
  spellId: z.number().int().positive().nullable(),
  name: z.string().min(1),
  professionId: z.string().min(1),
  buildId: z.string().min(1),
  learnSkill: z.number().int().nonnegative().nullable(),
  acquisition: recipeAcquisitionSchema,
  faction: recipeFactionSchema,
  specializationSpellId: z.number().int().positive().nullable(),
  cooldownSeconds: z.number().int().positive().nullable(),
  availability: recipeAvailabilitySchema,
  thresholds: skillThresholdsSchema,
  reagents: z.array(reagentSchema),
  outputs: z.array(fixtureRecipeOutputSchema).min(1),
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
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
export type AuctionMarket = z.infer<typeof auctionMarketSchema>;
export type AuctionMarketsResponse = z.infer<typeof auctionMarketsResponseSchema>;
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
export type AuctionPricesResponse = z.infer<typeof auctionPricesResponseSchema>;
export type RouteConstraints = z.infer<typeof routeConstraintsSchema>;
export type RouteObjective = z.infer<typeof routeObjectiveSchema>;
export type RouteConfidencePolicy = z.infer<typeof routeConfidencePolicySchema>;
export type RouteEvidenceReason = z.infer<typeof routeEvidenceReasonSchema>;
export type RouteRecipeEvidence = z.infer<typeof routeRecipeEvidenceSchema>;
export type RouteOptimizationPolicy = z.infer<
  typeof routeOptimizationPolicySchema
>;
export type RouteOptimizationRequest = z.infer<
  typeof routeOptimizationRequestSchema
>;
export type RouteOptimizationResult = z.infer<
  typeof routeOptimizationResultSchema
>;
export type RouteOptimizationResponse = z.infer<
  typeof routeOptimizationResponseSchema
>;
export type RouteAlternative = z.infer<typeof routeAlternativeSchema>;
export type RouteSegment = z.infer<typeof routeSegmentSchema>;
export type RouteSkillStep = z.infer<typeof routeSkillStepSchema>;
export type ShoppingListRequest = z.infer<typeof shoppingListRequestSchema>;
export type ShoppingListResponse = z.infer<typeof shoppingListResponseSchema>;
export type ShoppingPlan = z.infer<typeof shoppingPlanSchema>;
export type ShoppingStrategy = z.infer<typeof shoppingStrategySchema>;
export type AvailableAuctionPriceObservation = z.infer<
  typeof availableAuctionPriceObservationSchema
>;
export type UnavailableAuctionPriceObservation = z.infer<
  typeof unavailableAuctionPriceObservationSchema
>;
export type DataSource = z.infer<typeof dataSourceSchema>;
export type DataSourceKind = z.infer<typeof dataSourceKindSchema>;
export type CanonicalRecipeMetadata = z.infer<
  typeof canonicalRecipeMetadataSchema
>;
export type ImportedBuildDataset = z.infer<typeof importedBuildDatasetSchema>;
export type ImportedRecipeOverride = z.infer<typeof importedRecipeOverrideSchema>;
export type ImportedRecipeOverrides = z.infer<typeof importedRecipeOverridesSchema>;
export type ImportedProfession = z.infer<typeof importedProfessionSchema>;
export type ImportedRecipe = z.infer<typeof importedRecipeSchema>;
export type ItemClientData = z.infer<typeof itemClientDataSchema>;
export type ItemClientSource = z.infer<typeof itemClientSourceSchema>;
export type ItemClassification = z.infer<typeof itemClassificationSchema>;
export type ItemStat = z.infer<typeof itemStatSchema>;
export type ItemModel = z.infer<typeof itemModelSchema>;
export type NormalizedBuild = z.infer<typeof normalizedBuildSchema>;
export type ProfessionModel = z.infer<typeof professionModelSchema>;
export type ProvenanceRecord = z.infer<typeof provenanceRecordSchema>;
export type RecipeProvenance = z.infer<typeof provenanceSchema>;
export type ProfessionFixture = z.infer<typeof professionFixtureSchema>;
export type ProfessionSummary = z.infer<typeof professionSummarySchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type RecipeModel = z.infer<typeof recipeModelSchema>;
export type RecipeMetadata = z.infer<typeof recipeMetadataSchema>;
export type RecipeAcquisition = z.infer<typeof recipeAcquisitionSchema>;
export type RecipeAvailability = z.infer<typeof recipeAvailabilitySchema>;
export type RecipeFaction = z.infer<typeof recipeFactionSchema>;
export type RecipeOutput = z.infer<typeof recipeOutputSchema>;
export type RecipeReagent = z.infer<typeof recipeReagentSchema>;
export type RecipeThreshold = z.infer<typeof recipeThresholdSchema>;
export type RecipeVersion = z.infer<typeof recipeVersionSchema>;
export type Verification = z.infer<typeof verificationSchema>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
export type WowBuild = z.infer<typeof wowBuildSchema>;
