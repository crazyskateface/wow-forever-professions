# Auction pricing

This package owns the Phase 3 provider and persistence boundaries. It normalizes vendor-specific auction data before it reaches the DSQL current-price repository or application code.

Implemented providers:

- `AhLedgerAuctionPriceProvider`: real Forever markets and bulk tooltip prices, fetched in batches of 100 items.
- `ManualAuctionPriceProvider`: controlled overrides and local fixtures.
- `NoPriceProvider`: an explicit unavailable result when pricing is disabled.

All currency values are integer copper per unit. An unavailable price is a discriminated state with a reason, never a synthetic zero. AH Ledger observations include the attribution link required when prices are displayed.

Run the mocked unit suite with `pnpm --filter @forever-professions/pricing test`. Run a read-only live check with `pnpm pricing:live:test`; override its defaults with `AH_LEDGER_MARKET`, `AH_LEDGER_ITEM_IDS`, and optionally `AH_LEDGER_API_KEY`.

Run the repository against disposable local PostgreSQL with `pnpm db:local:up`, `pnpm pricing:local:test`, and `pnpm db:local:down`. The AWS harness is `pnpm pricing:dsql:test`; it applies the pricing migrations, configures scoped database roles, and verifies writes through an assumed IAM role.
