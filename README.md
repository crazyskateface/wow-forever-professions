# Forever Professions

Forever Professions is a TypeScript monorepo for a data-driven World of Warcraft:
Forever profession leveling planner. The current vertical slice covers Leatherworking
and combines an optimized leveling guide, recipe calculator, shopping planner, and a
build-generated Classic Era → Forever change browser.

The product is guide-first:

```text
versioned recipe data
        ↓
skill-up and eligibility math
        ↓
stateful route optimization
        ↓
leveling guide + calculator + shopping plan
```

Recipe and comparison data retain their build, source, and verification state. A
missing or Classic-borrowed value is never silently presented as verified Forever
data.

## Current features

### Leveling guide

- Generates a complete current-skill → target-skill route from the loaded catalog.
- Limits normal route targets to the current Forever base profession cap of 300,
  configured once in the shared domain package.
- Optimizes expected crafts, material units, or stored auction cost per skill point.
- Uses dynamic programming with configurable recipe-switch and acquisition friction.
- Supports known-recipe selection, trainer-only mode, faction/specialization/cooldown
  constraints, and explicit recipe or reagent exclusions at the API boundary.
- Groups adjacent decisions into practical guide steps and exposes ordinary
  alternatives.
- Treats reagents carrying Forever's client-defined `Scarce` label as a last resort:
  a complete non-Scarce route wins even when its ordinary objective score is higher.
- Opens each guide step in the calculator at the relevant skill and shows New/Updated
  Forever badges when comparison data exists.

### Recipe catalog and calculator

- Loads the full 603-recipe Leatherworking catalog from PostgreSQL/Aurora DSQL.
- Provides a virtualized, searchable All Recipes list and URL-addressable recipe
  selection (`?recipe=<recipe-id>`).
- Calculates difficulty, skill-up probability, expected crafts, expected reagents,
  and stored-price cost at the selected profession skill.
- Shows the skill curve only through the configured base profession cap. Recipes
  with higher imported thresholds retain and expose those raw values in a compact
  advanced-data note instead of extending the normal progression graph.
- Shows materials, output, acquisition facts, build, provenance, and verification
  status. Requirements above the base cap remain visible and are flagged as unusual
  rather than silently rewritten.
- Uses 760 build-stamped WebP item icons. Off-screen list and change-card images are
  browser-lazy-loaded; missing assets fall back to item initials.
- Shows catalog-backed item details after a one-second pointer hover or when the
  owning recipe control receives keyboard focus. Calculator icons can pin the
  tooltip on click and support close-button, Escape, and outside-click dismissal.
  Imported client metadata supplies in-game rarity, equipment slot, armor, primary
  attributes, green equip-effect text, required level, and vendor sell price when
  those fields are available. Item names throughout
  the guide, catalog, calculator, changes view, route planner, shopping list, and
  tooltips use the familiar gray, white, green, blue, and purple rarity colors.
  Tooltips also spell out the rarity alongside the item category.

### Forever Changes

- Deterministically compares normalized recipes by `(professionId, spellId)`.
- Classifies every logical recipe as New, Updated, Removed, or Unchanged and stores
  machine-readable field-level differences.
- Supports Classic Era → Forever now and the same pipeline supports Forever build →
  build comparisons.
- Displays summary counts, search, profession and change-type filters, item-type
  filters, current-skill availability filters, provenance, icons, and expandable
  before/after values.
- Loads comparison records on demand when the Forever Changes tab is first opened,
  keeping the initial guide request burst below the API's concurrency boundary.
- Hides unchanged recipes by default; badges are reused in the guide and All Recipes.
- The bundled comparison currently contains 289 New, 227 Updated, 0 Removed, and 87
  Unchanged Leatherworking recipes (603 total).

### Shopping and pricing

- Aggregates a generated route into expected shopping quantities.
- Supports cheapest, buy-only, and craft-first strategies with guarded recursive
  intermediate crafting.
- Keeps missing prices and unresolved crafting sources explicit and detects cycles.
- Normalizes AH Ledger observations to integer copper and preserves attribution.
- Reads prices refreshed ahead of time; API requests never call an auction provider
  directly.

### Guide quality validation

- Captures a compact, build-stamped baseline of the generated 1–300 route.
- Compares every skill decision, expected craft total, and aggregated material total
  with explicitly sourced external guide references.
- Flags unresolved recipe names, unknown acquisition/availability, unverified route
  candidates, Scarce-material use, and suspiciously short or long segments.
- Produces diagnostic Markdown only; external guides never mutate canonical recipe
  data or reviewed overrides.

### Personalization without accounts

