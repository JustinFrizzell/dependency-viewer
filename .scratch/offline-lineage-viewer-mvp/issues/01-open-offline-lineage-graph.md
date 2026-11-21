# 01: Open an offline lineage graph

**What to build:** A recipient can open a standalone HTML viewer containing representative lineage and explore its directed table graph offline. A maintainer can build the reusable template and identify its single JSON injection point. This slice is independent of dbt artifacts and the existing dbt application.

**Blocked by:** None (can start immediately).

**Status:** resolved

**Spec:** [Offline lineage viewer MVP](../../offline-lineage-viewer/spec.md).

- [x] Build a single self-contained template with exactly one documented JSON marker. The unfilled template clearly reports that lineage data has not been embedded.
- [ ] A representative injected file opens directly without a server or network and initially fits the complete graph with no selection. Inputs point toward downstream tables in a left-to-right layout.
- [ ] Pan, zoom controls, wheel zoom, and reset-to-fit work on the graph.
- [x] Case-sensitive table identities remain distinct; repeated inputs produce one relationship; unlisted input tables appear as distinguishable undocumented placeholders.
- [x] An empty dataset shows an empty state, and unusable embedded data shows a clear error rather than a silently partial graph.
- [x] Repeatable checks exercise the built template and representative injected data, including the marker and graph-data edge cases. Keep the existing dbt source as a reference.

## Comments

Implemented on `integration/offline-lineage-viewer` in `182d07f`. Automated checks pass, but direct offline Safari verification remains outstanding; see issue 05.

The user deferred the offline capability check on 2026-11-20; continue without treating it as verified.

Zoom controls, wheel zoom, and reset have automated checks; the manual pan walkthrough is still outstanding.
