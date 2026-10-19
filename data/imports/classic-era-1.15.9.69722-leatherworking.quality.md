# Data quality report: 1.15.9.69722

Professions: 1 · Recipes: 314 · Items: 436

## Sources

- classic-fallback: 1

## Verification

- unverified: 314

## Item client data

- Client-enriched items: 0/436
- Item rarities: 0/436
- Equipment slots: 0/436
- Armor values: 0/436
- Required levels: 0/436
- Vendor sell prices: 0/436

## Canonical route metadata

- Known learning rank: 308/314
- Known acquisition: 177/314
- Known availability: 226/314
- Specialization-gated recipes: 64

## Supplemental evidence

- Classic learning-rank fallbacks: 0
- Recipes with source-kind evidence: 219
- Recipes with Forever-specific source-kind evidence: 0
- Recipes with a teaching item: 220
- Recipes with an unanchored orange value: 6
- Recipes with a classified output item: 234

## Route coverage

### leatherworking: 1 → 300

Covered skill points: 299/299

No skill gaps with the currently eligible recipe metadata.

## Findings

### INFO · non-leveling-recipe (2)

The recipe is already gray when learned and must not be considered for leveling routes.

Examples: `spell-10482`, `spell-22331`

### WARNING · classic-fallback (314)

Classic fallback records are not authoritative for Forever.

Examples: `spell-2149`, `spell-2152`, `spell-2153`, `spell-2158`, `spell-2159`, `spell-2160`, `spell-2161`, `spell-2162`

### WARNING · unverified-recipe (314)

Recipe records still require Forever-specific verification.

Examples: `spell-2149`, `spell-2152`, `spell-2153`, `spell-2158`, `spell-2159`, `spell-2160`, `spell-2161`, `spell-2162`

### WARNING · missing-learn-skill (6)

The recipe learning rank is unknown, so route eligibility cannot be proven.

Examples: `spell-1223774`, `spell-1223776`, `spell-1223778`, `spell-1223780`, `spell-1223782`, `spell-1223784`

### WARNING · unknown-acquisition (137)

The recipe acquisition method is unknown.

Examples: `spell-2169`, `spell-3762`, `spell-3765`, `spell-3767`, `spell-3769`, `spell-3771`, `spell-3773`, `spell-3775`

### WARNING · unknown-availability (88)

The recipe is present in client data, but its obtainability in Forever is not established.

Examples: `spell-19093`, `spell-22815`, `spell-28219`, `spell-28220`, `spell-28221`, `spell-28222`, `spell-28223`, `spell-28224`

### INFO · unknown-faction (314)

The recipe's faction eligibility is unknown.

Examples: `spell-2149`, `spell-2152`, `spell-2153`, `spell-2158`, `spell-2159`, `spell-2160`, `spell-2161`, `spell-2162`

### WARNING · missing-item-name (78)

At least one referenced item has no English name in the item snapshot.

Examples: `spell-429354`, `spell-429869`, `spell-435904`, `spell-435949`, `spell-435951`, `spell-435953`, `spell-439105`, `spell-439108`

### WARNING · provisional-output-quantity (314)

Output quantity is provisionally one because the source snapshot does not encode stack size.

Examples: `spell-2149`, `spell-2152`, `spell-2153`, `spell-2158`, `spell-2159`, `spell-2160`, `spell-2161`, `spell-2162`
