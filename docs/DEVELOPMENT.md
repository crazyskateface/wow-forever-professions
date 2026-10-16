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

The current product data is Leatherworking only:

| Purpose | Build | File |
| --- | --- | --- |
| Classic comparison baseline | `1.15.9.69722` | `data/imports/classic-era-1.15.9.69722-leatherworking.json` |
| Forever target catalog | `1.60.1.69977` | `data/imports/forever-1.60.1.69977-leatherworking.json` |
| Client icons and item labels | `1.60.1.70374` | `apps/web/public/icons/items/manifest.json` plus classification source metadata |

The target contains 603 recipes and 760 referenced items. Its current Classic →
Forever comparison is 289 New, 227 Updated, 0 Removed, and 87 Unchanged logical
recipes.

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
application. In particular, the UI never decides which recipe is optimal and the API
never calls AH Ledger in a user request.

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
pnpm data:import:local data/imports/classic-era-1.15.9.69722-leatherworking.json
pnpm data:import:local data/imports/forever-1.60.1.69977-leatherworking.json --compare-against data/imports/classic-era-1.15.9.69722-leatherworking.json --comparison-type classic-forever
```

The PostgreSQL container stores its database in `tmpfs`. Stopping/removing it clears
normalized data. Raw objects under `.local-data/` are content-addressed and persist.

### Immutable-build regeneration gotcha

`wow_build` binds one build ID to the exact imported raw hash. If a checked-in JSON
snapshot is regenerated with different bytes but the same game build ID, importing it
over the existing local row correctly reports an immutable-value conflict. Reset the
disposable local database, reimport the baseline, and then reimport the target with
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
  A missing `ItemSparse` row stays missing; do not backfill name, rarity, level, armor,
  or sell price from another game version.
- Missing auction prices are unavailable, never zero.

## Item assets

Item images are static WebP files under `apps/web/public/icons/items`. The manifest
records recipe build, asset build, FileDataID mappings, and missing item IDs. Keeping
these deterministic assets in the web build is the current deployment strategy; the
React `ItemIcon` component prevents every image from loading at startup by using
native lazy loading for non-hero images.

Every recipe, change-card, output, and reagent icon uses the shared item-tooltip
surface. Pointer hover opens a preview after one second and leaving the owning
control closes that preview immediately. Focusing a recipe button or change summary
opens the same preview for keyboard users, and Escape dismisses either mode.
Forever Changes resolves current recipes through the calculator's catalog tooltip
payload so the same item exposes the same fields in both views; removed recipes fall
back to the smaller comparison snapshot because no current catalog record exists.
Calculator output and reagent icons are also buttons that pin the tooltip, move focus
to its close control, and restore focus when the close button or Escape dismisses it;
an outside click also closes it. Tooltip content is limited to catalog-backed item
class, subclass, item rarity, equipment slot, armor, required level, vendor sell
price, classification, quantity, recipe, market price, and ID facts. Do not infer
binding, stats, or any other field absent from the imported data. Rarity comes from
`ItemSparse.OverallQualityID`; do not derive it from an item name or icon. Visible item
and crafted-output names use the shared `getItemRarityNameClass` helper so the guide,
catalog, calculator, changes view, route planner, shopping list, and tooltip stay
consistent. Missing or unsupported quality IDs inherit the surrounding text color
instead of being guessed. Provisional output quantities must remain visibly labeled
provisional.

The converter queries the installed client with `wowdata`. It resolves `latest` once,
then pins all DB2 and icon reads to the returned build. It joins `Item` and
`ItemSparse` for names, rarity, item types, slots, required levels, and sell prices. Base
armor comes from `ItemArmorTotal`, `ItemArmorQuality`, and `ArmorLocation`; shields
come from `ItemArmorShield`. Equipment without a direct `Item.IconFileDataID` falls
back through `ItemModifiedAppearance` and `ItemAppearance.DefaultIconFileDataID`.

## Static site pages

`apps/web/src/main.tsx` resolves `/privacy`, `/terms`, and `/contact` before mounting
the planner. Their content and metadata live in `StaticPage.tsx`, while both the
planner and static pages reuse `SiteFooter.tsx`. Navigation uses ordinary links so
direct loads, refreshes, and browser history work without a client router dependency.
The CloudFront distribution already maps 403 and 404 responses to `index.html`; keep
that SPA fallback when changing hosting or these clean paths will fail on direct load.

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

The shared current-skill slider powers change availability tags and the filters for
recipes above current skill or with unknown requirements. Item-type filtering prefers
LibItemDB class/subclass metadata and uses name heuristics only as a display fallback.

## Browser-local personalization

The web client owns a versioned local profile in `apps/web/src/personalization.ts`.
It persists skill range, route and shopping preferences, region, market, faction, the
Legacy profession-bonus input, and Forever Changes filters. The profile contains no
credentials or imported game data. Keep its parser defensive and migrate by adding a
new storage version rather than changing the meaning of an existing version.

Market and faction selections are functional request inputs. The Legacy profession
bonus is storage-only until its Forever behavior is verified and explicitly modeled;
do not silently add it to thresholds. Known recipes remain session-only. See
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

On some Windows sandboxed runs, parallel Vitest workers can lose transformed files
from the sandbox temp directory and report `ENOENT` before tests execute. Re-run the
suite outside that filesystem sandbox or run the focused suite separately; do not
misclassify that host-level temp failure as a product test failure.

## Known limitations

- Leatherworking is the only complete imported profession.
- Most acquisition/availability facts and every recipe's final verification remain
  incomplete.
- Item-type display heuristics remain necessary for records without LibItemDB type
  metadata.
- Current item assets ship with the web application rather than an object-storage CDN.
- Live market coverage depends on normalized prices refreshed separately from API
  requests.
- The add-on collection approach is deferred; the current pipeline relies on source
  archives, installed-client DB2 data, reviewed overrides, and quality reporting.
- Aurora DSQL migrations 017–024 have not yet completed the same live revalidation as
  migrations 001–016.

## Documentation maintenance

When behavior changes, update the root README and the closest focused document in the
same change. Keep exact dataset hashes in `data/imports/README.md`, endpoint examples in
`docs/API_TESTING.md`, and component/package invariants in their package README or
scoped `AGENTS.md`. Mark dated roadmap claims as historical rather than silently
treating them as current truth.
