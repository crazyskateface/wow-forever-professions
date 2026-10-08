# Forever Professions

A TypeScript monorepo for a modern, application-first World of Warcraft: Forever profession calculator inspired by Professions.gg.

The repository contains a fixture-backed calculator vertical slice, the Phase 2 versioned-data foundation, and the first Phase 3 auction-pricing slice: normalized price contracts, a provider boundary, AH Ledger/manual/no-price adapters, and testable refresh orchestration. Production data writes and scheduled refreshes are not enabled yet.

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

The API runs at `http://localhost:3001`; try `GET /health` or `GET /professions`.

## Verify everything

```text
pnpm verify
```

This typechecks every workspace, runs unit tests, builds all packages/apps, and synthesizes the CDK stack.

## Repository map

```text
apps/web                   React + Vite application
apps/api                   HTTP API router, local server, and Lambda handler
packages/domain            Pure profession types and math
packages/contracts         Shared Zod API/data schemas
packages/ingestion         Versioned normalization, build diffs, and DSQL batching
packages/pricing           Auction provider adapters and refresh orchestration
data/fixtures              Controlled Phase 1 data
ops                        AWS CDK application
docs                       Architecture and roadmap
references/professions-gg  Original design-reference screenshots
.agents/skills             Placeholders for future project-specific Codex skills
```

See [docs/ROADMAP.md](docs/ROADMAP.md) for phase boundaries, [docs/PHASE2_DATA.md](docs/PHASE2_DATA.md) for ingestion, and [docs/PHASE3_PRICING.md](docs/PHASE3_PRICING.md) for pricing. The managed root [AGENTS.md](AGENTS.md) protects synced project sources; scoped agent guidance lives beside the code it governs.
