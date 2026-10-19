# Shopping planner

This package owns the pure Phase 5 shopping-list and nested-crafting algorithm. It aggregates expected route reagents, compares buying intermediates with crafting them, expands selected crafting recipes recursively, and prevents cycles.

Missing prices and missing item sources remain explicit unresolved states. They are never treated as zero-cost materials. A priced buy fallback may safely break a cyclic crafting graph; otherwise the cycle is reported with its item path.

Available price observations retain their source timestamp through buy decisions so
API and UI consumers can state the age of every priced material and the oldest price
used by a plan. Owned quantities and checklist completion are presentation state;
they do not enter this package or mutate the canonical plan.

Run the focused suite with:

```text
pnpm --filter @forever-professions/shopping test
```
