# Manual API testing

## Local API

### Full catalog and Forever Changes

Start disposable PostgreSQL, import the baseline, and import the Forever target with
its comparison:

```text
pnpm db:local:up
pnpm data:import:local data/imports/classic-era-1.15.9.69722-professions.json
pnpm data:import:local data/imports/forever-1.60.1.69977-professions.json --compare-against data/imports/classic-era-1.15.9.69722-professions.json --comparison-type classic-forever
```

Start the PostgreSQL-backed API in one PowerShell terminal:

```powershell
$env:LOCAL_DATABASE_URL = "postgresql://forever_professions:local-only@127.0.0.1:55432/forever_professions_local"
pnpm dev:api
```

The API reports `PostgreSQL catalog` on startup. This mode serves the 603-recipe
Leatherworking catalog and stored recipe comparison. Reagent and output records also
include build-scoped `clientData` when available: display name, equipment slot, armor,
ordered item stats with localized display text, required level, sell price in integer
copper, and client source metadata.

### Fixture-only API

For a small, dependency-free API process, omit `LOCAL_DATABASE_URL`:

```text
pnpm dev:api
```

This mode is useful for core route smoke tests, but it cannot serve Forever Changes
and does not represent the full imported catalog.

With the fixture-only API running, run the complete fixture smoke suite in another
terminal:

```text
pnpm api:smoke
```

The smoke suite requests health, professions, recipes, auction markets, current auction
prices, a leveling route, and its shopping list. Local auction responses use
deterministic manual observations, so this path does not need AWS or call AH Ledger.
Recipe-change routes are tested separately because they require two imported builds
and a stored comparison.

`/api/health` is a process-liveness response. `/api/ready` verifies the configured
catalog database without returning an endpoint, role, account, query, or error detail.
The fixture and PostgreSQL-backed local servers both expose readiness; the Lambda
readiness check runs `SELECT 1` through the application-reader connection.

The smoke and shopping scripts contain fixture recipe IDs such as
`heavy-armor-kit`; do not use them as full PostgreSQL catalog smoke tests. The imported
catalog uses spell-based IDs such as `spell-3780`.

Request any route directly:

```text
pnpm api:request -- /api/health
pnpm api:request -- /api/professions/leatherworking
pnpm api:request -- /api/professions
pnpm api:request -- /api/recipes/spell-3780
pnpm api:request -- '/api/recipe-changes?comparison=classic-forever&profession=leatherworking'
pnpm api:request -- '/api/recipe-changes?comparison=classic-forever&profession=leatherworking&changeType=updated&search=leather'
pnpm api:request -- '/api/recipe-changes/summary?comparison=classic-forever&profession=leatherworking'
pnpm api:request -- '/api/auction/prices?marketId=forever.pvp.horde.us&itemIds=4234,2321'
pnpm api:optimize -- 150 180 cost
pnpm api:shopping -- 33.375 cheapest
```

Keep URLs containing `&` inside single quotes in PowerShell.

## Deployed API

Use the data-driven cloud smoke command with the `WebUrl` CloudFormation output. It
discovers a real profession, recipe, market, and one-point route from the deployed
catalog, validates every response with the shared contracts, and therefore does not
depend on fixture-only IDs:

```text
pnpm api:smoke:cloud -- https://example.cloudfront.net
```

The command covers liveness, readiness, catalog, profession recipes, one recipe,
Classic-to-Forever changes and summary, auction markets and prices, route
optimization, and shopping-list planning. An empty auction market is allowed before
the separately gated pricing schedule is enabled; pricing and shopping still must
return contract-valid explicit unavailable/partial data.

Pass the `ApiUrl` CloudFormation output to the fixture-oriented smoke command only
when testing a fixture deployment:

```text
pnpm api:smoke -- https://example.execute-api.us-east-1.amazonaws.com
pnpm api:request -- /api/health https://example.execute-api.us-east-1.amazonaws.com
```

The Phase 4 exit gate must use the CloudFront entry point:

```text
pnpm api:smoke:cloud -- https://d2v8wp3f4a4zkh.cloudfront.net
```

Direct API Gateway requests remain useful for diagnosis but do not satisfy the exit
gate. Production intentionally has no wildcard API Gateway or Lambda CORS response;
the browser uses same-origin `/api/*` requests through CloudFront. Staging retains
wildcard CORS to support deliberate direct-origin testing. CloudFront's frontend-only
viewer-request rewrite serves `index.html` for extensionless SPA routes without
converting API `404` responses into HTML success responses.

