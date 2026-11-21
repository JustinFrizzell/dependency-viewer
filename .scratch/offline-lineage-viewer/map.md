# Offline lineage viewer MVP

## Destination

An implementation-ready MVP spec for a simplified, offline lineage viewer template into which a separate data project embeds lineage JSON.

## Notes

- Start with the proposed JSON shape: a `tables` array with `name`, `description`, and `inputs` fields.
- This project builds a standalone HTML template; the separate data project injects one dataset. Viewers open the resulting file directly in a modern desktop browser without a server, installation, or network access.
- The MVP needs an interactive graph with pan and zoom, table details and descriptions, search, and upstream and downstream lineage.
- Aim for a simplified dbt Docs-like lineage experience without dbt-specific screens and terminology.
- Prefer a smaller standalone viewer over the full dbt Docs site.
- The expected scale is about 200 tables across disconnected graphs; performance is not a primary concern.
- Handoff: [Offline lineage viewer MVP spec](spec.md).

## Decisions so far

- [Define the lineage data contract](issues/01-lineage-data-contract.md): Use case-sensitive table names and explicit inputs; show missing records as placeholders and reject invalid or cyclic data.
- [Shape the lineage viewer experience](issues/02-viewer-interaction.md): Use an immersive graph canvas with searchable tables, a bottom inspector, and focused lineage views.
- [Define the HTML generation workflow](issues/03-generation-workflow.md): Build a reusable HTML template here; the data project validates and injects JSON using Python.
- [Choose the viewer architecture](issues/04-viewer-architecture.md): Build an independent JavaScript viewer with Cytoscape and Dagre, bundled as a fully offline HTML template.
- [Define MVP acceptance criteria](issues/05-mvp-acceptance.md): Verify the offline Safari experience and representative data, with injection validation owned by the data project.

## Not yet specified

None currently identified.

## Out of scope

- Parsing SQL to produce lineage JSON.
- Column-level lineage, graph image export, and editing data in the viewer.
- Bells and whistles beyond the agreed MVP.
