# Data quality report: 1.60.1.69977

Professions: 1 · Recipes: 603 · Items: 760

## Sources

- client-data: 1

## Verification

- unverified: 603

## Canonical route metadata

- Known learning rank: 477/603
- Known acquisition: 6/603
- Known availability: 6/603
- Specialization-gated recipes: 60

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

### WARNING · missing-learn-skill (126)

The recipe learning rank is unknown, so route eligibility cannot be proven.

Examples: `spell-2153`, `spell-2159`, `spell-2160`, `spell-2161`, `spell-2162`, `spell-2165`, `spell-2166`, `spell-2167`

### WARNING · unknown-acquisition (597)

The recipe acquisition method is unknown.

Examples: `spell-2153`, `spell-2158`, `spell-2159`, `spell-2160`, `spell-2161`, `spell-2162`, `spell-2163`, `spell-2164`

### WARNING · unknown-availability (597)

The recipe is present in client data, but its obtainability in Forever is not established.

Examples: `spell-2153`, `spell-2158`, `spell-2159`, `spell-2160`, `spell-2161`, `spell-2162`, `spell-2163`, `spell-2164`

### INFO · unknown-faction (603)

The recipe's faction eligibility is unknown.

Examples: `spell-2149`, `spell-2152`, `spell-2153`, `spell-2158`, `spell-2159`, `spell-2160`, `spell-2161`, `spell-2162`

### WARNING · missing-item-name (90)

At least one referenced item has no English name in the item snapshot.

Examples: `spell-429354`, `spell-429869`, `spell-435904`, `spell-435949`, `spell-435951`, `spell-435953`, `spell-439105`, `spell-439108`

### WARNING · borrowed-required-skill-omitted (68)

A Vanilla-borrowed learning rank was omitted instead of being presented as Forever data.

Examples: `spell-2153`, `spell-2159`, `spell-2160`, `spell-2161`, `spell-2162`, `spell-2165`, `spell-2166`, `spell-2167`

### WARNING · provisional-output-quantity (603)

Output quantity is provisionally one because the source snapshot does not encode stack size.

Examples: `spell-2149`, `spell-2152`, `spell-2153`, `spell-2158`, `spell-2159`, `spell-2160`, `spell-2161`, `spell-2162`
