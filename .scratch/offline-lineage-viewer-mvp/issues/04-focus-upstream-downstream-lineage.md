# 04: Focus upstream and downstream lineage

**What to build:** A recipient can focus the graph on a selected table's lineage and return to the complete graph.

**Blocked by:** [02: Inspect a table and its relationships](02-inspect-table-relationships.md).

**Status:** resolved

**Spec:** [Offline lineage viewer MVP](../../offline-lineage-viewer/spec.md).

- [x] Connected, Upstream, and Downstream views require a selected table and show all transitively reachable tables in the appropriate direction or both directions.
- [x] Changing the selection while a lineage view is active refocuses and fits the resulting graph.
- [x] All restores and fits the complete graph while retaining the selected table.
- [x] Behavior checks cover branching, disconnected graphs, and paths longer than four edges without imposing a traversal-depth limit.

## Comments

Implemented on `integration/offline-lineage-viewer` in `f2058dd`; `npm run test:lineage` passed after merging search.
