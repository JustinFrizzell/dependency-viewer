# 02: Inspect a table and its relationships

**What to build:** A recipient can select a table in the offline graph and explore its description and immediate relationships without losing the overall graph view.

**Blocked by:** [01: Open an offline lineage graph](01-open-offline-lineage-graph.md).

**Status:** resolved

**Spec:** [Offline lineage viewer MVP](../../offline-lineage-viewer/spec.md).

- [x] With no table selected, the bottom inspector prompts the recipient to select one.
- [x] Selecting a graph node shows its full name, description, direct input tables, and direct downstream tables without filtering the graph or changing the viewport.
- [x] Selecting a related table in the inspector selects it and displays its details.
- [x] An undocumented input is visually distinguished and its unknown description and inputs are clearly identified.
- [x] Descriptions render as plain text, including special characters; automated behavior checks cover selection, relationships, and placeholders.

## Comments

Implemented on `integration/offline-lineage-viewer` in `4373e44`; `npm run test:lineage` passed.
