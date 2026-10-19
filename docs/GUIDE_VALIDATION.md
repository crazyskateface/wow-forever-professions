# Leatherworking guide validation

The guide-validation workflow compares a build-stamped optimizer route with an
explicitly sourced external guide. It is designed to find high-impact data and model
questions; it never promotes a third-party route into canonical recipe data.

## Current baseline

The first comparison uses:

- generated catalog: Forever `1.60.1.69977`, 603 Leatherworking recipes;
- generated objective: fewest expected crafts with the default practical policy;
- reference: Endgame Tools' complete 22-step Leatherworking guide;
- reference client label: Forever `1.60.1.70374`;
- reference intent: material-cost proxy rather than fewest crafts.

The captured reference and its assumptions live in
`data/guide-references/endgame-tools-2026-10-14-leatherworking.json`. Its source says
that trainer teaching ranks are not available in the client, uses yellow thresholds
as a conservative trainer boundary, applies proxy reagent values instead of live
auction prices, and excludes several recipe categories. Those assumptions are part of
the comparison and are not treated as verified Forever facts.

The generated report currently finds:

- 299 skill decisions compared and no matching decisions;
- 299 expected crafts in the generated route versus 473 in the reference;
- 13 generated route segments, all using recipes that remain unverified;
- seven selected recipes with unknown acquisition and availability, all between skill
  175 and 300;
- no selected recipe using a client-labeled `Scarce` reagent;
- one ambiguous reference name, `Turtle Scale Breastplate`, because the imported
  build contains two spells with that display name;
- one generated segment spanning 40 skill points.

The practical policy now prefers Fine Leather Boots from 81–96 over Forceful Medium
Armor Kit because the former has reviewed acquisition and availability evidence. A
supported-only route reaches skill 175 and then returns
`unsupported-recipe-evidence`; it does not relax the evidence boundary to finish the
route.

Cured Heavy Hide and Cured Thick Hide have reviewed trainer, availability, learning,
and color-threshold overrides in
`data/imports/forever-leatherworking-overrides.json`. Their recipes still retain the
snapshot's overall `unverified` status, so the baseline exposes that uncertainty
instead of presenting the thresholds as fully verified in-game facts.

Zero overlap is a diagnostic signal, not proof that either route is correct. The
reference uses a newer beta build, a smaller candidate set, different accessibility
assumptions, and a different objective. The generated route also claims exactly one
craft per skill from 1 to 300, making threshold and recipe-availability review the
highest-value follow-up.

## Run the comparison

Start and import the full local catalog as described in the root README, then run:

```text
pnpm guide:validate
```

The command fetches the current profession and generated route from the local API and
writes:

- a compact build-stamped route baseline JSON;
- a Markdown report containing skill-range disagreements, evidence risks, craft
  totals, material totals, Scarce usage, and suspicious segment counts.

If any reference step omits reagent data, the report labels all reference material
totals as partial and suppresses numeric deltas rather than treating omitted data as
zero.

Optional positional arguments select a reference file, output directory, and API base
URL. Set `GUIDE_VALIDATION_GENERATED_AT` to a fixed ISO timestamp for a byte-for-byte
repeatable baseline.

## Review order

1. Corroborate the reviewed Cured Heavy Hide and Cured Thick Hide overrides with
   direct in-game evidence when available; do not discard their field-level source
   and verification state.
2. Investigate Forever acquisition and availability for Comfortable Leather Hat,
   Turtle Scale Gloves, Tough Scorpid Gloves, Wild Leather Boots, Charged Scorpid
   Helm, Charged Scorpid Vest, and Charged Scorpid Boots. Classic-borrowed source
   kinds are not sufficient evidence for a Forever fact.
3. Resolve same-name recipe ambiguity using supported spell/build evidence rather
   than choosing a row by name.
4. Add a trainer-friendly comparison only if it represents a clearly named product
   policy rather than an implicit relaxation of evidence rules.
5. Add dated captures of the Mobalytics, WoW-Professions, and WowTBC.gg routes to
   determine which disagreements persist
   across independent methodologies.

Only supported client, observed, or reviewed evidence may change recipe data. A route
disagreement by itself is never sufficient justification for an override.
