# Browser-local personalization

Forever Professions remembers planning preferences without requiring an account. The
web client stores one versioned JSON profile under the local-storage key
`forever-professions.personalization.v1`.

## Saved preferences

- current calculator and guide-progress skill;
- route starting skill, whether it follows current skill, and target skill;
- route optimization objective and confidence policy;
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
New profiles link the route start to current skill by default. Existing profiles keep
an explicitly different route start unlinked, and players can unlink the fields from
the planner when they need to model a different range.
Changing region or faction cancels in-flight planning requests and clears
route and shopping results that were calculated with the previous profile. The
session's known-recipe selection is preserved so the next route rebuild uses the
player's active choices.

Checklist completion is stored separately under a route fingerprint containing the
recipe build, profession, skill range, objective, confidence policy, market, faction,
trainer-only state, known-recipe selection, and generated segment identities. A
materially different route therefore starts with no checked steps. The checklist can
mark every finished segment through current skill or focus the next incomplete step.

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
data is stored in the browser profile or route-progress records. Preferences and
checklist completion do not sync between browsers or devices.

Known recipes remain session-only. Their identifiers participate in the current
route fingerprint so completion cannot leak onto a different selection, but the
selection itself is not restored after the session. Persisting known recipes or
multiple character profiles is intentionally deferred until the product has a
trustworthy source for character-specific recipe knowledge.
