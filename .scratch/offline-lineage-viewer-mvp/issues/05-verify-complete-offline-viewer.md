# 05: Verify the complete offline viewer

**What to build:** A maintainer can demonstrate that the complete viewer and its distributable HTML satisfy the agreed offline, interaction, data, and representative-scale requirements.

**Blocked by:** [03: Find a table by name](03-find-table-by-name.md); [04: Focus upstream and downstream lineage](04-focus-upstream-downstream-lineage.md).

**Status:** resolved

**Spec:** [Offline lineage viewer MVP](../../offline-lineage-viewer/spec.md).

- [x] Repeatable checks exercise a representative injected file, including case-sensitive identities, duplicate inputs, placeholders, empty data, and unusable embedded data.
- [x] A description containing quotes, Unicode, and a closing script tag survives safe injection and displays as plain text without executing markup.
- [x] A representative dataset of approximately 200 tables spans several disconnected graphs and includes paths of four input-to-output edges; search, selection, and lineage navigation remain usable without a strict timing target.
- [ ] Open the actual injected HTML directly in current Safari on macOS with networking disabled. Confirm no external requests and walk through search, selection, details, related tables, lineage views, return to All, pan, zoom, reset, placeholders, and the empty state.
- [x] Edge on Windows is not an MVP release gate. The separate data project owns tests of its production Python validator and injector; no production Python implementation is required here.

## Comments

Automated acceptance fixtures and checks were added in `43ec0b5`; `npm run test:lineage` passed. The Safari walkthrough remains outstanding: networking is shared and cannot safely be disabled here, and visual browser interaction was unavailable. The walkthrough is documented in `lineage-viewer/README.md`.

The user deferred the offline capability check on 2026-11-20; the unchecked Safari walkthrough has not been performed.
