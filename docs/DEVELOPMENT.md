# Development and agent handoff guide

This is the current-state guide for contributors and agents entering the repository.
The dated roadmap documents explain how the system evolved; they are not the best
source for current commands or runtime behavior.

## Read first

1. Read the root `AGENTS.md`, then the nearest scoped `AGENTS.md` for files you will
   change.
2. Read the root `README.md` for implemented features and the full local start.
3. Read `data/imports/README.md` before changing imported game data.
4. Read the package README for ingestion, optimizer, pricing, or shopping changes.
5. Treat every file under `sources/` as read-only synced reference material.

## Current system shape

```text
LibProfessionDB + LibItemDB + reviewed overrides + pinned client DB2
                              |
                    imported build JSON
                              |
            raw archive + normalized SQL records
                    /                   \
        current recipe catalog      stored build comparison
                    |                   |
             API + optimizer       Forever Changes API
                    \                   /
                      React/Vite client
```

The current recipe data covers ten professions. The directory additionally includes
Herbalism and Skinning. Separate gathering evidence covers all three gathering professions:

| Purpose | Build | File |
| --- | --- | --- |
| Classic comparison baseline | `1.15.9.69722` | `data/imports/classic-era-1.15.9.69722-professions.json` |
| Forever target catalog | `1.60.1.69977` | `data/imports/forever-1.60.1.69977-professions.json` |
| Client icons | `1.60.1.70630` (`wowf`, `enUS`) | `apps/web/public/icons/items/manifest.json` |
| Item labels and tooltip metadata | `1.60.1.70630` (`wowf`, `enUS`) | Classification and client-data source metadata in the Forever catalog |

The target contains 2,511 records and 2,720 referenced items. Its Classic →
Forever comparison is 965 New, 972 Updated, 19 Removed, and 574 Unchanged logical
recipes. All 2,720 referenced items have generated WebP icons; missing assets
still use the initials fallback. The compact schema-v2 manifest retains item IDs,
FileDataIDs, and client provenance, with paths derived from item IDs.

## Ownership boundaries

| Area | Owner | Important rule |
| --- | --- | --- |
| Shared API/data shapes | `packages/contracts` | Validate every external boundary with Zod. |
| Profession math and quality | `packages/domain` | Pure, deterministic, framework-independent. |
| Route selection | `packages/optimizer` | No UI or database dependencies. |
| Shopping decisions | `packages/shopping` | Missing prices/sources remain explicit. |
| Auction providers/storage | `packages/pricing` | Integer copper; vendor shapes stay in adapters. |
| Build conversion/storage/diffs | `packages/ingestion` | Preserve exact bytes, builds, provenance, and immutable rows. |
| HTTP adaptation | `apps/api` | Thin routing into testable package/application functions. |
| Browser presentation | `apps/web` | Keep loaded-data interactions client-side; do not duplicate optimizer logic. |
| AWS resources | `ops` | CDK v2, stable construct IDs, explicit retention/removal behavior. |

Applications may depend on shared packages. Shared packages must not depend on an
application. In particular, React components never implement route optimization and the API
never calls AH Ledger in a user request.

### Best crafts and automatic guide

The main workspace contains Recipe calculator, with Best crafts available only for
Leatherworking, Tailoring, and Blacksmithing. Their initial class profiles are
Rogue, Mage, and Warrior respectively. The left panel owns
the automatic Practical leveling guide and individual completion checkboxes.
Guide settings, known-recipe selection, sharing, shopping, bulk completion and
expandable step metrics have been removed from the web client. Their request
handlers, dialogs and browser persistence are also removed. Old shared-route query
parameters no longer activate settings or select a preset. The shopping and route
optimizer APIs remain available as package/API capabilities.

`packages/domain/src/best-crafts.ts` owns fixed character-level targets, class/role
profiles, armor eligibility, and deterministic equipment comparisons. `BestCrafts.tsx`
only presents the loaded catalog results. No new API calls or dataset regeneration
are required. Rankings are editorial weighted stat comparisons, not profession
skill-up optimization or all-source BiS. Keep those boundaries visible. Class, role
and target state lives in App so opening a recipe does not reset the shortlist.

See [`CRAFTING_MILESTONES.md`](CRAFTING_MILESTONES.md) for the one-time bracket
research, source restrictions and ranking limitations. Only the current Forever
1.60 client metadata from `wowf` or the earlier `wow_classic_beta` product is
supported. Unknown learning skill does not prevent gear
comparison, but still prevents entry into a leveling route under existing policies.

