# Manual API testing

## Local API

### Full catalog and Forever Changes

Start disposable PostgreSQL, import the baseline, and import the Forever target with
its comparison:

```text
pnpm db:local:up
pnpm data:import:local data/imports/classic-era-1.15.9.69722-leatherworking.json
pnpm data:import:local data/imports/forever-1.60.1.69977-leatherworking.json --compare-against data/imports/classic-era-1.15.9.69722-leatherworking.json --comparison-type classic-forever
```

Start the PostgreSQL-backed API in one PowerShell terminal:

```powershell
$env:LOCAL_DATABASE_URL = "postgresql://forever_professions:local-only@127.0.0.1:55432/forever_professions_local"
pnpm dev:api
```

The API reports `PostgreSQL catalog` on startup. This mode serves the 603-recipe
Leatherworking catalog and stored recipe comparison.

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

Pass the `ApiUrl` CloudFormation output as the smoke command's first argument:

```text
pnpm api:smoke -- https://example.execute-api.us-east-1.amazonaws.com
pnpm api:request -- /api/health https://example.execute-api.us-east-1.amazonaws.com
```

The current development deployment can be tested through either entry point:

```text
pnpm api:smoke -- https://m6ulu3zwch.execute-api.us-east-1.amazonaws.com
pnpm api:smoke -- https://d2v8wp3f4a4zkh.cloudfront.net
```

Or set it once for the current PowerShell session:

```text
$env:API_BASE_URL = "https://example.execute-api.us-east-1.amazonaws.com"
pnpm api:smoke
```

The deployed auction routes read Aurora DSQL. A `503` response means the API runtime lacks its DSQL configuration; a `400` response means a required query parameter is missing or invalid.

## Public routes

```text
GET /api/health
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
```

The auction-price route accepts at most 100 unique item IDs per request.

The recipe-change list defaults to `comparison=classic-forever`, excludes Unchanged
records unless `changeType=unchanged` is requested, and accepts optional profession,
change-type, and search filters. The summary counts every stored logical recipe,
including Unchanged. Both routes return `503` when no comparison reader is configured
and `404` when the requested comparison type has not been imported.

The optimizer command accepts `startSkill`, `targetSkill`, `objective`, and an optional base URL. For example:

```text
pnpm api:optimize -- 150 180 crafts https://m6ulu3zwch.execute-api.us-east-1.amazonaws.com
```

The shopping command accepts `expectedCrafts`, `strategy`, and an optional base URL:

```text
pnpm api:shopping -- 33.375 cheapest https://m6ulu3zwch.execute-api.us-east-1.amazonaws.com
```

Valid shopping strategies are `cheapest`, `buy-only`, and `craft-first`.
