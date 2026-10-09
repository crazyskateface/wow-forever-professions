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
    learnSkill: recipe.learnSkill,
    availability: recipe.availability,
    thresholds: recipe.thresholds,
    acquisition: recipe.acquisition,
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
        };

  return routeOptimizationResponseSchema.parse({
    professionId: profession.id,
    ...(request.marketId === undefined ? {} : { marketId: request.marketId }),
    ...(attribution === undefined ? {} : { attribution }),
    result: optimizeLevelingRoute({
      startSkill: request.startSkill,
      targetSkill: request.targetSkill,
      objective: request.objective,
      recipes,
      ...(constraints === undefined ? {} : { constraints }),
    }),
  });
}
