# Choose the viewer architecture

Type: grilling
Status: resolved
Blocked by: 01, 02, 03

## Question

Given the agreed data contract, user experience, and generation workflow, should the MVP adapt dbt Docs or build a smaller viewer using its graph libraries? Compare the work and trade-offs, including dbt coupling, offline bundling, maintainability, and retaining the required interactions, then choose the implementation boundary.

Inputs: [Define the lineage data contract](01-lineage-data-contract.md), [Shape the lineage viewer experience](02-viewer-interaction.md), and [Define the HTML generation workflow](03-generation-workflow.md).

## Answer

- Build a small new viewer in this repository with plain JavaScript and CSS, rather than adapting the AngularJS dbt Docs app. Keep the existing dbt source as a reference until the replacement works; only the new viewer is shipped for the MVP.
- Prefer standard Cytoscape and its Dagre integration over the dbt-specific Cytoscape fork, subject to supporting the agreed interactions. Use a left-to-right layout, with inputs on the left.
- Read the embedded lineage JSON directly and convert tables and inputs into nodes and directed edges, creating placeholders for unlisted inputs. Do not fabricate dbt manifests or catalogs.
- Reuse webpack's bundling approach to produce a self-contained HTML template with all runtime scripts, styles, fonts, and other assets inlined. The final page makes no network requests and includes no telemetry.
- The template contains exactly one injection marker, `__LINEAGE_DATA_JSON__`, inside an `application/json` script element with the ID `lineage-data`. The data project injects JSON as described in [Define the HTML generation workflow](03-generation-workflow.md).
- Render descriptions as plain text. Show a clear error for missing or unusable embedded data rather than silently presenting a partial graph; full input validation remains the data project's responsibility.
