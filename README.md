# Forever Professions

Forever Professions is a TypeScript monorepo for a data-driven World of Warcraft:
Forever profession leveling planner. It covers all six crafting professions, Cooking,
First Aid, Fishing, and Mining (smelting), and combines an optimized leveling guide, recipe calculator, best-crafts shortlist, and a
build-generated Classic Era → Forever change browser.

The product is guide-first:

```text
versioned recipe data
        ↓
skill-up and eligibility math
        ↓
stateful route optimization
        ↓
leveling guide + calculator + best crafts
```

Recipe and comparison data retain their build, source, and verification state. A
missing or Classic-borrowed value is never silently presented as verified Forever
data.

## Current features

### Profession selection

- Start at `/` and choose a profession before entering its workspace at
  `/professions/<profession-id>`.
- Shows client-derived profession artwork on the home page and in each profession
  header, with lazy-loaded directory icons and an initials fallback.
- Groups home-page profession choices inside the calculator's decorative frames,
  with a named title plate for Crafting, Secondary, and Gathering professions.
- Includes all three gathering professions: Herbalism, Mining, and Skinning.
  Gathering pages show 62 client abilities, exact per-craft reagents, supported
  create-item links, 99 herb/ore sources, and 24,390 unverified community location
  reports with search, zone selection, and pagination. Skinning creature loot and
  locations remain unknown. See [Gathering data](docs/GATHERING_DATA.md) for source
  review, provenance limits, extraction, and import commands.
- Switch professions with the native dropdown in the top-left navigation. Each
  workspace loads its own catalog, route, prices, and Classic-to-Forever comparison.
- Current skill is saved independently per profession. Existing root recipe links
  and Leatherworking field-guide URLs remain supported.
- Missing catalogs show an explicit loading, empty, or retryable error state.
- The full import includes 2,511 Forever records and 1,565 Classic baseline records.
  First Aid, Fishing, and Mining currently have evidence gaps that block complete
  routes; those gaps are shown instead of inventing progression data. Fishing
  records are recipes/training spells, not a catch-rate or activity-leveling model.
- Enchantments and training spells without item outputs remain usable records;
  teaching items are never presented as crafted outputs.

### Leveling guide

- Generates a 1–300 route where the loaded catalog supports it, with explicit blockers for evidence gaps. Current skill highlights
  and scrolls to the player's place without removing earlier or later guide ranges.
- Shares a native current-skill slider across guide, catalog, and changes views,
  with a larger grab area, live updates, and keyboard/stepper controls.
- Limits the full guide to the current Forever base profession cap of 300, configured
  once in the shared domain package.
- Automatically generates the web guide with the Practical preset. The optimizer API
  also supports Trainer friendly, Cheapest, Fewest crafts, Fewest materials, and Experimental.
- Uses dynamic programming with preset-owned recipe-switch, acquisition-friction,
  evidence, and cost policies. Practical uses complete stored price coverage as a
  deterministic tie-breaker when the stronger safeguards and craft score are equal.
- Uses Practical by default: supported acquisition and availability win over unknown
  evidence whenever they can complete the same route. Supported presets block at the
  first skill that would require unknown evidence; Experimental may use those gaps but
  never rejected evidence.
- Supports known-recipe selection, faction/specialization/cooldown
  constraints, and explicit recipe or reagent exclusions at the API boundary.
- Groups adjacent decisions into practical guide steps and exposes ordinary
  alternatives. Every returned segment and alternative includes machine-readable
  acquisition, availability, provenance, verification, confidence, and risk reasons.
  Selected recipes and alternatives also carry stable recommendation/loss reason
  codes and optimizer-authored explanations.
- Treats reagents carrying Forever's client-defined `Scarce` label as a last resort:
  a complete non-Scarce route wins even when its ordinary objective score is higher.
- Opens each guide step in the calculator at the relevant skill and shows New/Updated
  Forever badges when comparison data exists.
