# Imported Forever datasets

`classic-era-1.15.9.69722-leatherworking.json` is the normalized Classic Era
baseline used by the recipe-diff pipeline. It contains 314 Leatherworking
recipes from the Vanilla tables shipped in the same LibProfessionDB v1.9.1 and
LibItemDB v1.4.1 source archives as the Forever snapshot. Its records retain
`classic-fallback` provenance so the UI does not confuse baseline evidence with
Forever-specific verification.

The deterministic comparison against the current Forever target contains 289 New,
227 Updated, 0 Removed, and 87 Unchanged Leatherworking recipes. These are logical
recipes matched by profession ID and spell ID.

`forever-1.60.1.69977-leatherworking.json` is a transform of the Forever tables in LibProfessionDB v1.9.1 and the matching English item names and item types in LibItemDB v1.4.1, supplemented by explicitly identified manual corrections from `forever-leatherworking-overrides.json`. Generic item-name-description labels are read from the installed Forever client, not inferred from item names. The source archives are not vendored. Their project pages, versions, checksums, and license notice are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The dataset contains 603 Leatherworking recipes for client build `1.60.1.69977`. The frontend also carries 760 lossless WebP item icons extracted from the installed Forever client build `1.60.1.70374`; `apps/web/public/icons/items/manifest.json` records both build identities, every item-to-FileDataID mapping, and any missing IDs. The same pinned client build classifies seven referenced items through `ItemSparse.ItemNameDescriptionID`, including the three Leatherworking reagents labeled `Scarce`. It also provides display name, equipment slot, required level, and vendor sell price for 630 referenced items; 452 have equipment slots and 443 have armor derived from the client's armor tables. Each record retains its source product, build, and locale. It is useful product data, but it is deliberately not labeled authoritative:

- every recipe remains `unverified` until Forever-specific evidence is reviewed;
- 130 referenced item IDs have no `ItemSparse` row in the pinned client and therefore
  have no imported tooltip attributes;
- 98 referenced item IDs have no English name in the item-name snapshot, affecting 90 recipes;
- 484 recipes expose a supported Forever learning rank; 119 remain unknown, including 68 with a separately labeled Vanilla fallback that is not treated as Forever data;
- 14 recipes expose a known acquisition and availability state; the other 589 remain explicitly unknown;
- 225 recipes expose source-kind evidence, 457 identify a teaching item, and 513 outputs have structured LibItemDB item-type metadata;
- 60 recipes carry a specialization requirement;
- the source does not encode crafted stack sizes, so 595 output quantities remain provisionally one after the eight reviewed overrides.

The known-learning-rank subset has no candidate coverage gaps from skill 1 through 299. That is enough to begin optimizer experiments, but it does not establish that every selected recipe is obtainable. The current JSON SHA-256 is `68abe048943447408d6ead3e2d99e5b54bafef225df6ab1f7b6a4f1e7e9b4457`.

## Manual corrections

`spell-2162` (Embossed Leather Cloak) carries a dated `manual-override` source. A player observed ten guaranteed orange skill-ups from 60 through 69 on October 11, 2026. Published Forever profession data corroborates learning at 60, trainer acquisition, and the `60/70/85/100` skill thresholds. Reagents remain client-derived and output quantity remains provisional, so the complete recipe record remains `unverified` rather than overstating the evidence.

`spell-2158` (Fine Leather Boots) is marked as an available world-drop pattern, not a trainer recipe. It therefore does not appear in a character's profession spellbook until Pattern: Fine Leather Boots has been found and learned. Its learning rank, thresholds, and reagents remain client-derived.

`spell-2161` (Embossed Leather Boots) is corrected to trainer acquisition, learning rank 40, and `40/80/95/110` skill thresholds. A player confirmed the learned recipe was still orange at skill 71 on October 11, 2026, and current published Forever recipe data corroborates the complete curve.

`spell-3763` (Fine Leather Belt) is corrected to trainer acquisition, learning rank 45, and `45/85/100/115` skill thresholds. Its six Light Leather and two Coarse Thread reagent cost makes it an important lower-material alternative through the early route.

The trainer ranks and skill curves for Cured Light Hide, Cured Medium Hide, Cured Heavy Hide, and Cured Thick Hide are also corrected from current published Forever recipe data. These utility crafts can now participate in route alternatives over the exact ranges where they still grant skill-ups.

The converter validates and reapplies the reviewed corrections automatically after regenerating the client-derived baseline. It fails if an override source is missing, an override recipe is duplicated, or a recipe ID no longer exists in the source snapshot.

See `forever-1.60.1.69977-leatherworking.quality.md` for the generated audit. Regenerate both artifacts from extracted source archives with:

```text
pnpm data:convert:professiondb <ProfessionDB-root> <ItemDB-root> data/imports/forever-1.60.1.69977-leatherworking.json Forever - data/imports/forever-leatherworking-overrides.json "C:\World of Warcraft" apps/web/public/icons/items
pnpm data:convert:professiondb <ProfessionDB-root> <ItemDB-root> data/imports/classic-era-1.15.9.69722-leatherworking.json Vanilla data/imports/forever-1.60.1.69977-leatherworking.json
pnpm data:audit data/imports/forever-1.60.1.69977-leatherworking.json data/imports/forever-1.60.1.69977-leatherworking.quality.md
pnpm data:audit data/imports/classic-era-1.15.9.69722-leatherworking.json data/imports/classic-era-1.15.9.69722-leatherworking.quality.md
```

To load the build into disposable local PostgreSQL:

```text
pnpm db:local:up
pnpm data:import:local data/imports/classic-era-1.15.9.69722-leatherworking.json
pnpm data:import:local data/imports/forever-1.60.1.69977-leatherworking.json --compare-against data/imports/classic-era-1.15.9.69722-leatherworking.json --comparison-type classic-forever
```

The importer preserves the raw bytes under ignored `.local-data/`, applies all schema migrations, and is safe to rerun. Set `LOCAL_DATABASE_URL` to the same loopback connection before `pnpm dev:api` to serve this catalog.
