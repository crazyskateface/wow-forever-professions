import type { ScheduledEvent } from "aws-lambda";
import { createAuroraDsqlTransactionRunner } from "@forever-professions/ingestion";
import {
  AhLedgerAuctionPriceProvider,
  DsqlAuctionPricingRepository,
  refreshAuctionPrices,
} from "@forever-professions/pricing";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function configuredItemIds(): readonly number[] {
  const raw = process.env.AUCTION_ITEM_IDS?.trim();
  if (!raw) return [];
  const ids = raw.split(",").map((value) => Number(value.trim()));
  if (ids.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error("AUCTION_ITEM_IDS must contain positive integer IDs.");
  }
  return [...new Set(ids)];
}

const endpoint = requiredEnvironment("DSQL_ENDPOINT");
const region = requiredEnvironment("AWS_REGION");
const databaseRole = requiredEnvironment("PRICING_DATABASE_ROLE");
const marketId = requiredEnvironment("AUCTION_MARKET_ID");
const runner = createAuroraDsqlTransactionRunner({
  host: endpoint,
  user: databaseRole,
  region,
  maxConnections: 2,
  idleTimeoutMilliseconds: 45_000,
});
const repository = new DsqlAuctionPricingRepository(runner);
const provider = new AhLedgerAuctionPriceProvider();

export async function handler(event: ScheduledEvent): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const markets = await provider.listMarkets(controller.signal);
    const market = markets.find(({ id }) => id === marketId);
    if (!market) throw new Error(`AH Ledger did not return configured market ${marketId}.`);
    await repository.upsertMarkets([market]);

    const configured = configuredItemIds();
    const gameItemIds =
      configured.length > 0 ? configured : await repository.listTrackedGameItemIds();
    if (gameItemIds.length === 0) {
      const result = { status: "skipped", reason: "no-tracked-items", marketId };
      console.log(JSON.stringify({ eventId: event.id, ...result }));
      return result;
    }

    const report = await refreshAuctionPrices(
      provider,
      repository,
      { marketId, gameItemIds: [...gameItemIds] },
      { signal: controller.signal },
    );
    console.log(JSON.stringify({ eventId: event.id, status: "completed", ...report }));
    return report;
  } catch (error) {
    console.error(
      JSON.stringify({
        eventId: event.id,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
