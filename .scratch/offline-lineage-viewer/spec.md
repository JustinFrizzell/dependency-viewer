# Offline lineage viewer MVP

Status: resolved

## Problem Statement

I maintain table-level lineage in a separate data project and want to share it with people who do not use dbt. The existing dbt Docs site visualizes lineage but expects dbt artifacts and includes dbt-specific concepts that are unnecessary for my data. Recipients need to explore the lineage without installing software, starting a server, or connecting to the internet.

## Solution

Build a simplified, interactive lineage viewer as a reusable standalone HTML template. The data project validates and embeds its lineage JSON into a copy of the template. Recipients open the resulting file directly in a desktop browser to search tables, read descriptions, and explore upstream and downstream lineage.

## User Stories

1. As a data-project maintainer, I want to supply lineage as JSON, so that I can use data produced outside dbt.
2. As a data-project maintainer, I want to build a reusable viewer template, so that I can generate a viewer for different snapshots of my data.
3. As a data-project maintainer, I want to copy updated viewer templates into my data project, so that I control when the viewer changes.
4. As a data-project maintainer, I want to inject one dataset into a template copy, so that I can distribute one self-contained file.
5. As a data-project maintainer, I want a documented injection marker, so that my Python process does not depend on viewer internals.
6. As a data-project maintainer, I want the marker to occur exactly once, so that injection cannot accidentally target the wrong content.
7. As a data-project maintainer, I want to choose the final output location, so that it fits my data-project workflow.
8. As a data-project maintainer, I want to regenerate the file manually when lineage changes, so that I control the snapshot I publish.
9. As a data-project maintainer, I want validation or injection failures to preserve my previous output, so that a bad update does not replace a usable viewer.
10. As a data-project maintainer, I want my existing Python environment to handle injection, so that the data project does not require Node.js.
11. As a recipient, I want to open the viewer directly from a file, so that I do not need a web server.
12. As a recipient, I want the viewer to work offline, so that I can explore lineage without internet access.
13. As a recipient, I want the viewer to require no installation, so that I can use it without development tools.
14. As a recipient, I want the viewer to make no external requests, so that lineage is not sent to another service.
15. As a recipient, I want to see the complete graph initially, so that I can understand the overall landscape.
16. As a recipient, I want the graph fitted to the available canvas initially, so that I can see the available lineage.
17. As a recipient, I want no table selected initially, so that the initial view does not imply a particular focus.
18. As a recipient, I want a searchable table list over the graph, so that I can find tables without navigating the entire graph.
19. As a recipient, I want to collapse the table list, so that I can give the graph more room.
20. As a recipient, I want to search full table names without regard to case, so that I can find a table even if I do not remember its capitalization.
21. As a recipient, I want case-sensitive table identities to remain distinct, so that similarly named tables are not incorrectly merged.
22. As a recipient, I want to select a search result and center it on the canvas, so that I can find it in context.
23. As a recipient, I want to select a graph node without changing the graph view, so that I can inspect it without losing my place.
24. As a recipient, I want a bottom inspector for the selected table, so that details remain available alongside the graph.
25. As a recipient, I want a prompt when no table is selected, so that I know how to see details.
26. As a recipient, I want to see the selected table's full name, so that I can distinguish it from similarly named tables.
27. As a recipient, I want to read a table's description, so that I understand its purpose.
28. As a recipient, I want descriptions displayed as plain text, so that data cannot execute markup in my browser.
29. As a recipient, I want to see direct input tables, so that I can identify immediate upstream dependencies.
30. As a recipient, I want to see direct downstream tables, so that I can identify immediate consumers.
31. As a recipient, I want to select a related table from the inspector, so that I can navigate between dependencies.
32. As a recipient, I want relationships to point from input tables to their outputs, so that the direction of lineage is clear.
33. As a recipient, I want input tables placed to the left of downstream tables, so that lineage reads from left to right.
34. As a recipient, I want unlisted input tables to appear in the graph, so that references are not silently lost.
35. As a recipient, I want undocumented input tables visually distinguished, so that I know their descriptions and own inputs are unknown.
36. As a recipient, I want repeated references to the same input shown as one relationship, so that the graph is not cluttered by duplicate edges.
37. As a recipient, I want to focus on all connected upstream and downstream tables, so that I can inspect a table's lineage in context.
38. As a recipient, I want an upstream-only view, so that I can trace a table back to its inputs.
39. As a recipient, I want a downstream-only view, so that I can identify the effects of a table.
40. As a recipient, I want lineage views to include all reachable tables, so that they do not stop at an arbitrary depth.
41. As a recipient, I want lineage filters unavailable until I select a table, so that their scope is clear.
42. As a recipient, I want a filtered view to refocus when I select another table, so that the filter follows my current selection.
43. As a recipient, I want to return to the complete graph while retaining my selection, so that I can regain context.
44. As a recipient, I want to pan the graph, so that I can move around larger lineage diagrams.
45. As a recipient, I want to zoom with controls and the mouse wheel, so that I can inspect both details and the broader graph.
46. As a recipient, I want to reset the graph to fit, so that I can recover a useful view after navigating.
47. As a recipient, I want an informative empty state when there are no tables, so that an empty dataset is not mistaken for a broken viewer.
48. As a recipient, I want a clear message when the template has not been filled, so that I know why lineage is unavailable.
49. As a recipient, I want a clear error for unusable embedded data, so that a partial graph is not mistaken for complete lineage.
50. As a maintainer, I want representative checks across disconnected graphs and multi-hop paths, so that the viewer is suitable for my typical data.
51. As a maintainer, I want to retain the old dbt source until the replacement works, so that the existing application remains available as a reference.
52. As a maintainer, I want a small viewer independent of dbt artifacts and AngularJS, so that the MVP is easier to understand and maintain.

