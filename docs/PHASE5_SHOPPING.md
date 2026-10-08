# Phase 5 shopping lists and nested crafting

Phase 5 turns a leveling route into an expected shopping plan. It aggregates the
reagents for every route segment, then recursively decides whether each reagent
should be bought or crafted from a known recipe.

## Planner behavior

`@forever-professions/shopping` is a pure, deterministic package. It:

- combines duplicate route reagents before planning;
- supports `cheapest`, `buy-only`, and `craft-first` strategies;
- compares an intermediate item's stored auction price with the cost of its inputs;
- accounts for recipes that produce more than one output per craft;
- expands selected intermediate crafts until it reaches purchased materials;
- reports missing prices and missing sources instead of treating them as free; and
- detects recursive recipe cycles while still allowing a priced buy fallback.

Expected route crafts can be fractional because the optimizer models skill-up
probability. Shopping quantities therefore remain expected values rather than being
rounded into a guaranteed inventory list.

## API and UI

`POST /api/shopping-list` accepts a profession, market, route segments, a strategy,
and optional known recipe IDs. The Lambda reads only normalized current prices that
were refreshed ahead of time; it never calls AH Ledger or another auction provider
in the request path.

The route planner UI exposes the endpoint after a route is calculated and displays:

- items to buy, their expected quantities, and stored-price costs;
- intermediate crafts selected by the strategy;
- a known subtotal or complete expected total;
- unresolved items and blocked recursive cycles; and
- the price source attribution.

## Current data boundary

The controlled Leatherworking fixture now declares recipe outputs, but the values
remain illustrative and unverified for World of Warcraft: Forever. Its two recipes
do not form an intermediate crafting chain, so the deployed fixture currently
produces an aggregated buy list. Synthetic planner tests cover nested crafting,
buy-versus-craft decisions, recipe knowledge, multi-level expansion, and cycles.
Real nested results depend on importing verified Forever recipe outputs and item IDs.

## Test locally

Start the API and exercise the dedicated command in separate terminals:

```text
pnpm dev:api
pnpm api:shopping
```

The command accepts expected crafts, strategy, and an optional base URL:

```text
pnpm api:shopping -- 33.375 cheapest
pnpm api:shopping -- 33.375 buy-only https://example.execute-api.us-east-1.amazonaws.com
```

Run the focused planner suite with:

```text
pnpm --filter @forever-professions/shopping test
```
