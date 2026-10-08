import {
  auctionMarketSchema,
  auctionPriceObservationSchema,
  auctionPriceRequestSchema,
  type AuctionMarket,
  type AuctionPriceObservation,
  type AuctionPriceRequest,
} from "@forever-professions/contracts";
import { z } from "zod";
import type { AuctionPriceProvider } from "./types.js";

const AH_LEDGER_BATCH_SIZE = 100;

const ahLedgerMarketSchema = z.object({
  id: z.string().min(1),
  game: z.string().min(1),
  ruleset: z.string().min(1),
  faction: z.string().min(1),
  region: z.string().min(1),
  label: z.string().min(1),
});

const ahLedgerMarketsResponseSchema = z.object({
  markets: z.array(ahLedgerMarketSchema),
});

const ahLedgerTooltipItemSchema = z.object({
  id: z.number().int().positive(),
  median: z.number().int().nonnegative().nullable(),
  minBuyout: z.number().int().nonnegative().nullable(),
  quantity: z.number().int().nonnegative().nullable(),
  observedAt: z.iso.datetime().nullable(),
  salesPerDay: z.number().nonnegative().nullable(),
});

const ahLedgerTooltipResponseSchema = z.object({
  market: z.object({
    slug: z.string().min(1),
    label: z.string().min(1),
  }),
  items: z.array(ahLedgerTooltipItemSchema),
});

export interface AhLedgerAuctionPriceProviderOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => Date;
}

export class AuctionPriceProviderError extends Error {
  readonly provider = "ah-ledger" as const;

  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AuctionPriceProviderError";
  }
}

function uniqueItemIds(itemIds: readonly number[]): number[] {
  return [...new Set(itemIds)];
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds >= 0 ? seconds : undefined;
}

function marketIdFromSlug(slug: string): string {
  return slug.replaceAll("/", ".");
}

function attributionFor(marketId: string) {
  const url = new URL("https://ahledger.com/");
  url.searchParams.set("market", marketId.replaceAll(".", "/"));
  url.searchParams.set("utm_source", "forever-professions");
  return { text: "Prices from AHledger", url: url.toString() } as const;
}

export class AhLedgerAuctionPriceProvider implements AuctionPriceProvider {
  readonly id = "ah-ledger" as const;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly now: () => Date;

  constructor(options: AhLedgerAuctionPriceProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.ahledger.com";
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? (() => new Date());
  }

  async listMarkets(signal?: AbortSignal): Promise<readonly AuctionMarket[]> {
    const response = await this.getJson("/v1/markets", signal);
    const parsed = ahLedgerMarketsResponseSchema.parse(response);
    return parsed.markets.map((market) =>
      auctionMarketSchema.parse({ ...market, provider: this.id }),
    );
  }

  async getCurrentPrices(
    input: AuctionPriceRequest,
    signal?: AbortSignal,
  ): Promise<readonly AuctionPriceObservation[]> {
    const request = auctionPriceRequestSchema.parse(input);
    const itemIds = uniqueItemIds(request.gameItemIds);
    const fetchedAt = this.now().toISOString();
    const returnedItems = new Map<
      number,
      z.infer<typeof ahLedgerTooltipItemSchema>
    >();

    for (const batch of chunks(itemIds, AH_LEDGER_BATCH_SIZE)) {
      const path = `/v1/tooltip/${encodeURIComponent(request.marketId)}?items=${batch.join(",")}`;
      const response = ahLedgerTooltipResponseSchema.parse(
        await this.getJson(path, signal),
      );
      if (marketIdFromSlug(response.market.slug) !== request.marketId) {
        throw new AuctionPriceProviderError(
          `AH Ledger returned market ${response.market.slug} for ${request.marketId}.`,
        );
      }
      for (const item of response.items) returnedItems.set(item.id, item);
    }

    return itemIds.map((gameItemId) => {
      const item = returnedItems.get(gameItemId);
      const base = {
        provider: this.id,
        marketId: request.marketId,
        gameItemId,
        fetchedAt,
        attribution: attributionFor(request.marketId),
      } as const;

      if (item === undefined) {
        return auctionPriceObservationSchema.parse({
          ...base,
          status: "unavailable",
          reason: "item-not-found",
        });
      }

      const median = item.median && item.median > 0 ? item.median : undefined;
      const minimumBuyout =
        item.minBuyout && item.minBuyout > 0 ? item.minBuyout : undefined;

      if (
        item.observedAt === null ||
        (median === undefined && minimumBuyout === undefined)
      ) {
        return auctionPriceObservationSchema.parse({
          ...base,
          status: "unavailable",
          reason: "no-market-data",
        });
      }

      return auctionPriceObservationSchema.parse({
        ...base,
        status: "available",
        observedAt: item.observedAt,
        ...(median === undefined ? {} : { medianUnitPriceCopper: median }),
        ...(minimumBuyout === undefined
          ? {}
          : { minimumBuyoutUnitPriceCopper: minimumBuyout }),
        ...(item.quantity === null ? {} : { quantity: item.quantity }),
        ...(item.salesPerDay === null
          ? {}
          : { estimatedSalesPerDay: item.salesPerDay }),
      });
    });
  }

  private async getJson(path: string, signal?: AbortSignal): Promise<unknown> {
    const headers = new Headers({ accept: "application/json" });
    if (this.apiKey !== undefined) {
      headers.set("authorization", `Bearer ${this.apiKey}`);
    }
    const response = await this.fetchImpl(new URL(path, this.baseUrl), {
      headers,
      ...(signal === undefined ? {} : { signal }),
    });
    if (!response.ok) {
      throw new AuctionPriceProviderError(
        `AH Ledger request failed with HTTP ${response.status}.`,
        response.status,
        parseRetryAfter(response.headers.get("retry-after")),
      );
    }
    return response.json();
  }
}