### Profession progression cap

`packages/domain/src/profession-cap.ts` owns the current Forever build's base
profession cap. The web skill controls and probability graph, browser preferences,
API route guard, and optimizer all consume that shared value. The cap limits normal
user-facing progression only: imported recipe thresholds remain unchanged, and the
pure skill-up math can still evaluate raw above-cap values for diagnostics and future
mechanics.

## Local runtime

Services use fixed local ports:

| Service | Address |
| --- | --- |
| Vite | `http://127.0.0.1:5173` |
| API | `http://127.0.0.1:3001` |
| PostgreSQL | `127.0.0.1:55432` |

Vite proxies `/api` to port 3001. The API selects PostgreSQL only when
`LOCAL_DATABASE_URL` is present; otherwise it serves the illustrative fixture and has
no stored recipe comparison.

Use this import order for the complete UI:

```text
pnpm db:local:up
pnpm data:import:local data/imports/classic-era-1.15.9.69722-professions.json
pnpm data:import:local data/imports/forever-1.60.1.69977-professions.json --compare-against data/imports/classic-era-1.15.9.69722-professions.json --comparison-type classic-forever
```

The PostgreSQL container stores its database in a named Docker volume. Normalized data
therefore survives container and Docker Desktop restarts. `pnpm db:local:down` stops
the service without deleting the catalog; `pnpm db:local:reset` explicitly removes the
volume when a clean import is required. Raw objects under `.local-data/` are
content-addressed and persist. The container includes `psql`; contributors do not need
a host installation. For an interactive local query after `pnpm db:local:up`, run:

```text
docker compose -f docker-compose.local.yml exec postgres psql -U forever_professions -d forever_professions_local
```

### Immutable-build regeneration gotcha

`wow_build` binds one build ID to the exact imported raw hash. If a checked-in JSON
snapshot is regenerated with different bytes but the same game build ID, importing it
over the existing local row correctly reports an immutable-value conflict. Reset the
local catalog volume, reimport the baseline, and then reimport the target with
the comparison. Do not weaken the immutable writer to make this go away.

The catalog reader serves the most recently imported build. The recipe-change reader
serves the latest stored comparison of the requested comparison type.

## Data and trust invariants

- Never infer a missing Forever fact from a recipe name or from a Classic value.
- A borrowed Classic value must retain fallback provenance and must not be promoted to
  a supported Forever value.
- Presence in client files does not prove that a recipe is obtainable in game.
- Explicitly unavailable recipes never enter routes. Unknown availability is
  permissive but visible; unknown learning rank is ineligible.
- Recipe identity for comparisons is `(professionId, spellId)`, not display name or
  row ID.
- Comparisons store Unchanged records too, allowing summaries to be reconstructed
  exactly. The UI hides them by default.
- Enriching an item with icon, item-name-description, rarity, or tooltip metadata is not a
  gameplay recipe change and must not turn a recipe into Updated.
- Forever's `Scarce` designation comes from client
  `ItemSparse.ItemNameDescriptionID → ItemNameDescription`. Do not maintain a list of
  item names. Store generic classification metadata and let the optimizer interpret
  the `Scarce` label.
- Classification records are scoped to the recipe build and also retain their actual
  client source product/build/locale because enrichment may come from a newer client
  than the recipe archive.
- Tooltip records are also recipe-build scoped and retain their actual client source.
  Ordered stat lines preserve both their numeric stat identity and the localized client
  display text. A missing `ItemSparse` row stays missing; do not backfill name, rarity,
  level, armor, stat lines, or sell price from another game version.
- Missing auction prices are unavailable, never zero.

## Item assets

Item images are static WebP files under `apps/web/public/icons/items`. The manifest
records recipe build, asset build, FileDataID mappings, and missing item IDs. Keeping
these deterministic assets in the web build is the current deployment strategy; the
React `ItemIcon` component prevents every image from loading at startup by using
native lazy loading for non-hero images.

