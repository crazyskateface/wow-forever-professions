# Gathering data

Gathering evidence is separate from immutable recipe builds. It covers Herbalism,
Mining, and Skinning. Mining retains its existing recipe calculator at
`/professions/mining`; its Gathering link opens `?view=gathering`. Herbalism and
Skinning open the standard profession workspace with a searchable left-hand list,
skill control, Recipe calculator, Best crafts, and Gathering tabs. The calculator
shows exact per-craft materials while unknown skill curves and costs remain explicit.
The Gathering tab contains source/zone search, paginated locations, and evidence.

## 1. Client extraction

```text
pnpm data:convert:gathering "C:\World of Warcraft" 1.60.1.70630
```

The converter requires an exact local Forever build (`wowf`, US, enUS), confirms it
with `casc info`, and reads SkillLineAbility, SpellName, Spell, SpellReagents,
SpellEffect, ItemSparse, and UiMap through wowdata. The output is
`data/imports/forever-1.60.1.70630-gathering.json` plus a generated quality audit.
It currently contains 62 client ability records across the three skill lines.

SpellReagents supplies integer per-craft quantities. Only direct create-item
effects (effect 24) identify item outputs. Output stack sizes remain unknown.
Client minimum/trivial skill ranks remain raw evidence; they do not establish
harvest requirements, recipe learning ranks, obtainable spells, or a skill-up
probability curve. No gathering route is generated from them.

## 2. External source review

`data/imports/gathering-sources.json` pins revisions and SHA-256 values. Source files
are downloaded only when absent under ignored `.local-data/gathering-sources/` and
must match their pinned hashes. Lua is parsed as literals and is never executed.

### GatherLite — accepted as unverified community reports

- Repository: https://github.com/Wuild/GatherLite
- Reviewed revision: `934c920705a5fca852bbde8669f2b0bc52f56779`.
- Repository license: MIT; the notice is retained in THIRD_PARTY_NOTICES.md.
- `scripts/nodes.lua` supplies resource labels, object identities, and reported
  minimum skill claims. Only the primary object ID receives a reported minimum;
  aliases do not establish variant requirements.
- `plugins/database/data/forever.lua` supplies normalized object/map coordinates.
  Its generator identifies Wowhead Forever as the upstream coordinate source.
- Map projection metadata identifies build `1.60.1.70009`. The exact build of each
  gameplay location is unknown. Compatibility with client `1.60.1.70630` is
  unverified; neither that client build nor the projection build is assigned to
  the community spawn facts. Map display names come from the pinned local client.
- Duplicate coordinate pairs collapse into one report. Counts are locations, not
  gathers, population estimates, spawn guarantees, or yield samples.
- The result has 99 herb/ore object records and 24,390 distinct location reports.
  Sources with no locations remain visible. Fishing/chests are excluded from this
  adapter. No item yields or verified requirements are inferred from resource names.

### ForeverDB — excluded pending reuse permission

- Repository: https://github.com/Imemoth/wow-foreverdb
- Reviewed revision: `2940324bf4a96549f3c2cbff4948e0297b14e525`.
- The project describes Herbalism, Mining, Skinning, fishing, source/item counts,
  exact creature-level separation, and quantized observer coordinates. Its schema
  and export format require a dedicated adapter; player positions are not exact
  creature spawns and sample counts must not be presented as exact drop rates.
- No license file or published reuse grant was found at the reviewed revision.
  Its data/code are not copied into this repository. Reconsider only with explicit
  permission or a suitable published data license, a real export sample, and
  supported client-build evidence.

The converter optionally accepts a fourth argument containing a reviewed
`gatheringDatasetSchema` observation dataset. Its evidence must be
`observed-in-game`, carry a reuse license/permission statement and export revision,
and match the pinned client build. This is a normalized interchange format, not a
native ForeverDB SavedVariables parser. It supports creature sources, gathered
items, quantity ranges, sample counts, and observer coordinates. Unknown values
remain null. Such input must contain only gathering facts and evidence, not player
identifiers or unrelated account data. Do not import synthetic test examples into
the application catalog.

Skinning currently has client abilities and crafted-item links; supported creature
sources, gathered yields, and locations are absent. The site exposes those gaps.

## 3. Persistence, API, and verification

```text
pnpm db:local:up
pnpm data:import:gathering:local data/imports/forever-1.60.1.70630-gathering.json
pnpm data:test:gathering:local
pnpm api:smoke:gathering
pnpm verify
```

Ordered catalog migrations 029–037 add gathering datasets, evidence, abilities,
sources (nodes or creatures), locations, yields, and lookup indexes. They use simple
DSQL-compatible types and JSON as TEXT. Application validation checks unique IDs,
evidence references, parent sources, ranges, and quantities before writes. The
writer archives exact raw bytes, hashes each immutable dataset, batches bounded
inserts, checks stored values on replay, and publishes its header only after all
child records have been persisted. Interrupted imports can resume and remain
invisible until publication. Recipe build hashes are untouched.

The API reads stored data only:

- `GET /api/professions/{herbalism|mining|skinning}/gathering`
- `GET /api/professions/{id}/gathering/locations?datasetId=<hash>&sourceId=<id>&mapId=<optional>&offset=0&limit=25`

Catalog responses include abilities, source summaries, yield evidence, maps, and
provenance. Locations load on demand, are scoped to the profession, and are limited
to 100 per request. Pagination pins the dataset hash, so a new import cannot mix
versions between pages. Unconfigured dependencies return 503; absent data returns
404; invalid location queries return 400. Fixture mode does not fabricate gathering
records.

The temporary database smoke imports both real recipe snapshots/comparison and the
gathering snapshot, replays gathering writes, tests immutable conflicts, validates
pagination and map/profession isolation, and exercises creature/yield storage with
explicitly synthetic records inside that temporary database. It removes the
temporary database afterward and leaves the application catalog intact.

For a separately reviewed live release: apply `pnpm db:migrate:dsql`, refresh
least-privilege table grants with `pnpm db:roles:dsql`, then use
`pnpm data:import <gathering.json>`. The existing S3 raw store and DSQL connector
handle these imports. Live execution requires configured roles and is not part of
the local workflow. Do not use recipe comparison flags for gathering datasets.
