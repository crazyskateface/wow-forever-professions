# Agent instructions

This file is the repository-wide operating guide for coding agents working on
Forever Professions. It applies to every file in the repository. A more specific
`AGENTS.md` under `apps/`, `packages/`, `data/`, or `ops/` adds rules for that area;
follow both, with the closest file taking precedence when instructions differ.

## Start here

Before changing code:

1. Read this file and the nearest scoped `AGENTS.md`.
2. Read `README.md` for the current product state and local setup.
3. Read `docs/DEVELOPMENT.md` for architecture, data invariants, and known limits.
4. Read the relevant package README before changing ingestion, optimization,
   pricing, shopping, or infrastructure behavior.
5. Inspect `git status` and preserve unrelated or pre-existing work.

Treat every file under `sources/` as read-only reference material. Do not edit,
rename, move, or delete it. Those files are synced from an external ChatGPT project
and may be replaced independently of this repository.

## Project purpose

Forever Professions is a TypeScript/pnpm monorepo for a World of Warcraft: Forever
profession leveling planner. The current production-shaped slice is Leatherworking
and includes:

- a stateful leveling-route optimizer;
- a recipe catalog and skill-aware calculator;
- shopping and normalized auction-price planning;
- deterministic Classic Era to Forever recipe comparisons;
- a Forever Changes browser;
- reproducible client-data, item-classification, and icon ingestion.

The application is data-driven and guide-first. Never solve a data-quality problem by
hiding unknown values or presenting inferred facts as verified game data.

## Repository map and dependency direction

```text
apps/web              React 19 + Vite client
apps/api              HTTP router, local Node server, and Lambda handler
apps/pricing-worker   Scheduled price-refresh Lambda
packages/contracts    Shared Zod schemas and boundary types
packages/domain       Pure profession math and data-quality rules
packages/optimizer    Stateful leveling-route optimization
packages/shopping     Shopping-list and nested-crafting planning
packages/pricing      Auction providers, normalization, and persistence
packages/ingestion    Conversion, imports, comparisons, SQL readers/writers
data/fixtures         Small illustrative fallback catalog
data/imports          Versioned datasets, reviewed overrides, and quality reports
ops                   AWS CDK application
docs                  Current guides and historical roadmaps
sources               Read-only synced reference material
```

Keep dependencies one-way: applications may consume shared packages, but shared
packages must not depend on applications or AWS. Keep domain and optimizer code
deterministic and framework-independent. Shared request and response shapes belong in
`packages/contracts` and must be validated with Zod at external boundaries.

## Non-negotiable data rules

- Every dataset and persisted fact must retain its game build, provenance, and
  verification state.
- Never infer a missing Forever fact from a recipe name or silently copy a Classic
  value into a supported Forever field.
- Classic fallbacks must remain explicitly marked as fallbacks.
- Presence in client files does not prove a recipe is obtainable in game.
- Unknown data stays unknown and visible. Do not convert missing prices to zero or
  missing skill thresholds to level 1.
- Explicitly unavailable recipes never enter a leveling route. Recipes with unknown
  learning ranks are ineligible until supported evidence is available.
- Recipe-comparison identity is `(professionId, spellId)`, not display name or local
  row ID.
- Store Unchanged comparison records so summaries can be reconstructed exactly; the
  UI may hide them by default.
- Icon or item-classification enrichment is not a gameplay recipe change.
- Item rarity comes from the pinned client's `ItemSparse.OverallQualityID`; never infer
  rarity from an item name, icon, class, or equipment slot.
- Forever's `Scarce` material designation comes from client
  `ItemSparse.ItemNameDescriptionID -> ItemNameDescription`. Do not create or restore
  a hardcoded list of scarce item names.
- Classification records must retain the actual source product, client build, and
  locale even when that client build is newer than the recipe snapshot.
- Imported build rows are immutable. A same-build/different-hash conflict is a signal
  to reset the disposable local database, not a reason to weaken persistence rules.
- Do not hand-edit generated recipe snapshots, quality reports, icon manifests, or
  item icons. Change the converter or a reviewed override, then regenerate artifacts.
- Keep source attribution and licensing notices current in
  `data/imports/THIRD_PARTY_NOTICES.md`.

Read `data/imports/README.md` and `packages/ingestion/README.md` before changing any
imported data or regeneration workflow.

## Application rules

### Web

- Keep loaded recipe interactions client-side and keep optimization logic out of
  React components.
- The Forever Changes tab intentionally shows the stored Classic Era to Forever
  comparison; do not add a redundant comparison chooser without a product change.
- Reuse the shared current-skill state for guide and change availability behavior.
- Preserve URL-addressable recipe selection through `?recipe=<recipe-id>`.
- Use `ItemIcon` and lazy loading for list/card imagery. Preserve the initials
  fallback for missing assets.
- Preserve unknown, fallback, unavailable, New, and Updated states in the UI instead
  of smoothing them into ordinary values.

### API

- Keep handlers and routing thin. Put reusable logic in testable application or
  package functions.
