# Forever Professions — Roadmap v2

Current implementation note (October 14, 2026): the canonical data slice, per-skill
cost model, stateful route optimizer, practical route stabilization, guide-first UI,
shopping planner, data-quality disclosures, and Classic Era → Forever Changes feature
are implemented for Leatherworking. Phase 13 has started with a reproducible,
build-stamped route baseline and external-guide comparison report, and Phase 14's
browser-local personalization baseline is implemented. Use `README.md`,
`docs/DEVELOPMENT.md`, `docs/GUIDE_VALIDATION.md`, and `docs/PERSONALIZATION.md` for
the current system; this document remains the product-direction roadmap.

## Product Direction Reset

Forever Professions should not primarily be a searchable list of profession recipes.

A player leveling a profession usually wants to answer:

> I am skill 1. What should I craft until 30? What should I switch to at 30? What should I craft after that? How many should I expect to make, what materials do I need, and how much will it cost?

The primary experience should therefore be an **optimized leveling guide generated from recipe data**.

The recipe database and calculator remain important, but they support the guide rather than replace it.

The core product loop becomes:

```text
Choose profession
      ↓
Choose current + target skill
      ↓
Optimized leveling route
      ↓
1 → 30 Recipe A
30 → 55 Recipe B
55 → 72 Recipe C
...
      ↓
Click a route step
      ↓
Detailed recipe calculator
      ↓
Probability / crafts / mats / price
```

---

# Reorientation Phase — Audit What We Already Built

## Goal

Do not throw away completed work.

Determine which pieces of the existing implementation already support the new guide-first architecture and which pieces need to move.

## Review

Audit:

- current Forever recipe ingestion
- current database schema
- profession/recipe APIs
- skill-up math
- price provider work
- AHledger work
- Blizzard API abstractions
- material/reagent graph
- frontend recipe explorer
- current calculator
- shopping-list functionality
- any optimization code already present

Classify existing functionality as:

```text
KEEP
ADAPT
REPLACE
DEFER
```

## Key architectural rule

The following should remain separate concepts:

```text
Recipe Data
    ↓
Profession Math
    ↓
Route Optimizer
    ↓
Guide Presentation
```

The UI should never contain the logic deciding which recipe is optimal.

---

# Phase 1 — Canonical Forever Recipe Dataset

## Goal

Make sure the optimizer has trustworthy input.

The route is only as good as the recipe data underneath it.

## Required recipe information

Each usable recipe should ultimately expose:

```ts
Recipe {
  id
  spellId
  professionId

  name

  outputItem
  outputQuantity

  reagents[]

  orangeSkill
  yellowSkill
  greenSkill
  greySkill

  learnSkill

  source

  faction
  specialization

  cooldown

  build
  provenance
  verificationStatus
}
```

## Source hierarchy

Prefer:

1. Forever client data
2. observed Forever game data
3. community-verified Forever data
4. Classic fallback
5. unknown

Never silently treat Classic fallback values as verified Forever values.

## Build awareness

Recipe information must be associated with a Forever build.

When Blizzard changes:

```text
Recipe X
Build A: 8 Heavy Leather

Recipe X
Build B: 6 Heavy Leather
```

retain both states.

The active guide always uses the selected/current build.

## Exit criteria

For at least one full profession:

- recipes are complete enough to produce a 1–300 route
- reagents resolve correctly
- skill thresholds resolve correctly
- unavailable recipes can be excluded
- uncertain fields are clearly identified

---

# Phase 2 — Leveling Cost Model

## Goal

Define what “best recipe” actually means.

This becomes shared domain logic used by every optimizer.

## Per-skill recipe evaluation

At profession skill `s`, evaluate each valid recipe.

Calculate:

```text
skill-up probability
expected crafts per skill
expected reagent usage per skill
expected gold cost per skill
```

Conceptually:

```text
expected crafts = 1 / probability
```

and:

```text
expected leveling cost =
    expected crafts
    × effective craft cost
```

## Range calculations

Never use one probability across an entire range.

For:

```text
150 → 160
```

calculate:

```text
150 → 151
151 → 152
152 → 153
...
159 → 160
```

