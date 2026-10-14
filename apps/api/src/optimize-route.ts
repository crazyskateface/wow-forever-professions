import {
  routeOptimizationResponseSchema,
  type AuctionPriceAttribution,
  type ProfessionFixture,
  type RouteOptimizationRequest,
  type RouteOptimizationResponse,
} from "@forever-professions/contracts";
import {
  optimizeLevelingRoute,
  type RouteRecipe,
} from "@forever-professions/optimizer";
import type { CurrentAuctionPriceReader } from "@forever-professions/pricing";

export class RoutePricingUnavailableError extends Error {
  constructor(message = "Auction pricing is required for cost optimization.") {
    super(message);
    this.name = "RoutePricingUnavailableError";
  }
}

type PriceObservation = Awaited<
  ReturnType<CurrentAuctionPriceReader["getCurrentPrices"]>
>[number];

function unitPrice(observation: PriceObservation | undefined): number | undefined {
  if (observation?.status !== "available") return undefined;
  return observation.minimumBuyoutUnitPriceCopper ?? observation.medianUnitPriceCopper;
}

const SCARCE_ITEM_CLASSIFICATION = "scarce";

export function getScarceLevelingReagentItemIds(
  profession: ProfessionFixture,
): readonly string[] {
  return [
    ...new Set(
      profession.recipes.flatMap(({ reagents }) =>
        reagents.flatMap(({ itemId, classification }) =>
          classification?.label.trim().toLowerCase() === SCARCE_ITEM_CLASSIFICATION
            ? [itemId]
            : [],
        ),
      ),
    ),
  ];
}

export async function optimizeFixtureRoute(
  request: RouteOptimizationRequest,
  profession: ProfessionFixture,
  pricing?: CurrentAuctionPriceReader,
): Promise<RouteOptimizationResponse> {
  const pricesByGameItemId = new Map<number, number>();
  let attribution: AuctionPriceAttribution | undefined;

  if (request.objective === "cost") {
    if (pricing === undefined || request.marketId === undefined) {
      throw new RoutePricingUnavailableError();
    }
    const gameItemIds = [
      ...new Set(
        profession.recipes.flatMap(({ reagents }) =>
          reagents.flatMap(({ gameItemId }) =>
            gameItemId === undefined ? [] : [gameItemId],
          ),
        ),
      ),
    ];
    const observations = await pricing.getCurrentPrices({
      marketId: request.marketId,
      gameItemIds,
    });
    for (const observation of observations) {
      const price = unitPrice(observation);
      if (price !== undefined) pricesByGameItemId.set(observation.gameItemId, price);
      attribution ??= observation.attribution;
    }
  }

  const recipes: RouteRecipe[] = profession.recipes.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    professionId: recipe.professionId,
    buildId: recipe.buildId,
    learnSkill: recipe.learnSkill,
    availability: recipe.availability,
    thresholds: recipe.thresholds,
    acquisition: recipe.acquisition,
    faction: recipe.faction,
    specializationSpellId: recipe.specializationSpellId,
    cooldownSeconds: recipe.cooldownSeconds,
    reagents: recipe.reagents.map((reagent) => {
      const price =
        reagent.gameItemId === undefined
          ? undefined
          : pricesByGameItemId.get(reagent.gameItemId);
      return {
        itemId: reagent.itemId,
        quantity: reagent.quantity,
        ...(price === undefined ? {} : { unitPriceCopper: price }),
      };
    }),
  }));
  const constraints =
    request.constraints === undefined
      ? undefined
      : {
          ...(request.constraints.faction === undefined
            ? {}
            : { faction: request.constraints.faction }),
          ...(request.constraints.specializationSpellIds === undefined
            ? {}
            : {
                specializationSpellIds:
                  request.constraints.specializationSpellIds,
              }),
          ...(request.constraints.professionBranchId === undefined
            ? {}
            : { professionBranchId: request.constraints.professionBranchId }),
          ...(request.constraints.knownRecipeIds === undefined
            ? {}
            : { knownRecipeIds: request.constraints.knownRecipeIds }),
          ...(request.constraints.trainerOnly === undefined
            ? {}
            : { trainerOnly: request.constraints.trainerOnly }),
          ...(request.constraints.excludedRecipeIds === undefined
            ? {}
            : { excludedRecipeIds: request.constraints.excludedRecipeIds }),
          ...(request.constraints.excludedItemIds === undefined
            ? {}
            : { excludedItemIds: request.constraints.excludedItemIds }),
          ...(request.constraints.allowUnknownAvailability === undefined
            ? {}
            : {
                allowUnknownAvailability:
                  request.constraints.allowUnknownAvailability,
              }),
          ...(request.constraints.allowUnknownFaction === undefined
            ? {}
            : { allowUnknownFaction: request.constraints.allowUnknownFaction }),
          ...(request.constraints.allowCooldowns === undefined
            ? {}
            : { allowCooldowns: request.constraints.allowCooldowns }),
        };

  return routeOptimizationResponseSchema.parse({
    professionId: profession.id,
    ...(request.marketId === undefined ? {} : { marketId: request.marketId }),
    ...(attribution === undefined ? {} : { attribution }),
    result: optimizeLevelingRoute({
      professionId: profession.id,
      buildId: profession.build,
      startSkill: request.startSkill,
      targetSkill: request.targetSkill,
      objective: request.objective,
      recipes,
      scarceItemIds: getScarceLevelingReagentItemIds(profession),
      ...(constraints === undefined ? {} : { constraints }),
      ...(request.policy === undefined ? {} : { policy: request.policy }),
    }),
  });
}
