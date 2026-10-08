# Phase 3 auction pricing

## Current slice

`@forever-professions/pricing` separates auction vendors from the application with an `AuctionPriceProvider` interface:

```text
AH Ledger / manual / no-price
              |
     AuctionPriceProvider
              |
 normalized observations in copper
              |
     CurrentAuctionPriceStore
```

The refresh coordinator requires exactly one available or unavailable observation for every requested game item before it calls the store. This prevents a partial provider response from silently becoming a partial refresh.

AH Ledger is the first live adapter because its public API exposes Forever markets directly. It supports unauthenticated access, asks clients to honor cache and retry headers, and requires visible attribution wherever its data is shown. The adapter batches the tooltip endpoint at its documented 100-item limit and preserves `Retry-After` on HTTP errors. See [AH Ledger API documentation](https://ahledger.com/developers).

Blizzard remains a provider ID and future adapter target. We will not assume Retail or Classic auction namespaces also represent Forever until Blizzard exposes and documents the applicable endpoints.

## Local verification

Unit tests never call a live provider:

```text
pnpm --filter @forever-professions/pricing test
```

The optional read-only live smoke test defaults to Linen Cloth and Wool Cloth on the US PvP Horde market:

```text
pnpm pricing:live:test
```

Override it in PowerShell:

```text
$env:AH_LEDGER_MARKET = "forever.normal.alliance.us"
$env:AH_LEDGER_ITEM_IDS = "2589,2592"
pnpm pricing:live:test
```

## Next slice

1. Add DSQL migrations for normalized markets and current observations.
2. Implement a connector-backed `CurrentAuctionPriceStore` with bounded write batches.
3. Validate it against local PostgreSQL and then a development DSQL cluster.
4. Add an opt-in EventBridge Scheduler and Lambda worker that refreshes configured markets outside the API request path.
5. Serve stored prices from the API and include provider attribution in the calculator UI.

Long-term history is deliberately deferred. Current observations belong in DSQL; economical analytical storage will be added only when historical charts or analysis justify it.
