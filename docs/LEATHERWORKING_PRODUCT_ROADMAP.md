# Leatherworking product roadmap

Status: current product plan as of October 19, 2026.

This roadmap starts from the implemented Leatherworking vertical slice and focuses on
making it more trustworthy, easier to follow while playing, and more competitive with
the current Forever profession-guide sites. The older roadmap and phase documents
remain historical records of work already completed.

Additional professions are deliberately outside this roadmap. The work below should
prove and polish the Leatherworking experience without introducing profession-switching
architecture, additional datasets, or cross-profession UX.

## Product position

Forever Professions should combine the best parts of a conventional leveling guide
with the advantages of a data-driven planner:

- the clarity and checklists of
  [WoW-Professions](https://www.wow-professions.com/forever/leatherworking-leveling-guide);
- the explanatory context, trainer guidance, and Forever-specific mechanic coverage
  of [Mobalytics](https://mobalytics.gg/wow-forever/guides/leatherworking-profession-guide);
- the compact route, recipe browsing, and price-awareness of
  [WowTBC.gg](https://wowtbc.gg/warcraftforever/professions/leatherworking/);
- the app's existing dynamic optimizer, skill-aware calculator, nested shopping
  planner, build comparison, and explicit data provenance.

The differentiator is not a longer static article. It is a route that adapts to the
player and the market while remaining as easy to execute as a good written guide.

## Current strengths to preserve

- Dynamic current-skill-to-target routes instead of one fixed leveling path.
- Per-skill probability, expected-craft, material, and cost calculations.
- Practical route stabilization, eligibility constraints, known recipes, faction,
  trainer-only mode, and Scarce-material last-resort behavior.
- Full recipe catalog with 603 recipes, item tooltips, icons, and recipe deep links.
- Recursive shopping planning with explicit missing prices and cycle detection.
- Stored Classic Era to Forever comparison with New and Updated visibility.
- Build, provenance, verification, fallback, and unknown states throughout the data.
- Useful browser-local personalization without requiring an account.

These features should be reorganized and explained, not replaced with a copied static
guide.

## Product principles

1. **Trust before optimization.** A mathematically optimal route is not useful if its
   thresholds or recipe availability are unsupported.
2. **Guide first, detail on demand.** The main view should tell the player what to do
   next. Graphs, raw build facts, and advanced controls remain available without
   dominating the workflow.
3. **Unknown stays visible.** Missing acquisition, price, or verification data never
   becomes zero, “trainer,” or “available” by implication.
4. **Every recommendation is explainable.** Players should be able to see why a recipe
   won and why a familiar alternative lost.
5. **Planning and execution are one flow.** Route steps, shopping progress, current
   skill, and completed crafts should work together.
6. **Forever evidence is required.** Third-party guides are diagnostic references, not
   authoritative inputs and not automatic data overrides.

## Success measures

The first release should be evaluated against product-quality gates before traffic or
revenue metrics:

- Every displayed route step exposes its learning, acquisition, availability, price,
  and verification state without implying unsupported certainty.
- The default route has no gaps, excludes unavailable and unknown-learning-rank
  recipes, and completes without Scarce materials whenever a complete non-Scarce
  route exists.
- A player can start at their current skill, work through route steps, check off
  materials and progress, leave the site, and resume locally.
- Route, calculator, and shopping totals agree for the same inputs and state their
  rounding or buffer policy.
- All route-policy changes produce a reviewed, build-stamped guide-validation report.
- The primary workflow is usable with a keyboard and at phone, tablet, and desktop
  widths.
- Missing or stale price data is distinguishable from a zero-cost material.

Once product analytics exist, establish baselines for route generation, first-step
engagement, checklist usage, shopping-list usage, and route completion before setting
numerical growth targets.

## Milestone 0 — Route trust and evidence

Priority: P0. Complete this before presenting the generated route as the safest
default guide.

### Work

- Review the skill thresholds behind the current one-craft-per-skill result, starting
  with Cured Heavy Hide and Cured Thick Hide.
- Resolve acquisition and availability evidence for every recipe selected by the
  default route. Start with the recipes listed in `docs/GUIDE_VALIDATION.md`.
- Add dated comparison references for the three reviewed competitor guides so route
  disagreements can be separated into data, policy, build, and objective differences.
- Extend acquisition facts only where supported evidence exists. The model should be
  able to represent trainer, vendor, quest, boss/drop, reputation, Merchant's Favor,
  Camping, limited supply, specialization, faction, location, and an unknown state.
- Retain field-level source, build, verification, and notes where a recipe combines
  facts from different evidence sources.
- Define two clear route confidence policies:
  - **Practical** may use unknown acquisition only when necessary and labels the risk.
  - **Supported-only** refuses an incomplete route instead of silently relaxing the
    evidence boundary.
- Keep the existing guide comparison diagnostic. Never copy a third-party route into
  canonical data or a reviewed override merely because it differs from the optimizer.

### Exit criteria

- The high-impact threshold and acquisition questions in the current validation
  report have a supported answer or remain explicitly unresolved.
- Each generated segment includes machine-readable confidence and acquisition reason
  data that can be shown consistently by the API and web app.
- Practical and supported-only behavior has deterministic domain and optimizer tests.
- `pnpm guide:validate` produces a reviewed baseline for the chosen default policy.

## Milestone 1 — Playable route checklist

Priority: P0. Make the route as easy to follow in game as the strongest static guides.

### Work

- Turn each route segment into a compact execution card showing:
  - skill range and recipe;
  - expected crafts;
  - primary and total materials;
  - trainer or acquisition summary;
  - estimated cost and price freshness;
  - confidence, fallback, New, Updated, and Scarce warnings only when applicable.
- Add per-step completion checkboxes and a clear active step.
- Save completion locally against a route fingerprint containing build, range,
  objective, constraints, and market. Do not carry completion onto a materially
  different route.
- Use the shared current skill as the route start by default. Allow the two values to
  be unlinked only through an explicit advanced action.
- Add “mark through this skill complete” and “resume at current skill” actions so
  progress does not require checking hundreds of individual crafts.
- Place trainer milestones in the route only when supported trainer and rank evidence
  is available. Unsupported milestones remain visibly unknown.
- Open recipe details without losing route position or progress.

### Simplify at the same time

- Shrink the large masthead once the player is inside the planning workspace.
- Lead recipe detail with the numeric skill-up chance, crafts, materials, and cost;
  make the full probability graph expandable.
- Collapse raw build and provenance details under a clear **Data confidence** control
  while keeping risk warnings visible.
- Reduce repeated badges. Show a status once at the narrowest useful scope.

### Exit criteria

- A route can be followed and resumed without opening the recipe calculator for every
  step.
- Changing build-sensitive route inputs invalidates or safely remaps saved progress.
- Checklist controls work with pointer, keyboard, and touch input.
- Existing `?recipe=<recipe-id>` links continue to select the requested recipe.

## Milestone 2 — First-class shopping mode

Priority: P1. Convert the calculated shopping plan into a usable pre-run checklist.

### Work

- Promote shopping from a planner result into a primary route workspace.
- Show aggregate materials and per-step breakdowns with checkboxes.
- Let the player enter an owned quantity and calculate the remaining quantity without
  mutating the canonical route totals.
- Separate buy, vendor, and craft paths. Preserve unresolved and cyclic crafting
  sources rather than picking one silently.
- Show market, source, and price timestamp beside the total and each priced material.
- Make stale prices, missing prices, and partial totals visually distinct.
- Display **expected quantity** separately from **planned purchase quantity**. Any
  rounding or safety buffer must be an explicit, tested policy and clearly labeled.
- Provide copy and print-friendly summaries without making export a prerequisite for
  using the page.

### Exit criteria

- Shopping totals reconcile with the active route and strategy for identical inputs.
- Owned quantities and checked items restore locally and reset safely when the route
  fingerprint changes.
- No missing price contributes zero copper to a displayed complete total.
- Nested crafting continues to retain cycle detection and unresolved-source warnings.

## Milestone 3 — Route presets and recommendation explanations

Priority: P1. Offer meaningful choices without exposing raw optimizer weights.

### Presets

- **Practical** — default; balances accessibility, switches, Scarce avoidance, crafts,
  and available price evidence.
- **Trainer friendly** — strongly prefers supported trainer recipes and clearly
  identifies unavoidable exceptions.
- **Cheapest** — minimizes supported expected cost and explains incomplete pricing.
- **Fewest crafts** — prioritizes expected skill-up efficiency.
- **Fewest materials** — prioritizes total material units.
- **Experimental** — permits explicitly identified evidence risks that the normal
  policies avoid. It must never look equivalent to the recommended route.

### Explanations

- Return structured reason codes from shared optimizer output rather than generating
  explanations inside React components.
- For the selected recipe, summarize the winning factors: cost, craft count,
  availability, acquisition friction, switch resistance, or Scarce avoidance.
- Show a small set of meaningful alternatives for a segment and the primary reason
  each lost.
- Explain when a preset cannot produce a complete route and which constraint caused
  the block.

### Exit criteria

- Identical catalog, prices, inputs, and preset produce deterministic routes and
  explanations.
- Every preset has focused optimizer tests and shared contract validation.
- Price-dependent presets distinguish missing coverage from an actual low price.
- The UI uses the returned explanations verbatim at the product-logic level; it does
  not reimplement route selection.

## Milestone 4 — Stronger All Recipes discovery

Priority: P2. Make the catalog competitive for players researching alternatives.

### Work

- Add filters for acquisition source, skill range, item type, specialization,
  faction, availability, verification state, and New or Updated status.
- Add sorts for learning skill, current-skill usefulness, expected cost, and
  orange/yellow/green/grey thresholds.
- Add a compact four-threshold display using the familiar difficulty colors, with
  text or accessible labels so color is not the only signal.
- Surface teaching item, acquisition requirements, and source location when those
  facts are supported.
- Preserve list virtualization, lazy-loaded icons, URL-addressable recipe selection,
  and missing-icon initials.
- Allow a recipe to be compared with the active route segment without leaving the
  route context.

### Exit criteria

- Filters and sorting remain responsive across the full 603-recipe catalog.
- Unknown values have explicit filter behavior and never appear as ordinary values.
- Search, filter, sort, deep-link, keyboard focus, and virtualization behaviors have
  regression coverage.

## Milestone 5 — Forever Leatherworking knowledge pages

Priority: P2. Add focused context around the planner without burying it in a long
article.

### Pages

- Leatherworking overview and “what changed in Forever.”
- Trainer ranks and locations.
- Merchant's Favor and Leatherworking acquisition interactions.
- Camping-related profession interactions.
- Leatherworking specializations and requirements.
- Recipe-source pages or sections for vendor, quest, reputation, and drop recipes.

### Rules

- Build these as focused, directly addressable pages linked from relevant route and
  recipe states.
- Publish only facts supported for Forever and show build/provenance where the detail
  may change.
- If a fact is not established, say so. Do not fill gaps with Classic behavior or a
  competitor's unsourced claim.
- Keep the planner task-focused; use short contextual links instead of embedding the
  full guide inside the route workspace.

### Exit criteria

- Each page has a clear evidence review and a current-build scope.
- Relevant route steps deep-link to the appropriate trainer or acquisition section.
- Direct loads, metadata, responsive layout, and site navigation work for every page.

## Milestone 6 — Product polish and release readiness

Priority: P2. Finish the combined workflow after the core route is trustworthy and
executable.

### Work

- Complete mobile, tablet, wide-screen, keyboard, focus, reduced-motion, and contrast
  passes for the route, shopping, catalog, and recipe details.
- Add shareable route state only for stable, non-sensitive inputs. Local checklist and
  owned-material progress should not leak into shared URLs by default.
- Add clear loading, empty, stale, partial, blocked, and retry states.
- Instrument anonymous product events only after documenting the privacy boundary.
- Measure route generation, first-step engagement, checklist progress, shopping use,
  blocked routes, and missing-data encounters.
- Keep performance budgets for the initial guide, catalog filtering, icon loading, and
  on-demand comparison data.
- Review the full interface for duplicate controls, badges, and explanations after all
  new states are present.

### Exit criteria

- The complete route-to-shopping workflow passes accessibility and responsive review.
- Analytics never include character identity, credentials, owned items, or imported
  game data.
- Production errors distinguish missing dependencies from empty successful results.
- The full repository verification gate succeeds against the release candidate.

## What to remove, reduce, or avoid

### Reduce or demote

- Oversized branding once the player enters the working area.
- The always-expanded probability graph.
- Repeated New, Updated, fallback, and provenance labels on the same surface.
- Raw technical provenance in the primary reading path; keep it available under
  **Data confidence** and keep actionable warnings prominent.
- Separate current-skill and route-start controls in the default workflow.

### Do not add

- A copied static route that bypasses the optimizer.
- Ads or account requirements as a prerequisite for planning.
- Live auction-provider calls in user request paths.
- External tooltip dependencies when the catalog already owns the item facts.
- Claims that client-file presence proves a recipe is obtainable.
- Hardcoded Scarce item names or Classic values presented as Forever facts.
- A large article embedded above or between route steps.
- Additional professions in this roadmap.

## Delivery order and dependencies

| Order | Deliverable | Depends on | Main packages or surfaces |
| --- | --- | --- | --- |
| 1 | Threshold and route-candidate evidence review | Current imports and validation baseline | ingestion, data, guide validation |
| 2 | Acquisition/confidence contract and policy | Evidence model | contracts, domain, optimizer, API |
| 3 | Practical and supported-only route behavior | Confidence policy | optimizer, API, guide validation |
| 4 | Compact route cards and synced skill state | Stable route response | web, personalization |
| 5 | Checklist progress and route fingerprints | Route UI | web, personalization |
| 6 | Shopping checklist and owned quantities | Stable route fingerprint | shopping, contracts, API, web |
| 7 | Presets and structured explanations | Stable policy model | optimizer, contracts, API, web |
| 8 | Catalog filters and route comparison | Acquisition model | web, API |
| 9 | Leatherworking knowledge pages | Reviewed acquisition content | web, ingestion evidence |
| 10 | Accessibility, analytics, and release hardening | Completed core workflow | web, API, infrastructure |

Each slice should be small enough for an independently reviewed feature pull request
targeting `stage`. Data-model changes should land before UI that relies on them, and
the UI must handle older or incomplete records during rollout.

## Verification expectations

Apply the repository's normal checks in proportion to each slice:

- Acquisition or imported-data changes: ingestion tests, regenerated audit, both real
  snapshots imported into disposable local PostgreSQL, and affected API checks.
- Route-policy or optimizer changes: focused optimizer and dependent tests plus
  `pnpm guide:validate` and review of its generated report.
- Shared contract or API changes: affected package tests, API tests, and typechecking.
- Web workflow changes: affected tests, typechecking, and
  `pnpm --filter @forever-professions/web build`.
- Release candidates: `pnpm verify`, full-catalog API smoke checks, keyboard and
  responsive review, and `git diff --check`.

No milestone is complete if it makes unknown Forever data look verified merely to
produce a cleaner route or interface.

## Explicitly deferred

- Additional professions.
- Accounts, cross-device sync, and multiple character profiles.
- Addon or character import.
- Profit and “best item to sell” tools.
- Community submissions or voting.
- Farming routes and cross-profession material optimization.

These may be reconsidered after the Leatherworking route, shopping workflow, and
evidence model meet the release gates above.