Or set it once for the current PowerShell session:

```text
$env:API_BASE_URL = "https://example.execute-api.us-east-1.amazonaws.com"
pnpm api:smoke
```

The deployed auction routes read Aurora DSQL. A `503` response means the API runtime lacks its DSQL configuration; a `400` response means a required query parameter is missing or invalid.

## Public routes

```text
GET /api/health
GET /api/ready
GET /api/professions
GET /api/professions/:professionId
GET /api/professions/:professionId/recipes
GET /api/recipes/:recipeId
GET /api/recipe-changes?comparison=<classic-forever|forever-build>&profession=<id>&changeType=<new|updated|removed|unchanged>&search=<text>
GET /api/recipe-changes/summary?comparison=<classic-forever|forever-build>&profession=<id>
GET /api/auction/markets
GET /api/auction/prices?marketId=<market>&itemIds=<comma-separated-positive-integers>
POST /api/routes/optimize
POST /api/shopping-list
POST /api/product-events
```

The auction-price route accepts at most 100 unique item IDs per request.

The product-event route accepts only the strict anonymous event union documented in
[`PRODUCT_ANALYTICS.md`](PRODUCT_ANALYTICS.md). Unknown fields are rejected with
`400`; an unconfigured or unavailable event sink returns `503`; accepted events
return `204` with no body. Product analytics are non-blocking for browser workflows.

The recipe-change list defaults to `comparison=classic-forever`, excludes Unchanged
records unless `changeType=unchanged` is requested, and accepts optional profession,
change-type, and search filters. The summary counts every stored logical recipe,
including Unchanged. Both routes return `503` when no comparison reader is configured
and `404` when the requested comparison type has not been imported.

The optimizer command remains a legacy objective-oriented diagnostic and accepts
`startSkill`, `targetSkill`, `objective`, and an optional base URL. For example:

```text
pnpm api:optimize -- 150 180 crafts https://m6ulu3zwch.execute-api.us-east-1.amazonaws.com
```

Product requests to `POST /api/routes/optimize` use one of `practical`,
`trainer-friendly`, `cheapest`, `fewest-crafts`, `fewest-materials`, or
`experimental`. Presets own their objective, confidence, and penalty policy, so they
cannot be combined with legacy `objective`, `confidencePolicy`, or custom `policy`
fields. Cheapest requires a market:

```json
{
  "professionId": "leatherworking",
  "marketId": "forever.pvp.horde.us",
  "startSkill": 150,
  "targetSkill": 225,
  "preset": "cheapest"
}
```

Legacy direct clients may continue to send `objective` and optional
`confidencePolicy`/`policy` without a preset. New product surfaces should not expose
those raw controls.

Successful segments and alternatives include an `evidence` object with a confidence
level, stable reason codes, acquisition, availability, provenance source, and
verification status. Segments include optimizer-authored `recommendation` reason
codes and summaries; alternatives include a primary `lossReason` and `lossSummary`.
An evidence-boundary gap returns `reason: "unsupported-recipe-evidence"` with
`blockedAtSkill` and a product-ready `explanation`. Missing prices and ordinary
eligibility gaps remain `missing-price-data` and `no-eligible-recipe`.

The shopping command accepts `expectedCrafts`, `strategy`, and an optional base URL:

```text
pnpm api:shopping -- 33.375 cheapest https://m6ulu3zwch.execute-api.us-east-1.amazonaws.com
```

Valid shopping strategies are `cheapest`, `buy-only`, and `craft-first`.
Available purchases include `priceObservedAt`, and the response includes
`oldestPriceObservedAt` when at least one priced purchase contributed to the plan.
Both values come from normalized stored observations. An absent timestamp means no
priced purchase supplied one; it is not replaced with the request time.

## All professions after import

Run `pnpm api:smoke:professions` against local PostgreSQL after importing both complete
snapshots. It validates the ten-profession directory, every catalog's count and build,
empty item outputs, scoped comparisons, route recipe eligibility, and shopping plans.
The controlled pricing reader returns no observations so missing prices stay explicit.
Full routes currently complete for the six crafting professions and Cooking; First
Aid, Fishing, and Mining report blockers from missing supported progression evidence.
