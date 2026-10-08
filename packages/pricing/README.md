# Auction pricing

This package owns the Phase 3 provider boundary and normalizes vendor-specific auction data before it reaches storage or application code.

Implemented providers:

- `AhLedgerAuctionPriceProvider`: real Forever markets and bulk tooltip prices, fetched in batches of 100 items.
- `ManualAuctionPriceProvider`: controlled overrides and local fixtures.
- `NoPriceProvider`: an explicit unavailable result when pricing is disabled.

All currency values are integer copper per unit. An unavailable price is a discriminated state with a reason, never a synthetic zero. AH Ledger observations include the attribution link required when prices are displayed.

Run the mocked unit suite with `pnpm --filter @forever-professions/pricing test`. Run a read-only live check with `pnpm pricing:live:test`; override its defaults with `AH_LEDGER_MARKET`, `AH_LEDGER_ITEM_IDS`, and optionally `AH_LEDGER_API_KEY`.