Every recipe, change-card, output, and reagent icon uses the shared item-tooltip
surface. Pointer hover opens a preview after one second and leaving the owning
control closes that preview immediately. Focusing a recipe button or change row
opens the same preview for keyboard users, and Escape dismisses either mode.
Forever Changes resolves current recipes through the calculator's catalog tooltip
payload so the same item exposes the same fields in both views; removed recipes fall
back to the smaller comparison snapshot because no current catalog record exists.
Calculator output and reagent icons are also buttons that pin the tooltip, move focus
to its close control, and restore focus when the close button or Escape dismisses it;
an outside click also closes it. Tooltip content is limited to catalog-backed item
class, subclass, item rarity, equipment slot, armor, ordered item stats, required
level, vendor sell price, classification, quantity, recipe, market price, and ID
facts. Attribute stat lines use ordinary tooltip text and equip-effect lines use green
text, with the effect meaning also stated in the content. Do not infer binding or any
other field absent from the imported data. Rarity comes from
`ItemSparse.OverallQualityID`; do not derive it from an item name or icon. Visible item
and crafted-output names use the shared `getItemRarityNameClass` helper so the guide,
catalog, calculator, changes view, route planner, shopping list, and tooltip stay
consistent. Missing or unsupported quality IDs inherit the surrounding text color
instead of being guessed. Provisional output quantities must remain visibly labeled
provisional.

The production web build runs `apps/web/scripts/check-build-budget.mjs` after Vite.
It caps total bootstrap assets at 3.25 MB, JavaScript at 525 KB raw/155 KB gzip, CSS
at 115 KB raw/28 KB gzip, the item-icon manifest at 80 KB, and each lazy item icon at
10 KB. These thresholds provide modest headroom over the October 20, 2026 release
candidate and are regression limits, not performance targets. A deliberate budget
increase requires a measured product reason and review; do not raise a threshold just
to make the build pass.

The converter queries the installed client with `wowdata`. It resolves `latest` once,
then pins all DB2 and icon reads to the returned build. It joins `Item` and
`ItemSparse` for names, rarity, item types, slots, required levels, and sell prices. Base
armor comes from `ItemArmorTotal`, `ItemArmorQuality`, and `ArmorLocation`; shields
come from `ItemArmorShield`. Equipment without a direct `Item.IconFileDataID` falls
back through `ItemModifiedAppearance` and `ItemAppearance.DefaultIconFileDataID`.

## Static site pages

The shared `--content-max-width` token in `apps/web/src/styles.css` caps the combined
planner sidebar and main content, knowledge pages, legal pages, and footer content
at 1400px. The masthead and navigation remain outside that centered content area.
Keep the outer margins available for future rails or background art. Planner and
knowledge panels use named CSS containers to reflow within their available width;
viewport breakpoints still control the full-width navigation and sidebar stacking.

`apps/web/src/main.tsx` shows the profession directory at `/` and resolves
`/professions/<id>` to a profession-specific workspace. Legacy root recipe links remain
supported. The native dropdown navigates between professions using ordinary links
with full page state isolation. It also resolves `/privacy`, `/terms`, `/contact`, and the focused
`/leatherworking/*` knowledge pages before mounting the planner. Legal/support content
and metadata live in `StaticPage.tsx`; build-scoped profession content lives in
`LeatherworkingKnowledgePage.tsx`; every surface reuses `SiteFooter.tsx`. Navigation
uses ordinary links so direct loads, refreshes, and browser history work without a
client router dependency.
CloudFront rewrites extensionless paths to `index.html` only on the default frontend
behavior; keep that SPA fallback when changing hosting or these clean paths will fail
on direct load. Never restore a distribution-wide 403/404 custom error response,
because it would turn `/api/*` errors into HTML success responses.

## Cloud infrastructure configuration

The CDK app has typed `staging` and `production` configuration in
`ops/lib/deployment-config.ts`. Staging deliberately preserves the existing stack
names, SSM paths, scheduler name, and stateful logical IDs. Production uses separate
stack names, parameters, schedules, buckets, roles, and DSQL storage in the same
accepted account and region.

Strict synthesis runs `cdk-nag`. Suppressions are construct-scoped, carry an explicit
reason, and are emitted into CloudFormation metadata for review. Staging retains logs
for 7 days; production retains them for 14 days. Both application and data stacks use
termination protection.

Use the root `infra:synth:*`, `infra:diff:*`, and `infra:deploy:*` commands rather than
reconstructing CDK context by hand. The default workspace synth targets staging for
compatibility with the existing deployment. Read `ops/README.md` for the exact stage
mapping and bootstrap rules. Never run bootstrap, diff, or deploy through the AWS root
identity.

