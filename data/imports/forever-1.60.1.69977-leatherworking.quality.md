# Data quality report: 1.60.1.69977

Professions: 1 · Recipes: 603 · Items: 760

## Sources

- client-data: 1
- manual-override: 4

## Verification

- unverified: 603

## Item client data

- Client-enriched items: 630/760
- Item rarities: 630/760
- Equipment slots: 452/760
- Armor values: 443/760
- Items with tooltip stats: 427/760
- Tooltip stat lines: 1174
- Required levels: 630/760
- Vendor sell prices: 630/760

## Canonical route metadata

- Known learning rank: 484/603
- Known acquisition: 14/603
- Known availability: 14/603
- Specialization-gated recipes: 60

## Supplemental evidence

- Classic learning-rank fallbacks: 68
- Recipes with source-kind evidence: 225
- Recipes with Forever-specific source-kind evidence: 8
- Recipes with a teaching item: 457
- Recipes with an unanchored orange value: 119
- Recipes with a classified output item: 513

## Route coverage

### leatherworking: 1 → 300

Covered skill points: 299/299

No skill gaps with the currently eligible recipe metadata.

## Findings

### INFO · non-leveling-recipe (13)

The recipe is already gray when learned and must not be considered for leveling routes.

Examples: `spell-1252982`, `spell-1252983`, `spell-1252984`, `spell-1252985`, `spell-1252986`, `spell-1252987`, `spell-1252995`, `spell-1252996`

### WARNING · unverified-recipe (603)

Recipe records still require Forever-specific verification.

Examples: `spell-2149`, `spell-2152`, `spell-2153`, `spell-2158`, `spell-2159`, `spell-2160`, `spell-2161`, `spell-2162`

### WARNING · missing-learn-skill (119)

The recipe learning rank is unknown, so route eligibility cannot be proven.

Examples: `spell-2153`, `spell-2159`, `spell-2160`, `spell-2165`, `spell-2166`, `spell-2167`, `spell-2168`, `spell-3753`

### WARNING · unknown-acquisition (589)

The recipe acquisition method is unknown.

Examples: `spell-2153`, `spell-2159`, `spell-2160`, `spell-2163`, `spell-2164`, `spell-2165`, `spell-2166`, `spell-2167`

### WARNING · unknown-availability (589)

The recipe is present in client data, but its obtainability in Forever is not established.

Examples: `spell-2153`, `spell-2159`, `spell-2160`, `spell-2163`, `spell-2164`, `spell-2165`, `spell-2166`, `spell-2167`

### INFO · unknown-faction (603)

The recipe's faction eligibility is unknown.

Examples: `spell-2149`, `spell-2152`, `spell-2153`, `spell-2158`, `spell-2159`, `spell-2160`, `spell-2161`, `spell-2162`

### WARNING · missing-item-name (90)

At least one referenced item has no English name in the item snapshot.

Examples: `spell-429354`, `spell-429869`, `spell-435904`, `spell-435949`, `spell-435951`, `spell-435953`, `spell-439105`, `spell-439108`

### WARNING · borrowed-required-skill-fallback (68)

A Vanilla-borrowed learning rank is retained only as an explicitly labeled fallback, not presented as Forever data.

Examples: `spell-2153`, `spell-2159`, `spell-2160`, `spell-2161`, `spell-2162`, `spell-2165`, `spell-2166`, `spell-2167`

### WARNING · provisional-output-quantity (595)

Output quantity is provisionally one because the source snapshot does not encode stack size.

Examples: `spell-2149`, `spell-2152`, `spell-2153`, `spell-2159`, `spell-2160`, `spell-2163`, `spell-2164`, `spell-2165`
