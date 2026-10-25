# Browser-local personalization

Forever Professions remembers planning preferences without requiring an account. The
web client stores one versioned JSON profile under the local-storage key
`forever-professions.personalization.v2`.

## Saved preferences

- current calculator and guide-progress skill;
- route preset;
- shopping-list strategy;
- region, auction market, and character faction;
- the Legacy profession skill-bonus input;
- Forever Changes profession, change-type, item-type, and skill-availability filters.

The internal market is selected from the active region and faction and is used for
recipe prices, cost optimization, and shopping-list requests. The market remains in
the stored profile for request stability, but its direct selector is hidden until
live market choices are ready for users. The selected faction is sent to the optimizer
as an eligibility constraint.
The browser restores the saved route preset when it generates the initial guide. The
guide always covers skill 1 through the configured base profession cap of 300. Current
skill highlights and scrolls to the relevant guide segment; it does not change or
truncate the generated route.
The guide, catalog, and changes views use native range inputs with a 32px-high grab
area. Dragging updates current skill continuously; arrow keys, Home/End, and the
stepper buttons remain available. Text selection and HTML drag-and-drop are suppressed
on the control so grabbing near the track does not start a text drag. Touch gestures
started on the slider adjust skill without panning the page.
Changing region or faction cancels in-flight planning requests and clears
route and shopping results that were calculated with the previous profile. The
session's known-recipe selection is preserved so the next route rebuild uses the
player's active choices.

Version-1 profiles are migrated when read. Their current skill and supported
preferences are retained, objective/confidence/trainer-only controls are mapped to the
closest named preset, and obsolete route start, target, and linkage fields are dropped.

Checklist completion is stored separately under a route fingerprint containing the
recipe build, profession, skill range, preset, resolved objective and confidence
policy, market, faction, known-recipe selection, and generated segment identities. A
materially different route therefore starts with no checked steps. The checklist can
mark every finished segment through current skill or focus the next incomplete step.

Shopping progress uses the same route fingerprint in a separate versioned record.
It stores only nonzero owned quantities and checked material identifiers. Changing
an owned quantity recalculates the remaining amount in the browser without changing
the route's expected quantities or the canonical shopping plan. Rebuilding the same
route restores those values; a materially different route starts with a clean
shopping checklist.

The Legacy profession bonus is saved but intentionally not applied to calculations.
Forever-specific modifier behavior has not been verified, so applying the number to
recipe thresholds or learning requirements would present an unsupported assumption as
game behavior.

## Safety and failure behavior

The stored object has a schema version and is parsed defensively. Unknown versions,
invalid enum values, malformed JSON, and out-of-range current-skill values fall back
to safe defaults.

If browser storage is blocked or unavailable, the UI remains usable and explains that
changes will last only for the current tab. The profile menu includes **Reset
preferences**, which restores defaults and replaces the stored profile on the next
state update.

No character name, account identifier, credentials, auction data, or imported game
data is stored in the browser profile, route-progress, or shopping-progress records.
Preferences and checklist completion do not sync between browsers or devices.

Known recipes remain session-only. Their identifiers participate in the current
route fingerprint so completion cannot leak onto a different selection, but the
selection itself is not restored after the session. Persisting known recipes or
multiple character profiles is intentionally deferred until the product has a
trustworthy source for character-specific recipe knowledge.

## Skill-slider browser regression checks

In Chrome, check all three sidebar views on desktop and a narrow viewport:

1. Focus the slider and press Home. Grab 10px below the center of the thumb and drag
   to the right end. Skill should update during the gesture and reach 300.
2. Drag back to 1, allowing the pointer to drift vertically outside the track after
   grabbing it. It should keep updating without selecting text or showing a drag ghost.
3. Check Home, End, arrow keys, and both stepper buttons. Only the stepper button at
   its corresponding limit is disabled; the slider always permits dragging back.
4. Switch views and reload. The selected skill should be shared and restored, and
   changing it must not rebuild or truncate the leveling route.
