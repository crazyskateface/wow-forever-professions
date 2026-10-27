# Browser-local personalization

Forever Professions remembers planning preferences without requiring an account. The
web client stores one versioned JSON profile under the local-storage key
`forever-professions.personalization.v3`.

## Saved preferences

- current calculator and guide-progress skill;
- region, auction market, and character faction;
- the Legacy profession skill-bonus input;
- Forever Changes profession, change-type, item-type, and skill-availability filters.

The internal market is selected from the active region and faction and is used for
recipe prices and automatic guide requests. The market remains in
the stored profile for request stability, but its direct selector is hidden until
live market choices are ready for users. The selected faction is sent to the optimizer
as an eligibility constraint.
The browser generates the initial guide with the Practical preset. The
guide always covers skill 1 through the configured base profession cap of 300. Current
skill highlights and scrolls to the relevant guide segment; it does not change or
truncate the generated route.
The guide, catalog, and changes views use native range inputs with a 32px-high grab
area. Dragging updates current skill continuously; arrow keys, Home/End, and the
stepper buttons remain available. Text selection and HTML drag-and-drop are suppressed
on the control so grabbing near the track does not start a text drag. Touch gestures
started on the slider adjust skill without panning the page.
Changing region or faction cancels in-flight guide requests and regenerates the
guide for the new profile. Automatic requests use the full loaded catalog's recipe
IDs as their known-recipe constraint.

Version-1 and version-2 profiles are migrated when read. Current skill and supported
profile/filter preferences are retained. Removed route presets, shopping strategies,
route bounds and linkage fields are dropped. Reset clears all three profile versions.

Checklist completion is stored separately under a route fingerprint containing the
recipe build, profession, skill range, preset, resolved objective and confidence
policy, market, faction, known-recipe selection, and generated segment identities. A
materially different route therefore starts with no checked steps. Users check
individual guide steps. Bulk completion, guide settings, route sharing and shopping
functionality have been removed from the web client. Old shopping-progress records
are no longer read or written.

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
data is stored in the browser profile or route-progress records.
Preferences and checklist completion do not sync between browsers or devices.

The full catalog's recipe identifiers participate in the current route fingerprint
so completion cannot leak onto a different selection. Character-specific recipe
knowledge is not editable in the web client.

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
