# 03: Find a table by name

**What to build:** A recipient can find any table from a collapsible list and open its details without manually searching the graph.

**Blocked by:** [02: Inspect a table and its relationships](02-inspect-table-relationships.md).

**Status:** resolved

**Spec:** [Offline lineage viewer MVP](../../offline-lineage-viewer/spec.md).

- [x] A searchable table list overlays the graph and can be collapsed to make more room for the canvas.
- [x] Search matches full table names case-insensitively without merging case-sensitive table identities.
- [x] Selecting a result selects and centers that table and displays its inspector details, including for undocumented inputs.
- [x] A search with no matches is understandable, and repeatable behavior checks cover matching and selection.

## Comments

Implemented on `integration/offline-lineage-viewer` in `1f3d471`; `npm run test:lineage` passed.
