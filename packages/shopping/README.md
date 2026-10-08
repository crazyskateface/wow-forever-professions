# Shopping planner

This package owns the pure Phase 5 shopping-list and nested-crafting algorithm. It aggregates expected route reagents, compares buying intermediates with crafting them, expands selected crafting recipes recursively, and prevents cycles.

Missing prices and missing item sources remain explicit unresolved states. They are never treated as zero-cost materials. A priced buy fallback may safely break a cyclic crafting graph; otherwise the cycle is reported with its item path.

Run the focused suite with:

```text
pnpm --filter @forever-professions/shopping test
```
