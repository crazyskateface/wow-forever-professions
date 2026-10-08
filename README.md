# Forever Professions

A TypeScript monorepo for a modern, application-first World of Warcraft: Forever profession calculator inspired by Professions.gg.

The repository contains a fixture-backed calculator, the Phase 2 versioned-data foundation, the Phase 3 auction-pricing path, the Phase 4 leveling-route optimizer, and the Phase 5 shopping planner. Routes recalculate expected crafts, materials, and stored-price cost at each skill; shopping plans aggregate their reagents and safely compare buying with recursive intermediate crafting. Missing data and cycles remain explicit instead of being guessed. Blizzard pricing remains deferred until a documented Forever API is available.

## Requirements

- Node.js 24.19.0 (project-pinned; supported dependency lines are 22.12, 24, and 26+)
- pnpm 11.19.0
- AWS credentials only when deploying; install, build, test, and CDK synthesis do not require an AWS account

## Start here

```text
pnpm install
pnpm dev:web
```

The web app runs at `http://localhost:5173`.

In another terminal, the fixture API can run locally:

```text
pnpm dev:api
```

The API runs at `http://localhost:3001`. In a third terminal, exercise every public route or one route directly:

```text
pnpm api:smoke
pnpm api:request -- /api/health
pnpm api:request -- '/api/auction/prices?marketId=forever.pvp.horde.us&itemIds=4234,2321'
pnpm api:optimize -- 150 180 cost
pnpm api:shopping -- 33.375 cheapest
```

## Verify everything

```text
pnpm verify
```

This typechecks every workspace, runs unit tests, builds all packages/apps, and synthesizes the CDK stack.

## Repository map

```text
apps/web                   React + Vite application
apps/api                   HTTP API router, local server, and Lambda handler
apps/pricing-worker        Scheduled AH Ledger refresh Lambda
packages/domain            Pure profession types and math
packages/contracts         Shared Zod API/data schemas
packages/ingestion         Versioned normalization, build diffs, and DSQL batching
packages/pricing           Auction provider adapters and refresh orchestration
packages/optimizer         Pure leveling-route optimization
packages/shopping          Pure shopping-list and nested-crafting planning
data/fixtures              Controlled Phase 1 data
ops                        AWS CDK application
docs                       Architecture and roadmap
references/professions-gg  Original design-reference screenshots
.agents/skills             Placeholders for future project-specific Codex skills
```

See [docs/ROADMAP.md](docs/ROADMAP.md) for phase boundaries, [docs/PHASE2_DATA.md](docs/PHASE2_DATA.md) for ingestion, [docs/PHASE3_PRICING.md](docs/PHASE3_PRICING.md) for pricing, [docs/PHASE4_OPTIMIZER.md](docs/PHASE4_OPTIMIZER.md) for route planning, [docs/PHASE5_SHOPPING.md](docs/PHASE5_SHOPPING.md) for shopping plans, and [docs/API_TESTING.md](docs/API_TESTING.md) for manual endpoint testing. The managed root [AGENTS.md](AGENTS.md) protects synced project sources; scoped agent guidance lives beside the code it governs.
