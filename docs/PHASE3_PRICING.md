# Phase 3 auction pricing

## Architecture

`@forever-professions/pricing` separates auction vendors from the application with an `AuctionPriceProvider` interface:

```text
AH Ledger / manual / no-price
              |
     AuctionPriceProvider
              |
 normalized observations in copper
              |
 Aurora DSQL current-price repository
          /             \
 scheduled writer     read-only API
```

The refresh coordinator requires exactly one available or unavailable observation for every requested game item before it calls the store. This prevents a partial provider response from silently becoming a partial refresh.

AH Ledger is the first live adapter because its public API exposes Forever markets directly. It supports unauthenticated access, asks clients to honor cache and retry headers, and requires visible attribution wherever its data is shown. The adapter batches the tooltip endpoint at its documented 100-item limit and preserves `Retry-After` on HTTP errors. See [AH Ledger API documentation](https://ahledger.com/developers).

The pricing worker is a dedicated Lambda invoked by EventBridge Scheduler. It refreshes configured item IDs from AH Ledger and writes normalized observations to Aurora DSQL. The API only reads stored prices; it never calls an auction vendor in a request. The schedule has one reserved worker concurrency, a five-minute flexible window, two retries, a one-hour maximum event age, and an encrypted 14-day dead-letter queue.

Blizzard remains a provider ID and future adapter target. We will not assume Retail or Classic auction namespaces also represent Forever until Blizzard exposes and documents the applicable endpoints. Deferring that adapter does not block the rest of Phase 3.

## Local verification

Unit tests never call a live provider:

```text
pnpm --filter @forever-professions/pricing test
```

The optional read-only live smoke test defaults to Linen Cloth and Wool Cloth on the US PvP Horde market:

```text
pnpm pricing:live:test
```

The relational repository can be exercised locally with disposable PostgreSQL:

```text
pnpm db:local:up
pnpm pricing:local:test
pnpm db:local:down
```

Override it in PowerShell:

```text
$env:AH_LEDGER_MARKET = "forever.normal.alliance.us"
$env:AH_LEDGER_ITEM_IDS = "2589,2592"
pnpm pricing:live:test
```

## Stored-price API

Run the API locally and test all routes from another terminal:

```text
pnpm dev:api
pnpm api:smoke
```

Request a single endpoint manually in PowerShell:

```text
pnpm api:request -- '/api/auction/prices?marketId=forever.pvp.horde.us&itemIds=4234,2321'
```

The new endpoints are:

- `GET /api/auction/markets`
- `GET /api/auction/prices?marketId=<market>&itemIds=<comma-separated-game-item-ids>`

Pass an API Gateway base URL to test a deployment: `pnpm api:smoke -- https://example.execute-api.us-east-1.amazonaws.com`.

## DSQL validation

`pnpm pricing:dsql:test` applies the three Phase 3 migrations, maps the worker and API IAM roles to scoped database roles, verifies idempotent writes, confirms an older fetch cannot replace a newer observation, and reads the result back through the application repository. Required environment variables are documented in `packages/pricing/scripts/dsql-smoke.ts`.

## Phase result

Phase 3 delivers the current-price product path: normalized contracts, live and fallback providers, bounded DSQL persistence, scheduled refreshes, stored-price API routes, manual endpoint tools, calculator material costs, and visible provider attribution.

The AWS path was validated on October 8, 2026. The scoped worker role applied three pricing migrations, a manual Lambda invocation fetched and stored all four configured reagent prices, the scoped reader role returned them through every API route, and the same smoke suite passed through both API Gateway and CloudFront. The EventBridge schedule is enabled at `rate(15 minutes)` with its retry and dead-letter settings verified from the live resource.

Long-term history is deliberately deferred. Current observations belong in DSQL; economical analytical storage will be added only when historical charts or analysis justify it.
