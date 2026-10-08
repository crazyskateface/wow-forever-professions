# Forever Professions roadmap

The product should feel like a polished calculator, not a traditional guide site. Its first job is to answer what a player can craft, the chance of a skill point, the expected number of crafts, and the materials consumed.

## Target architecture

```text
Route 53 + ACM
      |
CloudFront
      |
private S3 web build

Browser ---- API Gateway HTTP API ---- TypeScript Lambda
   |                                      |
client-side profession math         fixture data (Phase 1)
                                          |
                                  Aurora DSQL (later)

EventBridge Scheduler (later) ---- ingestion Lambdas
                                          |
                               raw build data in S3
```

Calculator interaction stays in the browser after recipe data loads. This avoids API calls while a skill slider moves and keeps the experience immediate. AWS infrastructure stays serverless: no Vercel, always-running EC2/ECS service, Kubernetes, Redis, or search cluster without a demonstrated need.

## Phase 1 — foundation and recipe-calculator vertical slice

Status: initial scaffold established.

- TypeScript pnpm monorepo with web, API, domain, contracts, fixtures, and CDK infrastructure.
- Desktop-first, responsive Professions.gg-inspired recipe browser and calculator.
- Fixture Leatherworking data with explicit provenance and verification status.
- Pure domain functions for difficulty, skill-up probability, expected crafts, and reagent use.
- Fixture-backed endpoints:
  - `GET /health`
  - `GET /professions`
  - `GET /professions/:professionId/recipes`
  - `GET /recipes/:recipeId`
- Private S3 + CloudFront SPA infrastructure and API Gateway HTTP API + Lambda.
- Tests for threshold boundaries, expected crafts, contracts, and API handlers.

Before Phase 1 exits, expand the calculator UX, verify Forever mechanics, add meaningful fixture coverage, connect the web app to the API where useful, add targeted component tests, and define a safe static-asset deployment workflow.

## Phase 2 — versioned Forever data and ingestion

Status: in progress. Versioned contracts, pure normalization and recipe diffs, DSQL-safe batching and schema files, immutable raw-data keying, a retained S3 bucket, and opt-in DSQL infrastructure are established. The connector-backed writer and first real client-data adapter are next.

- Introduce `wow_build`, profession, item, recipe, recipe-version, reagent, output, source, threshold, provenance, and verification models.
- Preserve raw imported client datasets in S3 by build.
- Normalize application data into Aurora DSQL.
- Keep history; never destructively overwrite build-specific facts.
- Produce human-readable build diffs for changed, added, and removed recipes.
- Batch writes with DSQL transaction constraints in mind.

## Phase 3 — auction pricing

Status: in progress. Normalized price contracts, the `AuctionPriceProvider` boundary, AH Ledger/manual/no-price adapters, and storage-neutral refresh orchestration are established. A DSQL current-price store and opt-in EventBridge scheduled worker are next.

- Define an `AuctionPriceProvider` boundary.
- Add AH Ledger, Blizzard (when feasible), manual, and no-price providers behind it.
- Refresh normalized current prices on a schedule rather than during user requests.
- Track provider, market, item, observation time, and available price/quantity fields.
- Keep long-term snapshots in economical analytical storage if the product needs history.

## Phase 4 — leveling route optimizer

- Optimize from a starting skill to a target skill.
- Support cost, craft-count, material-count, known-recipe, trainer-only, and exclusion strategies.
- Recalculate expected cost as skill-up probability changes; do not use one static craft count.
- Link route segments back to the normal recipe calculator.

## Phase 5 — shopping list and nested crafting

- Aggregate route reagents.
- Compare buying with crafting intermediate reagents when prices exist.
- Detect and prevent cycles in recursive crafting graphs.

## Phase 6 — verification and data quality

- Track `client-data`, `observed-in-game`, `classic-fallback`, `community-verified`, and `manual-override` provenance.
- Surface uncertainty instead of presenting fallback data as authoritative.
- Consider a companion add-on only after the website proves useful.

## Phase 7 — polish and launch

- URL-addressable recipes, build selection, change notices, metadata, analytics, and monitoring.
- Accessibility, performance, responsive refinement, and complete loading/empty/error states.
- Preserve the application-first design.

## Later, only if usage justifies it

User accounts, characters, learned-recipe sync, personalized routes, add-on integration, historical auction charts, community submissions, a public API, additional WoW versions, and monetization.

## Explicitly out of scope for the current Phase 3 slice

Production database writes, scheduled auction refreshes, Blizzard Forever auction ingestion, authentication, user accounts, and route optimization are not enabled. The Aurora DSQL resource remains opt-in until its schema and writer have been validated on a development cluster.