The independently deployed `ForeverProfessionsDelivery` stack owns the account's
GitHub OIDC provider, immutable-repository trust policies, stage delivery roles, and
the USD 10 monitoring budget. The roles may assume only the named modern CDK bootstrap
roles, publish to the stage's generated site-bucket prefix, invalidate CloudFront
distributions with matching application/stage tags, and assume the stage ingestion
role. GitHub environment variables contain role ARNs and account metadata only; never
replace OIDC with long-lived AWS secrets.

The validation workflow uses exact action commit SHAs and the repository-pinned Node
and pnpm versions. Keep `Verify repository` as the required `main` check after the
workflow is published. Both GitHub environments admit only `main`, production requires
a human approval, and AWS workflow concurrency is keyed by environment.

## Forever Changes behavior

The comparison engine tracks name, reagents, outputs, four thresholds, learning rank,
acquisition, faction, specialization, cooldown, and availability. It only reports a
target field as changed when target evidence is comparable; unknown learning,
acquisition, availability, and unanchored orange placeholders do not create false
updates.

The UI currently has no comparison chooser. The Forever Changes tab intentionally
shows the stored Classic Era → Forever comparison. API and persistence support
`forever-build` comparisons for future use.
Change rows open the current recipe calculator instead of expanding comparison
details. Selection resolves by `(professionId, spellId)`, updates `?recipe=...&view=recipes`
in one history entry, and supports reloads and Back navigation. Removed recipes
without a matching current catalog row remain visible with calculator navigation
unavailable; Classic data never becomes an invented current recipe. Field-level
comparison evidence remains available through the comparison API.

The shared current-skill slider powers change availability tags and the filters for
recipes above current skill or with unknown requirements. Item-type filtering prefers
LibItemDB class/subclass metadata and uses name heuristics only as a display fallback.
The image-only gear-slot toggles use imported output `inventoryType` metadata only,
combine selected slots with OR, and intersect with the other filters. Removed
recipes use the base snapshot; current recipes never borrow a missing target slot
from Classic. With no slot selected, unknown and non-equipment outputs remain visible. Reset filters
clears the saved slot selection along with the other optional filters.
The Sort popover sorts the filtered list by name or learning skill, toggling
ascending/descending when the selected option is clicked again. Unknown skill
requirements remain last in both directions; removed recipes use their base rank.
Sorting is client-side and saved separately from filter restrictions, so Reset
filters preserves the chosen order. Older profiles default to alphabetical ascending.

## Browser-local personalization

The web client owns a versioned local profile in `apps/web/src/personalization.ts`.
It persists current skill, region, market, faction,
the Legacy profession-bonus input, and Forever Changes filters. The guide range is
always 1–300 and is not browser state. The profile contains no
credentials or imported game data. Keep its parser defensive and migrate by adding a
new storage version rather than changing the meaning of an existing version.

Market and faction selections are functional request inputs. The Legacy profession
bonus is storage-only until its Forever behavior is verified and explicitly modeled;
do not silently add it to thresholds. Version 3 migrates the supported fields from
versions 1 and 2 while dropping removed route/shopping settings. Automatic guide
requests include the full catalog's recipe IDs as their known-recipe constraint. See
`docs/PERSONALIZATION.md` for the field and failure-behavior contract.

## Verification expectations

Run checks in proportion to the change. The complete gate is:

```text
pnpm verify
```

Useful focused checks:

```text
pnpm typecheck
pnpm --filter @forever-professions/contracts test
pnpm --filter @forever-professions/ingestion test
pnpm --filter @forever-professions/optimizer test
pnpm --filter @forever-professions/api test
pnpm --filter @forever-professions/web build
pnpm db:local:test
```

After data or SQL changes, also import both real snapshots into disposable PostgreSQL,
query the affected API, and regenerate the quality report. A typecheck alone does not
prove migration ordering, catalog reconstruction, or comparison persistence.

After optimizer, eligibility, threshold, or route-policy changes, run
`pnpm guide:validate` against the PostgreSQL-backed API and review the generated
baseline/report under `data/guide-validation/`. Reference guides are diagnostic
evidence only and must not be promoted into recipe overrides without a supported
source.

The optimizer exposes two evidence policies. `practical` is the default and ranks
known acquisition and availability ahead of an otherwise cheaper unknown option,
while still allowing an explicitly labeled unknown option when it is required to
complete the route. `supported-only` rejects unknown acquisition and availability;
an otherwise reachable route then returns `unsupported-recipe-evidence` at the first
unsupported skill. Rejected recipe evidence is never routable under either policy.

