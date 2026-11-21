# Shape the lineage viewer experience

Type: prototype
Status: resolved

## Question

What should the simplified dbt Docs-like MVP look like and how should its graph, search, table details, and upstream/downstream navigation behave together? Produce a cheap prototype to discuss, including initial view, selection, and how a user returns to the broader graph.

## Prototype

The three-layout prototype is preserved on local branch `prototype/offline-lineage-viewer`, at `src/lineage-viewer-prototype.html` (commit `d2700f9565b6f60ed5abacad7d7f2f1923577d33`). Variant C was selected; the prototype uses fixed sample data and is not the implementation.

## Answer

- Use the immersive-canvas layout: a collapsible searchable table list overlays the graph, and a bottom inspector shows the selected table.
- Initially fit the complete graph to the canvas with no selection. Selecting a graph node shows its details without filtering or changing the viewport.
- The inspector shows the full table name, description, direct inputs, and direct downstream tables. Related table names are selectable. With no selection, it prompts the user to select a table.
- Distinguish undocumented input placeholders in the graph and inspector; show that their description and own inputs are unknown.
- Search full table names case-insensitively. Selecting a search result selects and centers that table; identity matching in the data remains case-sensitive.
- Provide All, Connected, Upstream, and Downstream views. The latter three require a selection and show all transitively reachable tables in the selected direction or both directions. While filtered, selecting another table refocuses and fits the filtered graph.
- All restores and fits the complete graph while retaining the selection. Support drag-to-pan, zoom controls, wheel zoom, and reset-to-fit. Show an empty state for an empty dataset.
- Prefer a smaller standalone viewer rather than retaining the full dbt Docs site; architecture is decided separately.
