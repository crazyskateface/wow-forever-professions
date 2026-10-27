# Data quality report: 1.15.9.69722

Professions: 10 · Recipes: 1565 · Items: 1752

## Sources

- classic-fallback: 1

## Verification

- unverified: 1565

## Item client data

- Client-enriched items: 0/1752
- Item rarities: 0/1752
- Equipment slots: 0/1752
- Armor values: 0/1752
- Items with tooltip stats: 0/1752
- Tooltip stat lines: 0
- Required levels: 0/1752
- Vendor sell prices: 0/1752

## Canonical route metadata

- Known learning rank: 1551/1565
- Known acquisition: 869/1565
- Known availability: 1224/1565
- Specialization-gated recipes: 144

## Supplemental evidence

- Classic learning-rank fallbacks: 0
- Recipes with source-kind evidence: 1175
- Recipes with Forever-specific source-kind evidence: 0
- Recipes with a teaching item: 1072
- Recipes with an unanchored orange value: 14
- Recipes with a classified output item: 1123

## Route coverage

### alchemy: 1 → 300

Covered skill points: 299/299

No skill gaps with the currently eligible recipe metadata.

### blacksmithing: 1 → 300

Covered skill points: 299/299

No skill gaps with the currently eligible recipe metadata.

### enchanting: 1 → 300

Covered skill points: 299/299

No skill gaps with the currently eligible recipe metadata.

### engineering: 1 → 300

Covered skill points: 299/299

No skill gaps with the currently eligible recipe metadata.

### leatherworking: 1 → 300

Covered skill points: 299/299

No skill gaps with the currently eligible recipe metadata.

### tailoring: 1 → 300

Covered skill points: 299/299

No skill gaps with the currently eligible recipe metadata.

### cooking: 1 → 300

Covered skill points: 299/299

No skill gaps with the currently eligible recipe metadata.

### first-aid: 1 → 300

Covered skill points: 299/299

No skill gaps with the currently eligible recipe metadata.

### fishing: 1 → 300

Covered skill points: 0/299

Gaps: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299

### mining: 1 → 300

Covered skill points: 169/299

Gaps: 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299

## Findings

### INFO · non-leveling-recipe (17)

The recipe is already gray when learned and must not be considered for leveling routes.

Examples: `engineering:spell-12715`, `engineering:spell-13240`, `engineering:spell-15628`, `engineering:spell-15633`, `spell-10482`, `spell-22331`, `cooking:spell-3413`, `cooking:spell-18260`

### WARNING · classic-fallback (1565)

Classic fallback records are not authoritative for Forever.

Examples: `alchemy:spell-2329`, `alchemy:spell-2330`, `alchemy:spell-2331`, `alchemy:spell-2332`, `alchemy:spell-2333`, `alchemy:spell-2334`, `alchemy:spell-2335`, `alchemy:spell-2336`

### WARNING · unverified-recipe (1565)

Recipe records still require Forever-specific verification.

Examples: `alchemy:spell-2329`, `alchemy:spell-2330`, `alchemy:spell-2331`, `alchemy:spell-2332`, `alchemy:spell-2333`, `alchemy:spell-2334`, `alchemy:spell-2335`, `alchemy:spell-2336`

### WARNING · missing-learn-skill (14)

The recipe learning rank is unknown, so route eligibility cannot be proven.

Examples: `blacksmithing:spell-1223787`, `blacksmithing:spell-1223789`, `blacksmithing:spell-1223791`, `spell-1223774`, `spell-1223776`, `spell-1223778`, `spell-1223780`, `spell-1223782`

### WARNING · unknown-acquisition (696)

The recipe acquisition method is unknown.

Examples: `alchemy:spell-2333`, `alchemy:spell-2336`, `alchemy:spell-3172`, `alchemy:spell-3175`, `alchemy:spell-3449`, `alchemy:spell-3450`, `alchemy:spell-3451`, `alchemy:spell-3453`

### WARNING · unknown-availability (341)

The recipe is present in client data, but its obtainability in Forever is not established.

Examples: `alchemy:spell-11452`, `alchemy:spell-11456`, `alchemy:spell-24266`, `alchemy:spell-426607`, `alchemy:spell-435969`, `alchemy:spell-435971`, `alchemy:spell-439960`, `alchemy:spell-446226`

### INFO · unknown-faction (1565)

The recipe's faction eligibility is unknown.

Examples: `alchemy:spell-2329`, `alchemy:spell-2330`, `alchemy:spell-2331`, `alchemy:spell-2332`, `alchemy:spell-2333`, `alchemy:spell-2334`, `alchemy:spell-2335`, `alchemy:spell-2336`

### WARNING · missing-item-name (248)

At least one referenced item has no English name in the item snapshot.

Examples: `alchemy:spell-2336`, `alchemy:spell-435969`, `alchemy:spell-435971`, `alchemy:spell-446226`, `alchemy:spell-446851`, `alchemy:spell-448085`, `alchemy:spell-1213544`, `alchemy:spell-1213546`

### WARNING · provisional-output-quantity (1403)

Output quantity is provisionally one because the source snapshot does not encode stack size.

Examples: `alchemy:spell-2329`, `alchemy:spell-2330`, `alchemy:spell-2331`, `alchemy:spell-2332`, `alchemy:spell-2333`, `alchemy:spell-2334`, `alchemy:spell-2335`, `alchemy:spell-2336`