- Saves current and target skill, route objective, trainer-only mode, shopping
  strategy, region, market, faction, and Forever Changes filters in the browser.
- Restores the saved profile when generating the initial guide and uses its market and
  faction in price, route, and shopping-list requests.
- Validates and versions stored preferences, falls back safely when storage is corrupt
  or unavailable, and provides a one-click reset.
- Saves a Legacy profession bonus for future modeling but does not apply it until the
  underlying Forever behavior is verified.

### Site information and support

- Includes a shared site footer with direct links to privacy, terms, contact, and the
  public source repository.
- Serves readable, responsive Privacy Policy, Terms of Use, and Contact pages at
  `/privacy`, `/terms`, and `/contact` through the existing SPA fallback.
- Uses the public GitHub issue tracker for bug reports, data corrections, and feature
  requests without inventing an unsupported private contact channel.

### Reproducible client-data pipeline

- Converts LibProfessionDB v1.9.1 and LibItemDB v1.6.0 Lua literals without executing
  Lua.
- Reapplies reviewed corrections from a validated, versioned override file.
- Archives exact raw bytes by SHA-256, normalizes immutable build records, and writes
  resumable DSQL-safe batches.
- Imports generic client item labels through
  `ItemSparse.ItemNameDescriptionID → ItemNameDescription`, preserving the source
  product, client build, and locale. The current Leatherworking set contains three
  `Scarce` reagents and four `Crafted` outputs from client build `1.60.1.70450`.
- Imports build-scoped item display names, rarity IDs, equipment slots, armor, item
  stat lines, required levels, and vendor sell prices from the same pinned client.
  Armor is derived from the client's armor-total, quality, location, and shield
  tables. Stat values combine the client's item allocations with its level-, quality-,
  and slot-specific random-property budgets, and use localized client strings rather
  than guessed item-name heuristics.
- Extracts local client icons through `wowdata`, including the equipment-appearance
  fallback path, and writes a build-stamped manifest.
- Produces a repeatable quality audit instead of filling unknown facts with guesses.

## Current data boundary

The bundled target is Forever build `1.60.1.69977`; client-derived item-name
descriptions and tooltip attributes come from installed beta client build
`1.60.1.70450`, while the unchanged icon bundle remains stamped with asset build
`1.60.1.70374`. The Classic Era baseline is build `1.15.9.69722`.

The data is useful but not authoritative:

- all 603 Forever recipes are still marked unverified;
- 484 recipes have supported Forever learning ranks and 119 remain unknown;
- 589 acquisition and availability states remain unknown;
- 630 of 760 referenced items have client tooltip attributes, including rarity; the
  other 130 have no `ItemSparse` row in the pinned client build and remain explicitly
  unenriched;
- 427 referenced items expose 1,174 ordered client stat lines;
- 90 recipes reference at least one item missing an English name in the source
  snapshot;
- 595 output quantities remain provisional after reviewed overrides.

Unknown eligibility remains visible in the UI. Explicitly unavailable recipes and
recipes with unknown learning ranks cannot enter a leveling route.

## Requirements

- Node.js `24.19.0` (pinned in `.node-version`; supported dependency lines are
  22.12, 24, and 26+)
- pnpm `11.19.0`
- Docker Desktop for the full local catalog and comparison workflow
- AWS credentials only for deployment or live DSQL validation
- `wowdata` and a local Forever client only when regenerating icons, client item
  classifications, or tooltip attributes
- Python 3.12 or newer only when using the optional local operations dashboard

## Local operations dashboard

`admin/` contains a standalone, localhost-only NiceGUI console for health checks,
CloudWatch logs and usage, CloudFormation deployment status, and controlled execution
of the repository's existing imports, validation, and deployment commands. It binds
only to `127.0.0.1`, accepts no arbitrary terminal input, and uses the normal AWS
credential chain without storing credentials.

On Windows, create its isolated environment and launch it from the repository root:

```powershell
python -m venv .venv-admin
.\.venv-admin\Scripts\python -m pip install -e ".\admin[dev]"
Copy-Item .env.admin.example .env.admin
.\.venv-admin\Scripts\forever-admin
```

See [`admin/README.md`](admin/README.md) for job registration, source configuration,
AWS permissions, and troubleshooting. The dashboard never runs imports or deploys at
startup; data-writing jobs require confirmation. **Update latest local catalog**
checks for newer compatible LibProfessionDB and LibItemDB releases, regenerates only
when a source file ID changed, and checks the exact hashes already loaded in local
PostgreSQL. It skips imports when the catalog is current; otherwise it recreates the
disposable database and imports Classic followed by Forever in one fail-fast workflow.
The Jobs page reports the pinned source versions and whether that operation changed
them. Staging and production publication remain separate reviewable operations.

