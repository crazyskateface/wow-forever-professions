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
client-side profession math       versioned recipe catalog
                                          |
                              versioned Aurora DSQL data

EventBridge Scheduler ---- pricing Lambda ---- AH Ledger
                              |
                     current prices in DSQL

Versioned ingestion ---- raw build data in S3
          |
 versioned data in DSQL
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

Status: data foundation complete. Versioned contracts, pure normalization and recipe diffs, DSQL-safe schema and batching, conditional raw S3 uploads, the official connector-backed resumable writer, a retained S3 bucket, a scoped ingestion role, and the termination-protected DSQL development cluster are established. The live AWS path has been validated twice for idempotency. A real Forever client snapshot is now transformed and locally validated; independent evidence is still required before it can be called authoritative.

- Introduce `wow_build`, profession, item, recipe, recipe-version, reagent, output, source, threshold, provenance, and verification models.
- Preserve raw imported client datasets in S3 by build.
- Normalize application data into Aurora DSQL.
- Keep history; never destructively overwrite build-specific facts.
- Produce human-readable build diffs for changed, added, and removed recipes.
- Batch writes with DSQL transaction constraints in mind.

## Phase 3 — auction pricing

Status: complete for current-price delivery. Normalized contracts, the `AuctionPriceProvider` boundary, AH Ledger/manual/no-price adapters, bounded DSQL storage, a dedicated scheduled Lambda with retries and a dead-letter queue, stored-price API routes, manual smoke tools, and calculator attribution are established. The Blizzard adapter and price history remain deliberately deferred.

- Define an `AuctionPriceProvider` boundary.
- Add AH Ledger, Blizzard (when feasible), manual, and no-price providers behind it.
- Refresh normalized current prices on a schedule rather than during user requests.
- Track provider, market, item, observation time, and available price/quantity fields.
- Keep long-term snapshots in economical analytical storage if the product needs history.

## Phase 4 — leveling route optimizer

Status: complete for the catalog-backed route-planning product path. The pure optimizer recalculates probability and expected cost at every skill; supports cost/craft/material objectives and known-recipe/trainer/exclusion constraints; groups adjacent choices into route segments; and reports exact coverage or price-data blockers. Shared Zod contracts, a stored-price-backed POST endpoint, manual smoke tools, a route-planner UI, and links back to the calculator are established. Reliable trainer constraints still require verified Forever acquisition data rather than optimizer changes.

- Optimize from a starting skill to a target skill.
- Support cost, craft-count, material-count, known-recipe, trainer-only, and exclusion strategies.
- Recalculate expected cost as skill-up probability changes; do not use one static craft count.
- Link route segments back to the normal recipe calculator.

## Phase 5 — shopping list and nested crafting

Status: complete for the catalog-backed product path. A pure recursive planner aggregates route reagents, supports cheapest/buy-only/craft-first strategies, compares stored auction prices with intermediate crafting costs, and reports missing data or cycles explicitly. Shared contracts, a POST endpoint, manual smoke tooling, and the route-linked UI are established. The imported graph can exercise real intermediate chains, while provisional output quantities remain visibly unverified.

- Aggregate route reagents.
- Compare buying with crafting intermediate reagents when prices exist.
- Detect and prevent cycles in recursive crafting graphs.

## Phase 6 — verification and data quality

Status: in progress. Structured provenance now flows through storage, API contracts, the calculator, and route planner. A reproducible client-data import provides 603 Leatherworking recipes for Forever build 1.60.1.69977, the application can read the normalized SQL catalog instead of fixtures, and a generated audit identifies missing names, omitted borrowed ranks, provisional outputs, and incomplete review metadata. Observed-in-game evidence and field-level provenance remain outstanding before the data can be called authoritative.

- Track `client-data`, `observed-in-game`, `classic-fallback`, `community-verified`, and `manual-override` provenance.
- Surface uncertainty instead of presenting fallback data as authoritative.
- Consider a companion add-on only after the website proves useful.

## Phase 7 — polish and launch

Status: an early full-catalog UX slice is complete. Recipe and known-recipe lists are virtualized for the 603-record import, search covers recipe IDs and material names, bulk selection is bounded, catalog loading/fallback/empty states are explicit, and recipe URLs participate in browser history.

- Build selection, change notices, metadata, analytics, and monitoring.
- Accessibility, performance, responsive refinement, and complete loading/empty/error states.
- Preserve the application-first design.

## Later, only if usage justifies it

User accounts, characters, learned-recipe sync, personalized routes, add-on integration, historical auction charts, community submissions, a public API, additional WoW versions, and monetization.