On some Windows sandboxed runs, parallel Vitest workers can lose transformed files
from the sandbox temp directory and report `ENOENT` before tests execute. Re-run the
suite outside that filesystem sandbox or run the focused suite separately; do not
misclassify that host-level temp failure as a product test failure.

## Known limitations

- Ten professions are imported. First Aid, Fishing, and Mining have supported-data gaps
  that block complete routes; Fishing does not model catches or activity-based skill gains.
- Most acquisition/availability facts and every recipe's final verification remain
  incomplete.
- Item-type display heuristics remain necessary for records without LibItemDB type
  metadata.
- Current item assets ship with the web application rather than an object-storage CDN.
- Live market coverage depends on normalized prices refreshed separately from API
  requests.
- The add-on collection approach is deferred; the current pipeline relies on source
  archives, installed-client DB2 data, reviewed overrides, and quality reporting.
- Aurora DSQL migrations 017–026 have not yet completed the same live revalidation as
  migrations 001–016.

## Documentation maintenance

When behavior changes, update the root README and the closest focused document in the
same change. Keep exact dataset hashes in `data/imports/README.md`, endpoint examples in
`docs/API_TESTING.md`, and component/package invariants in their package README or
scoped `AGENTS.md`. Mark dated roadmap claims as historical rather than silently
treating them as current truth.

## Full profession imports

The shared `PROFESSIONS` registry defines twelve directory identities, including
Herbalism and Skinning. These two have null `sourceName` values because the pinned
recipe archive has no tables for them. Their dedicated web pages request the separate
gathering API, with explicit loading, retryable errors, provenance, and missing-data
states. Mining's gathering page is available through its Gathering link while its
normal route remains the smelting calculator.
`RECIPE_PROFESSIONS` selects the ten source-backed recipe identities, including the
`first-aid` slug and upstream `Firstaid.lua` filename. The converter
requires every selected core and English-name table and validates a single build
before bundling. Non-Leatherworking recipe IDs are namespaced by profession to avoid
cross-profession spell collisions; Leatherworking IDs retain existing public links.
Comparison identity remains `(professionId, spellId)`.

The existing normalized profession/recipe tables already support this expansion;
no schema migration is needed. Import each complete build once, not one dataset per
profession: a build hash is immutable. Reset the disposable local catalog when
replacing the earlier Leatherworking-only build, then import Classic followed by
Forever. Never replace applied migrations or relax immutable writes.

Enchantments and training spells may have empty item-output arrays at import,
catalog, comparison, and shopping boundaries. This means no item output is recorded;
it does not identify the teaching item as an output. Shopping still aggregates their
reagents and indexes only actual outputs for nested crafting.

Run `pnpm api:smoke:professions` after importing to exercise catalog reconstruction,
profession-scoped comparisons, full-range route eligibility, and shopping for every
recipe-backed profession against local PostgreSQL. Prices in this test are deliberately unavailable.

### Profession artwork

`ProfessionIcon` reuses the lazy-loading and error fallback in `ItemIcon`. Directory
entries load lazily; profession switchers and the Leatherworking field guide load the
selected profession icon eagerly. Profession artwork comes from the pinned client's
`SkillLine.SpellIconFileID`, separate from item icons and gameplay snapshots.
`apps/web/public/icons/professions/manifest.json` records the source product, build,
region, locale, skill-line identity, FileDataID, output path, and SHA-256 for each asset.
Regenerate it with `pnpm data:icons:professions "C:\World of Warcraft" 1.60.1.70630`.

### Gathering evidence

[GATHERING_DATA.md](GATHERING_DATA.md) documents the client extractor, pinned external
source review, observation interchange, migrations 029–037, local/live import paths,
and API boundaries. Gathering datasets use independent content hashes and publication
headers; they never change recipe-build hashes. Page requests read stored facts only,
and location pagination pins the dataset hash. Client ranks and community skill
claims do not become verified harvest requirements or optimizer inputs.

### Recipe material quantities

The calculator's Materials required table displays the recipe's canonical integer
reagent quantities for exactly one craft, independent of current skill or skill-up
probability. Its material costs also cover one craft. Expected attempts and expected
cost per skill-up remain explicitly labeled estimates in the calculator summary.
