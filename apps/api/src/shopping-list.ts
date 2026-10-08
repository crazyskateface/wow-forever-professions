import {
  shoppingListResponseSchema,
  type AuctionPriceAttribution,
  type ProfessionFixture,
  type ShoppingListRequest,
  type ShoppingListResponse,
} from "@forever-professions/contracts";
import type { CurrentAuctionPriceReader } from "@forever-professions/pricing";
import {
  planShoppingList,
  type ShoppingItem,
  type ShoppingRecipe,
} from "@forever-professions/shopping";

export class ShoppingPricingUnavailableError extends Error {
  constructor(message = "Auction pricing is required for a shopping list.") {
    super(message);
    this.name = "ShoppingPricingUnavailableError";
  }
}

export class ShoppingRouteInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShoppingRouteInvalidError";
  }
}

type PriceObservation = Awaited<
  ReturnType<CurrentAuctionPriceReader["getCurrentPrices"]>
>[number];

function unitPrice(observation: PriceObservation | undefined): number | undefined {
  if (observation?.status !== "available") return undefined;
  return observation.minimumBuyoutUnitPriceCopper ?? observation.medianUnitPriceCopper;
}

export async function buildFixtureShoppingList(
  request: ShoppingListRequest,
  profession: ProfessionFixture,
  pricing?: CurrentAuctionPriceReader,
): Promise<ShoppingListResponse> {
  if (pricing === undefined) throw new ShoppingPricingUnavailableError();

  const recipeIds = new Set(profession.recipes.map(({ id }) => id));
  const unknownRecipe = request.route.find(({ recipeId }) => !recipeIds.has(recipeId));
  if (unknownRecipe !== undefined) {
    throw new ShoppingRouteInvalidError(
      `Route references unknown recipe ${unknownRecipe.recipeId}.`,
    );
  }

  const fixtureItems = new Map<
    string,
    { readonly name: string; readonly gameItemId?: number }
  >();
  for (const recipe of profession.recipes) {
    for (const item of [...recipe.reagents, ...recipe.outputs]) {
      if (!fixtureItems.has(item.itemId)) {
        fixtureItems.set(item.itemId, {
          name: item.name,
          ...(item.gameItemId === undefined ? {} : { gameItemId: item.gameItemId }),
        });
      }
    }
  }

  const gameItemIds = [
    ...new Set(
      [...fixtureItems.values()].flatMap(({ gameItemId }) =>
        gameItemId === undefined ? [] : [gameItemId],
      ),
    ),
  ];
  const observations =
    gameItemIds.length === 0
      ? []
      : await pricing.getCurrentPrices({ marketId: request.marketId, gameItemIds });
  const pricesByGameItemId = new Map<number, number>();
  let attribution: AuctionPriceAttribution | undefined;
  for (const observation of observations) {
    const price = unitPrice(observation);
    if (price !== undefined) pricesByGameItemId.set(observation.gameItemId, price);
    attribution ??= observation.attribution;
  }

  const items: ShoppingItem[] = [...fixtureItems].map(([id, item]) => {
    const price =
      item.gameItemId === undefined
        ? undefined
        : pricesByGameItemId.get(item.gameItemId);
    return {
      id,
      name: item.name,
      ...(price === undefined ? {} : { unitPriceCopper: price }),
    };
  });
  const recipes: ShoppingRecipe[] = profession.recipes.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    reagents: recipe.reagents.map(({ itemId, quantity }) => ({ itemId, quantity })),
    outputs: recipe.outputs.map(({ itemId, quantity }) => ({ itemId, quantity })),
  }));

  return shoppingListResponseSchema.parse({
    professionId: profession.id,
    marketId: request.marketId,
    ...(attribution === undefined ? {} : { attribution }),
    plan: planShoppingList({
      route: request.route,
      recipes,
      items,
      strategy: request.strategy,
      ...(request.knownRecipeIds === undefined
        ? {}
        : { knownRecipeIds: request.knownRecipeIds }),
    }),
  });
}
