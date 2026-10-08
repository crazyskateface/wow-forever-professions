# Manual API testing

## Local API

Start the fixture-backed API in one PowerShell terminal:

```text
pnpm dev:api
```

Run the complete smoke suite in another terminal:

```text
pnpm api:smoke
```

The smoke suite requests health, professions, recipes, auction markets, current auction prices, a leveling route, and its shopping list. Local auction responses use deterministic manual observations, so this path does not need AWS or call AH Ledger.

Request any route directly:

```text
pnpm api:request -- /api/health
pnpm api:request -- /api/professions
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
GET /api/professions/:professionId/recipes
GET /api/recipes/:recipeId
GET /api/auction/markets
GET /api/auction/prices?marketId=<market>&itemIds=<comma-separated-positive-integers>
POST /api/routes/optimize
POST /api/shopping-list
```

The auction-price route accepts at most 100 unique item IDs per request.

The optimizer command accepts `startSkill`, `targetSkill`, `objective`, and an optional base URL. For example:

```text
pnpm api:optimize -- 150 180 crafts https://m6ulu3zwch.execute-api.us-east-1.amazonaws.com
```

The shopping command accepts `expectedCrafts`, `strategy`, and an optional base URL:

```text
pnpm api:shopping -- 33.375 cheapest https://m6ulu3zwch.execute-api.us-east-1.amazonaws.com
```

Valid shopping strategies are `cheapest`, `buy-only`, and `craft-first`.