## Full local start

Install dependencies once:

```text
pnpm install
```

Start disposable PostgreSQL, import the Classic baseline, then import Forever while
generating the comparison:

```text
pnpm db:local:up
pnpm data:import:local data/imports/classic-era-1.15.9.69722-leatherworking.json
pnpm data:import:local data/imports/forever-1.60.1.69977-leatherworking.json --compare-against data/imports/classic-era-1.15.9.69722-leatherworking.json --comparison-type classic-forever
```

Start the API in one terminal. PowerShell:

```powershell
$env:LOCAL_DATABASE_URL = "postgresql://forever_professions:local-only@127.0.0.1:55432/forever_professions_local"
pnpm dev:api
```

Git Bash:

```bash
export LOCAL_DATABASE_URL='postgresql://forever_professions:local-only@127.0.0.1:55432/forever_professions_local'
pnpm dev:api
```

Start Vite in another terminal:

```text
pnpm dev:web
```

- Web: `http://localhost:5173`
- API: `http://localhost:3001`
- PostgreSQL: `127.0.0.1:55432`

Vite proxies `/api` to the local API. PostgreSQL uses container `tmpfs`; `pnpm
db:local:down` removes the normalized database. Content-addressed raw imports under
ignored `.local-data/` remain on disk.

The API can run without `LOCAL_DATABASE_URL`, but it then serves only the small
illustrative fixture. The browser also falls back to that fixture if the API cannot
load. Forever Changes requires both imported builds and a stored comparison.

## Common commands

```text
pnpm verify                    # typecheck, tests, builds, CDK synth
pnpm typecheck                 # all workspace typechecks
pnpm test                      # all workspace unit tests
pnpm build                     # all packages and apps
pnpm api:smoke                 # fixture-oriented smoke; run API without LOCAL_DATABASE_URL
pnpm api:smoke:cloud -- <url>  # data-driven full-contract smoke through CloudFront
pnpm api:request -- /api/health
pnpm api:optimize -- 150 180 crafts
pnpm api:shopping -- 33.375 cheapest  # fixture recipe IDs; fixture API only
pnpm guide:validate               # compare the real 1–300 route with the checked-in reference
pnpm data:audit data/imports/forever-1.60.1.69977-leatherworking.json data/imports/forever-1.60.1.69977-leatherworking.quality.md
pnpm infra:synth:staging          # strict CDK + cdk-nag validation of existing stacks
pnpm infra:synth:production       # strict validation of isolated production stacks
pnpm infra:synth:delivery         # validate GitHub OIDC roles and the cost guardrail
pnpm infra:bootstrap:staging      # create the isolated staging CDK toolkit
pnpm infra:bootstrap:production   # create the isolated production CDK toolkit
pnpm infra:diff:staging           # requires approved non-root AWS access
pnpm infra:diff:data:staging      # review only the stateful staging stack
pnpm infra:deploy:data:staging    # deploy only the reviewed staging data stack
pnpm db:migrate:dsql              # checksum-ledger catalog + pricing migrations
pnpm db:roles:dsql                # map and verify scoped DSQL runtime roles
pnpm infra:diff:delivery          # inspect delivery identity/budget changes
```

Pull requests into `stage` or `main` run the pinned GitHub Actions validation workflow.
Feature work merges into `stage`, whose successful pushes deploy staging. Production
receives only reviewed `stage -> main` promotions; successful `main` pushes deploy the
approval-gated production environment. Each stage uses a distinct CDK bootstrap
qualifier, short-lived OIDC role, and stack-scoped deploy role; staging credentials
cannot operate the production or shared delivery stacks. The repository stores no AWS
access keys. See [ops/README.md](ops/README.md) for delivery-stack deployment,
environment setup, and the branch-protection activation sequence.

See [docs/API_TESTING.md](docs/API_TESTING.md) for every endpoint and
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for setup gotchas, ownership boundaries,
and the expected workflow for agents and contributors.

`api:smoke` and `api:shopping` currently use the small fixture's stable recipe IDs;
they are not full-catalog smoke commands. Use `api:request`, `api:optimize`, and the
documented change endpoints when the PostgreSQL catalog is selected.

## Regenerating data and item assets

The source archives are intentionally not vendored. Once exact LibProfessionDB and
LibItemDB roots are available, regenerate the target dataset, client labels, icon
manifest, and icons with:

```text
pnpm data:convert:professiondb <ProfessionDB-root> <ItemDB-root> data/imports/forever-1.60.1.69977-leatherworking.json Forever - data/imports/forever-leatherworking-overrides.json "C:\World of Warcraft" apps/web/public/icons/items
pnpm data:audit data/imports/forever-1.60.1.69977-leatherworking.json data/imports/forever-1.60.1.69977-leatherworking.quality.md
```