## Implementation Decisions

- Build a new, small viewer in this repository using plain JavaScript and CSS. Do not adapt the dbt Docs application or fabricate dbt manifests and catalogs. Retain the existing dbt source as a reference until the replacement works; ship only the new viewer for the MVP.
- Prefer standard Cytoscape and its Dagre integration over the dbt-specific Cytoscape fork, subject to supporting the agreed interactions. Reuse the existing webpack bundling approach to generate a single self-contained HTML template with scripts, styles, fonts, and other runtime assets inlined. The runtime has no telemetry or network requests.
- The embedded JSON root is an object containing a required `tables` array, which may be empty. Each record requires a string `name` and an array of string `inputs`; `description` is an optional string and may be empty. Extra fields are ignored.
- Names are opaque, exact, and case-sensitive. Blank names and names with leading or trailing whitespace are invalid; internal spaces are allowed. Four-part names are supported but not required. Duplicate table records are invalid, while repeated input references produce one edge.
- An input creates an edge from the input table to the table listing it. A referenced input without its own record becomes an undocumented placeholder with unknown inputs and description. An explicit empty input array means no known inputs. Cycles, including self-dependencies, are invalid.
- The data project owns full validation and production injection using Python 3.12. Missing required fields, null contract fields, wrong types, malformed JSON, duplicate table records, and cycles fail generation with a useful error. A failed validation or injection must leave any existing output unchanged.
- The template exposes exactly one marker, `__LINEAGE_DATA_JSON__`, inside an `application/json` script element with ID `lineage-data`. The data project verifies the marker occurs exactly once and safely serializes JSON before injection, escaping `<` as `\u003c` so data cannot prematurely close the script element. This repository need not supply the production Python step.
- The viewer reads the embedded JSON directly and builds the graph and its table details. Missing or unusable embedded data produces a clear message rather than a silently partial graph. Render descriptions as plain text.
- Use the selected immersive-canvas prototype direction: a collapsible searchable table list overlays the graph, and a bottom inspector shows the selected table's full name, description, direct inputs, and direct downstream tables. Related table names are selectable; prompt when nothing is selected.
- Initially fit the complete graph with no selection. Selecting a graph node displays details without filtering or changing the viewport. Search matches full names case-insensitively; selecting a result centers it.
- Provide All, Connected, Upstream, and Downstream views. The latter three require a selection and show all transitively reachable tables in the selected direction or both directions. While filtered, selecting another table refocuses and fits the filtered graph. All restores and fits the complete graph while retaining the selection.
- Support drag-to-pan, zoom controls, wheel zoom, and reset-to-fit. Show an empty state for an empty dataset.
- A maintainer manually copies template updates into the separate data project. Viewers open the injected HTML directly without Node.js, a server, or internet access.

## Testing Decisions

- Good tests assert observable behavior through the highest practical seam rather than internal implementation details. Exercise the built, JSON-injected HTML and its visible behavior; use focused graph-data tests where they make edge cases easier to verify.
- Add repeatable automated checks for the viewer's data handling and built template: edge direction, case-sensitive identities, repeated inputs, undocumented placeholders, empty data, and clear handling of unusable embedded data. Existing Jest graph traversal and selector integration tests provide prior art for representative lineage fixtures.
- Check that the generated template is self-contained, contains the injection marker exactly once, and displays a clear message before injection. Use a representative injected file to verify descriptions containing quotes, Unicode, and `</script>` display as plain text without executing markup.
- Walk through the actual injected file directly via `file://` in current Safari on macOS with networking disabled; confirm that it works and makes no external requests. Exercise search, selection, related-table navigation, graph direction, all lineage views, return to All, pan, zoom, reset, placeholders, and the empty state.
- Exercise approximately 200 tables across several disconnected graphs, including paths of four input-to-output edges. There is no strict timing target and no four-hop traversal limit.
- Edge on Windows is an intended target but is not tested or a release gate for the MVP. The separate data project tests its own Python validator and injector, including invalid data and cycles.

## Out of Scope

- Parsing SQL or generating lineage JSON.
- Column-level lineage, graph image export, and editing data in the viewer.
- The data project's production Python validation and injection implementation.
- Additional bells and whistles, automated template synchronization, and a performance target.

## Further Notes

The build produces `dist/lineage-viewer.html`; the data project chooses the final injected file's location. The selected prototype is variant C on the local `prototype/offline-lineage-viewer` branch; it uses fixed sample data and is a design reference, not the implementation.

The detailed decisions are recorded in the [wayfinding map](map.md).

Implementation is on `integration/offline-lineage-viewer`. The user deferred the offline Safari capability check; it remains unverified.
