# Define MVP acceptance criteria

Type: grilling
Status: resolved
Blocked by: 04

## Question

What observable acceptance criteria and checks establish that the MVP satisfies the agreed contract, user experience, generation workflow, and architecture? Include opening the generated file directly without network access and a representative graph of roughly 500 tables.

Input: [Choose the viewer architecture](04-viewer-architecture.md) and its prerequisites.

## Answer

- Build a single self-contained HTML template with exactly one documented JSON marker. The unfilled template reports that lineage data has not been embedded.
- Inject representative valid JSON and open the resulting file directly via `file://` in current Safari on macOS with networking disabled. Confirm that the viewer works and makes no external requests. Edge on Windows is an intended target, but is not tested or a release gate for the MVP.
- Exercise the agreed graph direction, search, selection, details and related-table navigation, placeholder and empty states, transitive lineage filters, return to All, and pan, zoom, and reset-to-fit.
- Exercise a representative dataset of approximately 200 tables across several disconnected graphs, including paths of four input-to-output edges. Do not impose a strict timing target or a four-hop traversal limit.
- Use repeatable automated checks for the data and template, including input-to-output edges, case-sensitive identities, repeated inputs, undocumented placeholders, empty data, and a clear error for unusable embedded data.
- Verify that descriptions containing quotes, Unicode, and `</script>` survive safe injection and display as plain text without executing markup.
- The separate data project tests its own Python validation and injection step, including invalid data and cycles. This repository tests its template and a representative injected file; it does not have to supply the production Python step.
