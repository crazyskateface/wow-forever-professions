# Data quality report: 1.60.1.69977

Professions: 1 · Recipes: 603 · Items: 760

## Sources

- client-data: 1

## Verification

- unverified: 603

## Findings

### WARNING · unverified-recipe (603)

Recipe records still require Forever-specific verification.

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