because recipe probability changes as skill increases.

## Recipe eligibility

A recipe is a route candidate only when it can realistically be used.

Account for:

- learn skill
- faction
- specialization
- profession branch
- recipe source
- cooldown
- unavailable/removed recipe
- build
- optional user-owned recipe information later

## Exit criteria

Given:

```text
profession
current skill
target skill
recipe dataset
```

the domain layer can calculate the cost of using any candidate recipe at every skill point.

---

# Phase 3 — Route Optimizer v1

## Goal

Generate the actual `1 → X → Y → 300` guide.

This becomes the heart of the product.

## Do not use only a hand-authored guide

Routes should be generated from recipe data.

## Optimization model

Use dynamic programming or another global path algorithm rather than relying solely on:

```text
pick the cheapest recipe at this exact skill
```

The optimizer should answer:

> What sequence of crafts gives the best expected route from the current skill all the way to the target?

Conceptually:

```text
bestCost[target] = 0

for skill from target - 1 down to current:
    evaluate every usable recipe

    expected step cost
        +
    best future cost

    choose the best route
```

## Output

Internally:

```text
1  → Recipe A
2  → Recipe A
3  → Recipe A
...
29 → Recipe A
30 → Recipe B
...
```

Then compress consecutive identical decisions:

```text
1 → 30
Recipe A

30 → 55
Recipe B

55 → 72
Recipe C
```

## Tests

Create deterministic test fixtures proving that:

- the cheapest individual craft isn't always the cheapest leveling route
- probability changes alter route choice
- grey recipes are never chosen
- unavailable recipes are never chosen
- route reconstruction is correct
- route ranges contain no gaps
- route reaches the requested target

---

# Phase 4 — Route Stability / Human-Friendly Guides

## Goal

Prevent mathematically optimal but ridiculous guides.

Pure optimization can produce:

```text
120 Recipe A
121 Recipe B
122 Recipe A
123 Recipe B
```

That is technically valid and bad UX.

## Add switch resistance

Use a recipe-switch threshold or penalty.

Example:

Do not change recipes unless the new route is at least approximately:

```text
5–10%
```

better than continuing with the existing recipe.

This value should be configurable and testable.

## Consider acquisition friction

Add penalties or constraints for recipes that require:

- rare drops
- expensive vendor recipes
- reputation
- quests
- travel
- specializations
- cooldowns

The guide should favor practical routes rather than theoretical ones.

## Result

Prefer:

```text
120 → 137 Recipe A
137 → 155 Recipe B
```

over dozens of tiny switches.

---

# Phase 5 — Guide-First UI

## Goal

Change the application hierarchy.

The left rail becomes primarily the leveling guide.

## Primary navigation

Provide:

```text
[ LEVELING GUIDE ] [ ALL RECIPES ]
```

Default to:

```text
LEVELING GUIDE
```

## Guide rail

Example:

```text
Leatherworking

Current: 1
Target: 300

1 → 30
Light Armor Kit
~29 expected crafts

30 → 55
Embossed Leather Gloves
~28 expected crafts

55 → 75
Recipe X
~23 expected crafts
```

Each step should show enough information to make the guide useful without opening the recipe.

Useful fields:

```text
skill range
recipe
expected crafts
primary materials
estimated cost
recipe source indicator
```

## Recipe detail

Clicking a guide entry opens the detailed calculator.

Keep the Professions.gg-style right pane:

- recipe name
- materials
- skill thresholds
- skill slider
- probability
- expected crafts
- expected cost
- graph

The user can understand **why** the guide recommends the recipe.

## All Recipes

Keep the complete recipe browser as a secondary tool.

Useful for:

- exploration
- comparing alternatives
- searching a known recipe
- checking a recipe not selected by the optimizer

---

# Phase 6 — Guide Range Controls

## Goal

Make the guide useful for players who are already partially leveled.

Top-level controls:

```text
Current Skill: 137
Target Skill: 225
```

Immediately generate:

```text
137 → 150 Recipe A
150 → 178 Recipe B
178 → 205 Recipe C
205 → 225 Recipe D
```

No need to display irrelevant 1–136 steps.