- Presents generated segments as a checklist in the left panel with the active skill range
  and acquisition. The calculator shows materials and recipe evidence. Completion is saved only for the exact matching
  build, range, preset, resolved objective and confidence policy, constraints,
  market, and route.

### Best crafts

- Provides a class/role equipment shortlist for Leatherworking, Tailoring, and
  Blacksmithing. Other professions hide this tab. Initial profiles are Rogue,
  Mage, and Warrior respectively; class and role remain selectable.
- Uses fixed character-level targets of **20, 30, 40, 50, 55, and 60**, researched once
  from the pinned catalog. Exact equip levels remain visible, and strong earlier crafts
  can remain recommended at later targets.
- Compares known Forever equipment stats by role, showing a leading craft and up to
  two alternatives per slot. Recommendations use transparent editorial priorities,
  not simulated combat output or all-source best-in-slot claims.
- Preserves unknown learning skills, pattern availability, faction and specialization
  restrictions. Unsupported item data, rejected/unavailable recipes, samples, and
  Classic fallbacks never become ranked Forever recommendations.
- Opens each craft in the existing URL-addressable calculator. Class, role and level
  choices survive switching between workspace tabs for the current page session.
- Documents the bracket evidence and comparison policy in
  [`docs/CRAFTING_MILESTONES.md`](docs/CRAFTING_MILESTONES.md).

### Recipe catalog and calculator

- Loads ten profession catalogs (2,511 records) from PostgreSQL/Aurora DSQL.
- Provides a virtualized, searchable All Recipes list and URL-addressable recipe
  selection (`?recipe=<recipe-id>`).
- Filters the full catalog by acquisition, learning range, item type,
  specialization, faction compatibility, availability, verification, and stored
  Forever comparison state. Sorts cover learning rank, current-skill usefulness,
  expected market cost, and each difficulty threshold; incomplete price coverage
  remains explicit and sorts after supported totals.
- Shows compact orange/yellow/green/grey thresholds without relying on color alone,
  keeps unknown source facts visible, and compares a selected catalog recipe with
  the active route segment without discarding route or checklist context.
- Provides directly addressable Leatherworking field-guide pages for the current
  build, stored Forever changes, trainer evidence, specializations, Merchant's Favor,
  Camping, and supported vendor, quest, reputation, and drop acquisition records.
  Unsupported names, locations, rates, and unlock rules remain visibly unknown.
- Records a strict set of first-party anonymous product events for the route-to-
  shopping funnel. The accepted fields and retention boundary are documented in
  [`docs/PRODUCT_ANALYTICS.md`](docs/PRODUCT_ANALYTICS.md).
- Shows Materials required as integer quantities for one craft, with per-craft material
  costs independent of skill-up chance.
- Calculates difficulty, skill-up probability, expected crafts, expected reagents,
  and stored-price cost at the selected profession skill.
- Shows the skill curve only through the configured base profession cap. Recipes
  with higher imported thresholds retain and expose those raw values in a compact
  advanced-data note instead of extending the normal progression graph.
- Shows materials, output, acquisition facts, build, provenance, and verification
  status. Requirements above the base cap remain visible and are flagged as unusual
  rather than silently rewritten.
- Uses 2,720 build-stamped WebP item icons. Off-screen list and change-card images are
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
- The bundled comparison contains 965 New, 972 Updated, 19 Removed, and 574
  Unchanged records (2,530 logical recipes), scoped to the selected profession.

### Shopping API and pricing

- Provides shopping plans through `POST /api/shopping-list`. The web client's shopping
  controls, checklist, owned-quantity persistence, copy/print actions, guide settings,
  route sharing, bulk completion and expandable step metrics have been removed.
- Supports cheapest, buy-only, and craft-first strategies with guarded recursive
  intermediate crafting.
- Keeps buy and craft paths separate, preserves missing prices and unresolved
  crafting sources, and detects cycles.
- Distinguishes complete totals from partial known subtotals and retains the oldest
  price observation used in the API response.
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

