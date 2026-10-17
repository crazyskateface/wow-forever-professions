# Browser-local personalization

Forever Professions remembers planning preferences without requiring an account. The
web client stores one versioned JSON profile under the local-storage key
`forever-professions.personalization.v1`.

## Saved preferences

- current calculator and guide-progress skill;
- route starting skill and target skill;
- route optimization objective;
- trainer-only preference;
- shopping-list strategy;
- region, auction market, and character faction;
- the Legacy profession skill-bonus input;
- Forever Changes profession, change-type, item-type, and skill-availability filters.

The internal market is selected from the active region and faction and is used for
recipe prices, cost optimization, and shopping-list requests. The market remains in
the stored profile for request stability, but its direct selector is hidden until
live market choices are ready for users. The selected faction is sent to the optimizer
as an eligibility constraint.
The browser restores saved route settings when it generates the initial guide.
Changing region or faction cancels in-flight planning requests and clears
route and shopping results that were calculated with the previous profile. The
session's known-recipe selection is preserved so the next route rebuild uses the
player's active choices.

The Legacy profession bonus is saved but intentionally not applied to calculations.
Forever-specific modifier behavior has not been verified, so applying the number to
recipe thresholds or learning requirements would present an unsupported assumption as
game behavior.

## Safety and failure behavior

The stored object has a schema version and is parsed defensively. Unknown versions,
invalid enum values, malformed JSON, and out-of-range skill values fall back to safe
defaults. A target below its route starting skill is raised to the starting skill.

If browser storage is blocked or unavailable, the UI remains usable and explains that
changes will last only for the current tab. The profile menu includes **Reset
preferences**, which restores defaults and replaces the stored profile on the next
state update.

No character name, account identifier, credentials, auction data, or imported game
data is stored in the browser profile. Preferences do not sync between browsers or
devices.

Known recipes remain session-only. Persisting known recipes or multiple character
profiles is intentionally deferred until the product has a trustworthy source for
character-specific recipe knowledge.