## Additional future inputs

Prepare the optimizer API/domain model for:

```text
faction
specialization
known recipes
Legacy bonuses
profession racial bonus
market
```

Do not force user accounts in order to use them.

---

# Phase 7 — Optimization Modes

## Goal

Different players mean different things by “efficient.”

Add optimization modes.

## Recommended

Default.

Balance:

- expected cost
- number of crafts
- recipe accessibility
- recipe switching
- acquisition friction

## Cheapest

Minimize expected gold/material cost.

## Fewest Crafts

Maximize skill-up efficiency regardless of material price.

## Trainer Friendly

Strongly prefer recipes obtainable from normal profession trainers.

Avoid obscure purchased/drop recipes unless there is a major advantage.

## Custom

Later allow weights:

```text
Gold cost       ████████
Craft count     ██████
Recipe friction ████
```

Do not expose complicated weighting until the simpler modes work well.

---

# Phase 8 — Auction-Aware Routes

## Goal

Turn the generated guide into a live market-aware leveling guide.

Use the existing price-provider abstraction.

Potential sources:

```text
AHledger
Blizzard API
manual pricing
no pricing
```

The optimizer should never depend directly on a provider.

## Cost hierarchy

For reagents determine:

```text
vendor price
AH price
crafted cost
```

and compute an effective material cost.

## Dynamic routes

A route could change when the market changes.

For example:

```text
Yesterday
150 → 180 Recipe A

Today
150 → 164 Recipe B
164 → 180 Recipe C
```

because material prices changed.

## Price freshness

Show clearly:

```text
Market: US PvP Alliance
Prices updated: 37 minutes ago
Source: AHledger
```

Do not present stale prices as current.

---

# Phase 9 — Recursive Crafted Reagents

## Goal

Correctly price materials that can themselves be crafted.

Example:

```text
Recipe A
  requires Material B

Material B
  can be bought
  OR
  crafted from C + D
```

Determine:

```text
min(
    AH purchase cost,
    vendor cost,
    crafting cost
)
```

where appropriate.

## Important constraint

Avoid recursive loops in crafting graphs.

Track visited items/recipes during evaluation.

## Guide output

Shopping list should distinguish:

```text
BUY
CRAFT
VENDOR
```

---

# Phase 10 — Full Route Shopping List

## Goal

Once a route is chosen, tell the user exactly what they need.

Aggregate all expected reagent quantities across the route.

Example:

```text
Leatherworking 137 → 225

Expected materials

Heavy Leather      184
Thick Leather      233
Silken Thread       38
Black Dye            9
...
```

Display:

```text
expected quantity
estimated price
source
```

Also allow per-guide-step breakdown.

---

# Phase 11 — Profession Data Verification

## Goal

Make the guide trustworthy for Forever.

The optimizer may uncover bad data simply because a route looks bizarre.

Build validation tools around that.

## Flag suspicious entries

Examples:

- recipe becomes available after it is already grey
- missing reagents
- impossible thresholds
- recipe unexpectedly changes profession
- output item missing
- strange build-to-build changes
- optimizer heavily favors an obviously inaccessible recipe

## Provenance display

Internally maintain:

```text
client-data
observed-in-game
classic-fallback
community-verified
manual-override
```

Potential UI:

```text
Forever verified
Forever client data
Estimated trainer level
Classic fallback
```

---

# Phase 12 — Forever Build Update Pipeline

Status: item client-data enrichment extended on October 15, 2026. A single pinned
Forever client build now supplies build-scoped display names, rarity IDs, item types,
equipment slots, required levels, vendor sell prices, generic item labels, and deterministic
base armor. The normalized database and API preserve those fields with their actual
client product/build/locale. Items absent from `ItemSparse` remain explicitly
unenriched. Automated client/archive acquisition and build activation remain future
work.

## Goal

Treat Forever patches as routine data updates rather than emergency manual work.

Pipeline:

```text
new Forever build
       ↓
download/extract relevant tables
       ↓
archive raw data
       ↓
normalize
       ↓
validate
       ↓
compare with previous build
       ↓
generate change report
       ↓
activate build
       ↓
regenerate routes
```

