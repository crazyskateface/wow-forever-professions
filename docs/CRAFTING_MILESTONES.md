# Character-level crafting milestones

Research date: 2026-10-25. This is the one-time level-bracket decision for the
**Best crafts** workspace. It replaces the main Leveling Route tab's
purpose; profession-skill progression remains in the left-hand guide.

## Recommended checkpoints

Use **20, 30, 40, 50, 55, and 60** as character-level targets. Label them
"By level 20", "By level 30", and so on. These are editorial checkpoints based on
the equipment unlocks in the pinned catalog, not profession skill ranges or a
runtime optimization problem. Each item must also show its actual required level.

| Target | Evidence in the current catalog | Purpose |
| --- | --- | --- |
| 20 | Rare boots at 10, belts at 12, gloves/chests at 15, boots at 17, Deviate Scale Belt at 18, and hoods/pants at 20. | Collect the first meaningful set of crafts without omitting the upgrades just after level 15. |
| 30 | Tunics at 22, leggings and helms at 25, and another belt group at 30. | Cover the next equipment cycle rather than cutting it off at 25. |
| 40 | Gloves at 35, Nightscape pieces at 36, and leather/mail boot groups at 40. | Capture the transition into the middle-level gear. |
| 50 | Shoulders at 42, bracers at 45, boots at 47, and waist/hand groups at 50. | Collect the next broad set of slot upgrades. |
| 55 | Multiple crafts at 51–55, including Devilsaur Gauntlets at 53 and Devilsaur Leggings at 55. | Keep the first late-level targets separate from equipment that cannot be worn until later. |
| 60 | Further crafts at 56 and 57, plus level-60 equipment. | Cover the remaining leveling and level-cap targets. |

An item requiring level 19 belongs in the level-20 target. A level-57 item cannot
be presented as wearable in the level-55 target. Earlier items may remain useful
at later checkpoints; a target is not an exclusive lower/upper-level filter.

These checkpoints do not claim every level-20 item is preferable to every
level-17 item. Choosing the best craft for a slot is a separate, role-dependent
decision. Do not use rarity or the highest required level alone as a ranking.

## Evidence and limits

The primary evidence is the repository's immutable Forever recipe snapshot:

- Recipe build: `1.60.1.69977`.
- Item metadata: `wow_classic_beta`, build `1.60.1.70450`, locale `enUS`.
- File: [`data/imports/forever-1.60.1.69977-leatherworking.json`](../data/imports/forever-1.60.1.69977-leatherworking.json).
- Fields inspected: output item class, equipment slot, quality, required level,
  ordered stats, recipe learning skill, acquisition, and availability.

Of the 603 recipes, 474 have equipment outputs. Of those equipment outputs, 32
have no client required-level metadata and cannot be assigned an equip-level
checkpoint from this evidence. Rare-or-better equipment is concentrated at several of the
listed unlock levels: 12 entries each at 15, 20, and 25; 11 each at 40 and 45;
20 at 50; and 29 at 60. These counts describe catalog entries, not confirmed
obtainable recipes or a list of best items.

Many pattern sources and learning requirements remain unknown. Presence in the
client does not establish that a pattern can currently be obtained. Keep those
unknowns visible on recommendations; exclude explicitly unavailable or rejected
recipes. Do not borrow a Classic learning rank, invent a pattern source, or
present these recommendations as a comparison against all dungeon/quest gear.

External context consulted:

- [Hearthproof: Skinning and Leatherworking while leveling](https://www.hearthproof.com/professions/skinning-leatherworking/)
  independently groups character progression around 20, 30, 40, 50, and 60 and
  distinguishes client observations from speculative recommendations. The local
  snapshot remains the authority for item fields used by this application.
- [Method: Forever Hunter leveling](https://www.method.gg/wow-forever/wow-forever-hunter-leveling-guide-and-talents)
  discusses useful crafted gear beginning at level 10. This supports including
  early crafts in the first checkpoint rather than treating 20 as a minimum level.

## Accepted product decisions

- Recommend the best crafts within the selected profession. The current catalog is
  Leatherworking; do not claim superiority to all dungeon, quest or raid equipment.
- Users choose class and role, including Rogue, Feral Cat/Bear, Balance and
  Restoration Druid, Hunter, and Enhancement/Elemental/Restoration Shaman. Other
  classes can compare compatible armor and cloaks in this profession too.
- Keep the automatic leveling guide and individual completion checkboxes in the
  left panel. Guide settings, shopping, bulk completion and expandable step metrics
  were removed at the user's request. The main tab is Best crafts; its extra intro
  copy and equipment-slot count were also removed.

## Comparison policy

`packages/domain/src/best-crafts.ts` contains the fixed targets and explicit role
weights. It compares each equipment slot independently, retains useful earlier
crafts, and offers the next two distinct items as alternatives. Neither item rarity
nor a high equip level alone makes an item better. Equal scores prefer known
availability, then the earlier equip level and stable recipe/item IDs.

These are editorial priorities, not measured Forever combat-stat equivalences:

| Profile | Main weights | Supporting weights |
| --- | --- | --- |
| Rogue | Agility 2; attack power 1; hit/crit 1.5 | Strength 1; stamina 0.25 |
| Feral Cat | Agility/strength 2; attack power 1; hit/crit 1.5 | Stamina 0.25 |
| Hunter | Agility 2; attack power/ranged AP 1; hit/crit 1.5 | Intellect 0.3; stamina 0.25 |
| Strength melee | Strength 2; agility/AP 1; hit/crit 1.5 | Stamina 0.25; Enhancement adds spell damage/power 0.4 |
| Healing | Healing/spell power 1; mana per 5 seconds 2 | Intellect/crit 0.5; spirit 0.35; stamina 0.1 |
| Spell damage | Spell damage/power 1; hit 1.5; crit 1 | Intellect 0.5; spirit 0.15; stamina 0.1; Balance/Elemental add nature damage 0.5 |
| Tank | Stamina 2; agility 1; dodge/parry 1.5 | Strength 0.5; armor/bonus armor 0.06; Bear excludes parry |

Armor compatibility uses cloth/leather/mail/plate proficiency, including the level-40
mail transition for Hunter/Shaman and plate for Warrior/Paladin. Lower armor types
remain eligible, and cloaks are available to all classes. This does not model armor
specialization bonuses, talents, set bonuses, procs, current equipped gear, unique
effects, or class restrictions absent from the imported fields. Show the item's
exact stats and source so players can compare those tradeoffs.

Only `wow_classic_beta` item metadata from a `1.60.*` build is currently ranked.
Missing stat arrays, item classification, or item metadata stay excluded and counted;
empty stat arrays are permitted (base armor can matter to tanks). Do not substitute
Classic stats. Explicitly unavailable, rejected, fallback and fixture recipes are
excluded; opposite-faction recipes are filtered. Unknown availability is retained
and labeled, as are unknown learning skill and faction restrictions. Specializations
are shown as requirements rather than silently assumed to be owned.

The milestone constants require no runtime research or new ingestion workflow.
Tests were deferred until the full implementation was ready, as requested.
