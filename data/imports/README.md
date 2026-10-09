# Imported Forever datasets

`forever-1.60.1.69977-leatherworking.json` is a reproducible transform of the Forever tables in LibProfessionDB v1.9.1 and the matching English item names in LibItemDB v1.3.0. The source archives are not vendored. Their project pages, versions, and license notice are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The dataset contains 603 Leatherworking recipes for client build `1.60.1.69977`. It is useful product data, but it is deliberately not labeled authoritative:

- every recipe remains `unverified` until Forever-specific evidence is reviewed;
- 98 referenced item IDs have no English name in the item-name snapshot, affecting 90 recipes;
- 477 recipes expose a supported Forever learning rank; 126 remain unknown, including 68 values marked by the source as borrowed from Vanilla and deliberately omitted;
- 6 recipes expose a client-defined automatic acquisition method; the other 597 acquisition and availability states remain explicitly unknown;
- 60 recipes carry a specialization requirement;
- the source does not encode crafted stack sizes, so all 603 output quantities are provisionally one.

The known-learning-rank subset has no candidate coverage gaps from skill 1 through 299. That is enough to begin optimizer experiments, but it does not establish that every selected recipe is obtainable. The generated JSON SHA-256 is `3d849bcc70d21218d4b2b4d9efd53fc3c9e15aaf603dbf65096f8000b6835481`.

See `forever-1.60.1.69977-leatherworking.quality.md` for the generated audit. Regenerate both artifacts from extracted source archives with:

```text
pnpm data:convert:professiondb <ProfessionDB-root> <ItemDB-root> data/imports/forever-1.60.1.69977-leatherworking.json
pnpm data:audit data/imports/forever-1.60.1.69977-leatherworking.json data/imports/forever-1.60.1.69977-leatherworking.quality.md
```

To load the build into disposable local PostgreSQL:

```text
pnpm db:local:up
pnpm data:import:local data/imports/forever-1.60.1.69977-leatherworking.json
```

The importer preserves the raw bytes under ignored `.local-data/`, applies all schema migrations, and is safe to rerun. Set `LOCAL_DATABASE_URL` to the same loopback connection before `pnpm dev:api` to serve this catalog.