- Validate request and response boundaries with shared contracts.
- Return explicit errors for missing catalog, comparison, or pricing dependencies;
  never fabricate data to make an endpoint appear healthy.
- API requests may read normalized prices refreshed ahead of time. Never call an
  auction provider directly in a user request path.
- Keep local fixture behavior distinct from the PostgreSQL-backed full catalog.

### Optimizer, shopping, and pricing

- Preserve deterministic results for identical inputs.
- A complete route without `Scarce` materials wins over a Scarce route whenever such
  a route exists; Scarce recipes are a last resort for route completion.
- Model constraints and modifiers explicitly instead of mutating base recipe facts.
- Store money as integer copper.
- Keep missing prices and unresolved crafting sources explicit, and retain cycle
  detection for nested crafting.
- Vendor-specific response shapes stop at provider adapters.

### Database and infrastructure

- Add schema changes as new ordered migrations; never rewrite an applied migration.
- Apply live migrations with `pnpm db:migrate:dsql`; it records normalized checksums
  and treats any changed or missing applied migration as drift.
- Keep migrations compatible with the repository's Aurora DSQL constraints and local
  PostgreSQL test workflow.
- After ingestion or schema changes, import both real snapshots into disposable local
  PostgreSQL and exercise the affected API path.
- Use AWS CDK v2 TypeScript, stable construct IDs, explicit retention/removal
  behavior, and least-privilege permissions.
- Keep the shared `ForeverProfessionsDelivery` stack independent from application and
  data deployments. Preserve its immutable GitHub owner/repository IDs, exact
  environment subjects, termination protection, and monitoring-only budget.
- Keep GitHub Actions pinned to full commit SHAs, dependency installation frozen, and
  AWS access OIDC-only. Never add AWS access keys to repository or environment
  secrets.
- Never commit credentials, tokens, private endpoints, local database contents, or
  files from `.local-data/`.

## Tooling and local runtime

Use the repository-pinned versions of Node and pnpm. Use `pnpm`; do not introduce npm,
Yarn, or a second lockfile.

Common commands:

```text
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm verify
pnpm db:local:up
pnpm db:local:test
pnpm infra:diff:data:staging
pnpm infra:deploy:data:staging
pnpm db:migrate:dsql
pnpm db:roles:dsql
pnpm dev:api
pnpm dev:web
```

The full local catalog requires this import order:

```text
pnpm db:local:up
pnpm data:import:local data/imports/classic-era-1.15.9.69722-leatherworking.json
pnpm data:import:local data/imports/forever-1.60.1.69977-leatherworking.json --compare-against data/imports/classic-era-1.15.9.69722-leatherworking.json --comparison-type classic-forever
```

Local endpoints:

- Vite: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3001`
- PostgreSQL: `127.0.0.1:55432`

The API uses the full PostgreSQL catalog only when `LOCAL_DATABASE_URL` is set.
Without it, the API and browser can fall back to the small illustrative fixture, and
Forever Changes will not have a stored comparison.

## Change workflow

- Make the smallest coherent change that fully addresses the task.
- Follow existing TypeScript style and package boundaries; avoid unrelated cleanup.
- Preserve user changes in a dirty working tree. Do not reset, discard, or overwrite
  unrelated work.
- Update tests with behavior changes and add regression coverage for bug fixes.
- Update `README.md` and the closest focused document when commands, architecture,
  data boundaries, API behavior, or user-visible features change.
- Keep roadmap documents historical; do not treat an old phase plan as current truth.
- Do not start long-running services unless the task needs them. If started, report
  their ports and whether they remain running.
- Do not commit or push unless the user explicitly asks. Do not amend or rewrite
  existing commits without explicit permission.
- Publish changes through pull requests. When the user authorizes committing and
  publishing work, create a `codex/*` feature branch, commit there, push that branch,
  and open a pull request. Never push commits directly to `main`.

## Verification

Run checks in proportion to the change and report exactly what ran.

- Documentation-only: verify links/paths and run `git diff --check`.
- Shared TypeScript or contract changes: run the affected tests and `pnpm typecheck`.
- Web changes: run the affected tests/typecheck and `pnpm --filter
  @forever-professions/web build`.
- API changes: run `pnpm --filter @forever-professions/api test` and relevant request
  or smoke checks.
- Domain, optimizer, shopping, or pricing changes: run that package's focused tests
  plus dependents when boundary behavior changes.
- Ingestion, data, or SQL changes: run ingestion tests, regenerate the audit, and
  exercise a clean local database import when practical.
- Infrastructure changes: run typechecking and CDK synthesis.
- Broad or release-ready changes: run `pnpm verify`.

`pnpm verify` is the complete gate: typecheck, tests, builds, and CDK synth. A
typecheck alone is not sufficient evidence for migration ordering, persisted
comparisons, catalog reconstruction, or route behavior.

Before handing work back:

1. Review `git diff` for accidental generated, secret, or unrelated files.
2. Run `git diff --check`.
3. State the tests or validation performed and any checks not run.
4. Call out remaining uncertainty, especially unsupported Forever data.
5. Leave the working tree and any running services in a clearly reported state.