When the source snapshot is already current, refresh only its pinned client metadata
without the addon archives:

```text
pnpm data:enrich:client data/imports/forever-1.60.1.69977-leatherworking.json "C:\World of Warcraft"
pnpm data:audit data/imports/forever-1.60.1.69977-leatherworking.json data/imports/forever-1.60.1.69977-leatherworking.quality.md
```

The converter resolves one installed client build and pins every subsequent DB2 and
icon read to that build. Do not replace client classifications with a manually
maintained item-name list. Full provenance, archive versions, checksums, and licensing
notes live in [data/imports/README.md](data/imports/README.md) and
[data/imports/THIRD_PARTY_NOTICES.md](data/imports/THIRD_PARTY_NOTICES.md).

## Architecture and repository map

```text
apps/web                   React 19 + Vite UI
apps/api                   Thin HTTP router, local Node server, Lambda handler
apps/pricing-worker        Scheduled AH Ledger refresh Lambda
packages/contracts         Shared Zod schemas and inferred boundary types
packages/domain            Deterministic profession math and data quality
packages/optimizer         Stateful leveling-route optimization
packages/shopping          Shopping-list and nested-crafting planner
packages/pricing           Providers, normalized observations, price persistence
packages/ingestion         Conversion, normalization, comparisons, SQL readers/writers
data/fixtures              Small illustrative fallback data
data/imports               Reproducible build snapshots, overrides, and audits
ops                        AWS CDK application
docs                       Current guides plus historical roadmaps
sources                    Synced read-only project reference material
```

Dependency direction is one-way: applications may consume shared packages; domain
packages do not depend on applications or AWS. `packages/contracts` owns shared Zod
schemas. The API remains thin, and vendor-specific responses stop at provider
adapters.

## Public API

```text
GET  /api/health
GET  /api/ready
GET  /api/professions
GET  /api/professions/:professionId
GET  /api/professions/:professionId/recipes
GET  /api/recipes/:recipeId
GET  /api/recipe-changes
GET  /api/recipe-changes/summary
GET  /api/auction/markets
GET  /api/auction/prices
POST /api/routes/optimize
POST /api/shopping-list
```

All request and response boundaries are validated with shared contracts. Missing
catalog, comparison, or pricing dependencies return explicit errors rather than
fabricated data. `/api/health` is process liveness; `/api/ready` checks the configured
database with the application-reader identity and returns only `ready` or
`unavailable`. Production browser requests are same-origin through CloudFront, so the
production API emits no wildcard CORS header. Staging and local development retain
explicit wildcard CORS for testing.

## Documentation map

- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): current architecture, local workflow,
  invariants, and contribution/agent handoff notes.
- [docs/FOREVER_CHANGES.md](docs/FOREVER_CHANGES.md): implemented comparison pipeline,
  UI behavior, and remaining work.
- [docs/GUIDE_VALIDATION.md](docs/GUIDE_VALIDATION.md): reproducible route baselines,
  external-guide comparison, current findings, and review order.
- [docs/PERSONALIZATION.md](docs/PERSONALIZATION.md): browser-local profile fields,
  runtime behavior, trust boundary, and reset/failure handling.
- [docs/API_TESTING.md](docs/API_TESTING.md): local and deployed endpoint testing.
- [docs/CLOUD_DEPLOYMENT_ROADMAP.md](docs/CLOUD_DEPLOYMENT_ROADMAP.md): staged AWS
  infrastructure, data promotion, delivery, security, rollback, and launch plan.
- [docs/CLOUD_DEPLOYMENT_DECISIONS.md](docs/CLOUD_DEPLOYMENT_DECISIONS.md): accepted
  cloud account, ownership, domain, tagging, budget, and recovery decisions.
- [ops/README.md](ops/README.md): stage configuration, CDK commands, bootstrap,
  outputs, and infrastructure security checks.
- [data/imports/README.md](data/imports/README.md): exact imported datasets, trust
  boundary, hashes, and regeneration commands.
- [packages/ingestion/README.md](packages/ingestion/README.md): normalization,
  persistence, comparison generation, and client-asset extraction.
- [packages/optimizer/README.md](packages/optimizer/README.md): route behavior and
  Scarce-material policy.
- [docs/ROADMAP_2.md](docs/ROADMAP_2.md): product direction; phase files are historical
  implementation records and may describe the state at the date shown.

The root and scoped `AGENTS.md` files contain mandatory working rules. In particular,
everything under `sources/` is read-only.
