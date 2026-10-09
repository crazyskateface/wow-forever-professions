# Forever Professions

A TypeScript monorepo for a dynamic World of Warcraft: Forever profession leveling planner inspired by Professions.gg.

The primary product flow is recipe data → skill-up math → route optimizer → leveling guide → recipe calculator → shopping plan → market-aware optimization. The repository already contains the calculator, versioned-data foundation, pricing abstraction, leveling-route prototype, shopping planner, and data-quality workflow. Roadmap v2 starts by making the bundled 603-recipe Leatherworking import safe for route planning: build identity, spell ID, learning rank, acquisition, availability, faction, specialization, cooldown, provenance, and verification are now explicit rather than inferred. The full catalog remains searchable and virtualized as a secondary tool. Blizzard pricing remains deferred until a documented Forever API is available.

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

The API uses its small illustrative fixture by default. To run it with the bundled client-data catalog, start and import the local database first:

```text
pnpm db:local:up
pnpm data:import:local data/imports/forever-1.60.1.69977-leatherworking.json
```

Then start the API with the local database selected. In PowerShell:

```powershell
$env:LOCAL_DATABASE_URL = "postgresql://forever_professions:local-only@127.0.0.1:55432/forever_professions_local"
pnpm dev:api
```

Or in Git Bash:

```bash
export LOCAL_DATABASE_URL='postgresql://forever_professions:local-only@127.0.0.1:55432/forever_professions_local'
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
data/imports               Reproducible client-data imports and quality reports
ops                        AWS CDK application
docs                       Architecture and roadmap
references/professions-gg  Original design-reference screenshots
.agents/skills             Placeholders for future project-specific Codex skills
```

See [docs/ROADMAP_2.md](docs/ROADMAP_2.md) for the guide-first product plan, [docs/ROADMAP_2_PHASE1.md](docs/ROADMAP_2_PHASE1.md) for the Leatherworking canonical-data baseline, [docs/ROADMAP.md](docs/ROADMAP.md) for the original phase history, and [docs/API_TESTING.md](docs/API_TESTING.md) for manual endpoint testing. The managed root [AGENTS.md](AGENTS.md) protects synced project sources; scoped agent guidance lives beside the code it governs.