## Change report

Automatically identify:

```text
new recipes
removed recipes
changed reagents
changed quantities
changed thresholds
changed outputs
```

Routes should be regenerated and compared after every significant build.

---

# Phase 13 — Guide Quality Testing

Status: started on October 14, 2026. The repository now captures the generated
Leatherworking route and compares every skill decision, expected craft count, and
material total with a dated, source-attributed external guide. Disagreements remain a
review queue and never update canonical recipe data automatically.

## Goal

Validate computed routes against actual play.

For each profession:

- calculate full 1–300 route
- compare against respected existing Forever guides
- investigate major differences
- simulate expected craft counts
- verify recipe availability
- sanity-check material totals

Do not blindly copy other guides.

Differences are useful signals:

```text
our algorithm found something better
OR
our data/model is wrong
```

Both are valuable discoveries.

---

# Phase 14 — Personalization Without Accounts

Status: browser-local personalization implemented on October 14, 2026. Current and
target skill, optimization and shopping preferences, trainer-only mode, region,
market, faction, and Forever Changes filters now restore from a versioned local
profile. The Legacy profession-bonus value is retained but remains calculation-neutral
until the game mechanic is verified. Known recipes and multiple character profiles
remain later work.

## Goal

Give users useful personalization without introducing auth unnecessarily.

Persist locally:

```text
region
market
faction
current skill
target skill
optimization preference
Legacy profession modifiers
```

Use local storage/browser state.

Later optionally allow:

```text
known recipes
character profile
multiple professions
```

Accounts remain optional until there is clear product value.

---

# Phase 15 — Character / Addon Integration

## Goal

Only build this after the web guide proves useful.

Potential addon functionality:

- current profession skill
- known recipes
- specialization
- profession racial bonus
- Legacy modifiers
- trainer observations
- recipe verification

The addon should improve personalization and verification.

It should not be required to use the site.

---

# Phase 16 — Production Polish

Add:

- shareable guide URLs
- profession-specific URLs
- route state in URL
- SEO recipe pages
- loading states
- empty/error states
- accessible keyboard navigation
- mobile/tablet refinement
- analytics
- monitoring
- caching
- CloudFront/API caching
- error reporting

Example shareable URL concept:

```text
/leatherworking/guide?from=137&to=225&strategy=cheapest
```

---

# Phase 17 — Later Product Opportunities

Only pursue after the guide has traction.

Potential features:

- saved characters
- user accounts
- route history
- price-history graphs
- profession profit calculator
- “best crafts to sell”
- material farming recommendations
- cross-profession optimization
- public API
- community verification
- addon sync
- multiple WoW versions
- monetization

---

# New Priority Order

The work should now be prioritized approximately as:

```text
1. Verify recipe data
2. Define leveling cost model
3. Build route optimizer
4. Make route human-friendly
5. Make guide the primary UI
6. Add current/target controls
7. Add optimization modes
8. Connect live auction prices
9. Add recursive reagent costing
10. Generate full shopping lists
11. Improve data verification
12. Automate Forever build updates
13. Validate guides profession-by-profession
14. Add personalization
15. Consider addon integration
16. Polish for production
```

---

# Product Definition

The clearest description of Forever Professions should now be:

> **A dynamic WoW Forever profession leveling planner that calculates what you should craft at every skill level based on skill-up probability, recipe availability, materials, and market prices.**

Not:

> A database of Forever profession recipes.

And not merely:

> A profession calculator.

The calculator is one component.

The **generated leveling guide is the product.**

---

# Immediate Next Work

Before adding another major feature, implement the guide engine against one profession end-to-end.

Use **Leatherworking** as the proving ground.

The first milestone should be:

```text
Real Leatherworking recipes
        ↓
skill probability model
        ↓
route optimizer
        ↓
1 → 300 route
        ↓
compressed guide ranges
        ↓
guide displayed in left rail
        ↓
click route step
        ↓
existing recipe calculator
```

Do not try to solve every profession simultaneously.

Once Leatherworking produces a guide that looks credible, compare its route against current Forever guides and investigate every meaningful disagreement.

Only after that should the same system be expanded across the remaining professions.
