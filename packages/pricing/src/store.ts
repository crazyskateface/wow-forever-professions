import {
  auctionMarketSchema,
  auctionPriceObservationSchema,
  auctionPriceRequestSchema,
  type AuctionMarket,
  type AuctionPriceObservation,
  type AuctionPriceRequest,
} from "@forever-professions/contracts";
import {
  createDsqlBatches,
  type DsqlBatchOptions,
  type SqlExecutor,
  type TransactionRunner,
} from "@forever-professions/ingestion";
import type { AuctionPricingRepository } from "./types.js";

export interface DsqlAuctionPricingRepositoryOptions extends DsqlBatchOptions {}

function asString(value: unknown, column: string): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  throw new Error(`Expected ${column} to be a string.`);
}

function asNumber(value: unknown, column: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected ${column} to be numeric.`);
  return parsed;
}

function optionalNumber(value: unknown, column: string): number | undefined {
  return value === null || value === undefined ? undefined : asNumber(value, column);
}

function optionalString(value: unknown, column: string): string | undefined {
  return value === null || value === undefined ? undefined : asString(value, column);
}

function toMarket(row: Readonly<Record<string, unknown>>): AuctionMarket {
  return auctionMarketSchema.parse({
    id: row.market_id,
    provider: row.provider,
    game: row.game,
    ruleset: row.ruleset,
    faction: row.faction,
    region: row.region,
    label: row.label,
  });
}

function toObservation(row: Readonly<Record<string, unknown>>): AuctionPriceObservation {
  const base = {
    provider: row.provider,
    marketId: row.market_id,
    gameItemId: asNumber(row.game_item_id, "game_item_id"),
    fetchedAt: asString(row.fetched_at, "fetched_at"),
    ...(row.attribution_text === null || row.attribution_url === null
      ? {}
      : {
          attribution: {
            text: asString(row.attribution_text, "attribution_text"),
            url: asString(row.attribution_url, "attribution_url"),
          },
        }),
  };

  if (row.status === "unavailable") {
    return auctionPriceObservationSchema.parse({
      ...base,
      status: "unavailable",
      reason: asString(row.unavailable_reason, "unavailable_reason"),
    });
  }

  return auctionPriceObservationSchema.parse({
    ...base,
    status: "available",
    observedAt: asString(row.observed_at, "observed_at"),
    ...(optionalNumber(row.median_unit_price_copper, "median_unit_price_copper") ===
    undefined
      ? {}
      : {
          medianUnitPriceCopper: optionalNumber(
            row.median_unit_price_copper,
            "median_unit_price_copper",
          ),
        }),
    ...(optionalNumber(
      row.minimum_buyout_unit_price_copper,
      "minimum_buyout_unit_price_copper",
    ) === undefined
      ? {}
      : {
          minimumBuyoutUnitPriceCopper: optionalNumber(
            row.minimum_buyout_unit_price_copper,
            "minimum_buyout_unit_price_copper",
          ),
        }),
    ...(optionalNumber(row.quantity, "quantity") === undefined
      ? {}
      : { quantity: optionalNumber(row.quantity, "quantity") }),
    ...(optionalNumber(row.estimated_sales_per_day, "estimated_sales_per_day") ===
    undefined
      ? {}
      : {
          estimatedSalesPerDay: optionalNumber(
            row.estimated_sales_per_day,
            "estimated_sales_per_day",
          ),
        }),
  });
}

async function assertMarketProvider(
  database: SqlExecutor,
  marketId: string,
  provider: string,
): Promise<void> {
  const result = await database.query(
    "SELECT provider FROM auction_market WHERE market_id = $1",
    [marketId],
  );
  if (result.rowCount !== 1 || result.rows[0]?.provider !== provider) {
    throw new Error(`Market ${marketId} is not registered for provider ${provider}.`);
  }
}

export class DsqlAuctionPricingRepository implements AuctionPricingRepository {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly options: DsqlAuctionPricingRepositoryOptions = {},
  ) {}

  async upsertMarkets(
    input: readonly AuctionMarket[],
    refreshedAt = new Date().toISOString(),
  ): Promise<void> {
    const markets = input.map((market) => auctionMarketSchema.parse(market));
    for (const batch of createDsqlBatches(markets, this.options)) {
      await this.runner.transaction(async (database) => {
        for (const market of batch) {
          const current = await database.query(
            "SELECT provider FROM auction_market WHERE market_id = $1",
            [market.id],
          );
          const currentProvider = optionalString(current.rows[0]?.provider, "provider");
          if (currentProvider !== undefined && currentProvider !== market.provider) {
            throw new Error(
              `Market ${market.id} already belongs to provider ${currentProvider}.`,
            );
          }
          await database.query(
            "INSERT INTO auction_market (market_id, provider, game, ruleset, faction, region, label, refreshed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (market_id) DO UPDATE SET game = EXCLUDED.game, ruleset = EXCLUDED.ruleset, faction = EXCLUDED.faction, region = EXCLUDED.region, label = EXCLUDED.label, refreshed_at = EXCLUDED.refreshed_at",
            [
              market.id,
              market.provider,
              market.game,
              market.ruleset,
              market.faction,
              market.region,
              market.label,
              refreshedAt,
            ],
          );
        }
      });
    }
  }

  async upsertCurrentPrices(input: readonly AuctionPriceObservation[]): Promise<void> {
    const observations = input.map((observation) =>
      auctionPriceObservationSchema.parse(observation),
    );
    for (const batch of createDsqlBatches(observations, this.options)) {
      await this.runner.transaction(async (database) => {
        for (const observation of batch) {
          await assertMarketProvider(
            database,
            observation.marketId,
            observation.provider,
          );
          const current = await database.query(
            "SELECT fetched_at FROM auction_price_current WHERE provider = $1 AND market_id = $2 AND game_item_id = $3",
            [observation.provider, observation.marketId, observation.gameItemId],
          );
          const currentFetchedAt = optionalString(
            current.rows[0]?.fetched_at,
            "fetched_at",
          );
          if (
            currentFetchedAt !== undefined &&
            Date.parse(currentFetchedAt) > Date.parse(observation.fetchedAt)
          ) {
            continue;
          }

          const available = observation.status === "available";
          await database.query(
            "INSERT INTO auction_price_current (provider, market_id, game_item_id, status, observed_at, fetched_at, median_unit_price_copper, minimum_buyout_unit_price_copper, quantity, estimated_sales_per_day, unavailable_reason, attribution_text, attribution_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (provider, market_id, game_item_id) DO UPDATE SET status = EXCLUDED.status, observed_at = EXCLUDED.observed_at, fetched_at = EXCLUDED.fetched_at, median_unit_price_copper = EXCLUDED.median_unit_price_copper, minimum_buyout_unit_price_copper = EXCLUDED.minimum_buyout_unit_price_copper, quantity = EXCLUDED.quantity, estimated_sales_per_day = EXCLUDED.estimated_sales_per_day, unavailable_reason = EXCLUDED.unavailable_reason, attribution_text = EXCLUDED.attribution_text, attribution_url = EXCLUDED.attribution_url",
            [
              observation.provider,
              observation.marketId,
              observation.gameItemId,
              observation.status,
              available ? observation.observedAt : null,
              observation.fetchedAt,
              available ? observation.medianUnitPriceCopper ?? null : null,
              available ? observation.minimumBuyoutUnitPriceCopper ?? null : null,
              available ? observation.quantity ?? null : null,
              available ? observation.estimatedSalesPerDay ?? null : null,
              available ? null : observation.reason,
              observation.attribution?.text ?? null,
              observation.attribution?.url ?? null,
            ],
          );
        }
      });
    }
  }

  async listMarkets(): Promise<readonly AuctionMarket[]> {
    return this.runner.transaction(async (database) => {
      const result = await database.query(
        "SELECT market_id, provider, game, ruleset, faction, region, label FROM auction_market ORDER BY label, market_id",
      );
      return result.rows.map(toMarket);
    });
  }

  async getCurrentPrices(
    input: AuctionPriceRequest,
  ): Promise<readonly AuctionPriceObservation[]> {
    const request = auctionPriceRequestSchema.parse(input);
    const gameItemIds = [...new Set(request.gameItemIds)];
    const placeholders = gameItemIds.map((_, index) => `$${index + 2}`).join(", ");
    return this.runner.transaction(async (database) => {
      const result = await database.query(
        `SELECT provider, market_id, game_item_id, status, observed_at, fetched_at, median_unit_price_copper, minimum_buyout_unit_price_copper, quantity, estimated_sales_per_day, unavailable_reason, attribution_text, attribution_url FROM auction_price_current WHERE market_id = $1 AND game_item_id IN (${placeholders}) ORDER BY game_item_id`,
        [request.marketId, ...gameItemIds],
      );
      return result.rows.map(toObservation);
    });
  }

  async listTrackedGameItemIds(): Promise<readonly number[]> {
    return this.runner.transaction(async (database) => {
      const result = await database.query(
        "SELECT DISTINCT game_id FROM item WHERE game_id IS NOT NULL ORDER BY game_id",
      );
      return result.rows.map((row) => asNumber(row.game_id, "game_id"));
    });
  }
}
