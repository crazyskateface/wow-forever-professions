# Imported Forever datasets

`forever-1.60.1.69977-leatherworking.json` is a reproducible transform of the Forever tables in LibProfessionDB v1.9.1 and the matching English item names in LibItemDB v1.3.0. The source archives are not vendored. Their project pages, versions, and license notice are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The dataset contains 603 Leatherworking recipes for client build `1.60.1.69977`. It is useful product data, but it is deliberately not labeled authoritative:

- every recipe remains `unverified` until Forever-specific evidence is reviewed;
- 98 referenced item IDs have no English name in the item-name snapshot, affecting 90 recipes;
- 68 learning ranks marked by the source as borrowed from Vanilla were omitted;
- the source does not encode crafted stack sizes, so all 603 output quantities are provisionally one.

The generated JSON SHA-256 is `6247c552fd9dfe797b7c930cb4eb2395349045f7f3bd1a28c0daf8aaf68d13fe`.

See `forever-1.60.1.69977-leatherworking.quality.md` for the generated audit. Regenerate both artifacts from extracted source archives with:

```text
pnpm data:convert:professiondb -- <ProfessionDB-root> <ItemDB-root> data/imports/forever-1.60.1.69977-leatherworking.json
pnpm data:audit -- data/imports/forever-1.60.1.69977-leatherworking.json data/imports/forever-1.60.1.69977-leatherworking.quality.md
```

To load the build into disposable local PostgreSQL:

```text
pnpm db:local:up
pnpm data:import:local -- data/imports/forever-1.60.1.69977-leatherworking.json
```

The importer preserves the raw bytes under ignored `.local-data/`, applies all schema migrations, and is safe to rerun. Set `LOCAL_DATABASE_URL` to the same loopback connection before `pnpm dev:api` to serve this catalog.