- Saves current skill, region, market, faction, and
  Forever Changes filters in the browser. Route bounds are fixed at 1–300 and are not
  persisted.
- Saves individually checked route steps under a separate route fingerprint.
- Restores the saved profile when generating the initial guide and uses its market and
  faction in price and automatic route requests.
- Validates and versions stored preferences, falls back safely when storage is corrupt
  or unavailable, and provides a one-click reset.
- Saves a Legacy profession bonus for future modeling but does not apply it until the
  underlying Forever behavior is verified.

### Site information and support

- Centers the sidebar and main workspace together in a fluid container capped at
  1400px, leaving room on both sides on wide displays. The masthead and navigation
  remain full width; guide and information pages share the same content limit.
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
  product, client build, and locale. The full set contains 13 classified items
  from client build `1.60.1.70630`, preserving `Scarce` and `Crafted` labels.
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

The target recipe snapshot is Forever build `1.60.1.69977` and the Classic Era
baseline is `1.15.9.69722`. Item labels, rarity, and tooltip attributes come from
installed Forever product `wowf`, client build `1.60.1.70630`, locale `enUS`.
All 2,720 referenced items have WebP icons from the same client build. The compact
schema-v2 manifest preserves item-to-FileDataID mappings and source identity; missing
assets still use the initials fallback.

The data is useful but not authoritative:

- all 2,511 Forever records remain unverified;
- 1,923 learning ranks are supported; 588 remain unknown;
- 2,470 acquisition and availability states remain unknown;
- 2,346 of 2,720 referenced items have client metadata; 374 remain unenriched;
- 1,172 items expose 3,028 client stat lines;
- 278 recipes reference an item without an English source name;
- 2,316 output quantities remain provisional; 187 spells have no recorded item output.

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
PostgreSQL. It skips imports when the catalog is current; otherwise it resets the
local catalog volume and imports Classic followed by Forever in one fail-fast workflow.
The Jobs page reports the pinned source versions and whether that operation changed
them. It also provides a managed Start/Stop button for the local Vite frontend at
`http://127.0.0.1:5173` and a separate local API button that automatically uses the
loopback PostgreSQL catalog at `127.0.0.1:55432`. These local services require no AWS
login or token. Staging and production publication remain separate reviewable
operations.

## Full local start

Install dependencies once:

```text
pnpm install
```

Start local PostgreSQL, import the Classic baseline, then import Forever while
generating the comparison:

```text
pnpm db:local:up
pnpm data:import:local data/imports/classic-era-1.15.9.69722-professions.json
pnpm data:import:local data/imports/forever-1.60.1.69977-professions.json --compare-against data/imports/classic-era-1.15.9.69722-professions.json --comparison-type classic-forever
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

Vite proxies `/api` to the local API. PostgreSQL uses a named Docker volume, so the
normalized catalog survives container and Docker Desktop restarts. `pnpm db:local:down`
stops the database without deleting it; `pnpm db:local:reset` explicitly removes the
local catalog volume when an immutable dataset or migration mismatch requires a clean
import. Content-addressed raw imports under ignored `.local-data/` remain on disk.

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
pnpm data:audit data/imports/forever-1.60.1.69977-professions.json data/imports/forever-1.60.1.69977-professions.quality.md
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
pnpm data:convert:professiondb <ProfessionDB-root> <ItemDB-root> data/imports/forever-1.60.1.69977-professions.json Forever - data/imports/forever-leatherworking-overrides.json "C:\World of Warcraft" apps/web/public/icons/items
pnpm data:audit data/imports/forever-1.60.1.69977-professions.json data/imports/forever-1.60.1.69977-professions.quality.md
```

When the source snapshot is already current, refresh only its pinned client metadata
without the addon archives:

```text
pnpm data:enrich:client data/imports/forever-1.60.1.69977-professions.json "C:\World of Warcraft"
pnpm data:audit data/imports/forever-1.60.1.69977-professions.json data/imports/forever-1.60.1.69977-professions.quality.md
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
