# External guide references

These files are versioned comparison inputs for route-quality review. They are not
canonical recipe data and must never be imported as supported Forever facts.

Each reference records its source URL, capture time, stated client build, assumptions,
route ranges, craft estimates, and published reagent totals. The validation command
compares those values with a generated route and emits review findings; it does not
modify recipe snapshots or overrides.

To refresh a reference:

1. verify the source still describes WoW Forever rather than Classic;
2. update the capture timestamp and applicable build;
3. transcribe the complete route and any published totals;
4. preserve the source's assumptions in the reference file;
5. run the contracts and optimizer tests, then regenerate the validation report.

Do not silently update an old reference when its source changes methodology. Create a
new build- or date-stamped reference so historical comparisons remain reproducible.
