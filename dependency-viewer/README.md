# Offline dependency viewer

Use Node.js 18 or newer to build and check the template:

```sh
npm ci
npm run build:dependency
npm run test:dependency
```

The build writes `dist/dependency-viewer.html` and `dist/dependency-demo.html`, which embeds the data from `dependency-viewer/demo_data.json`. Their scripts and styles are embedded; recipients can open the demo or an injected copy of the template directly with `file://`, without a server or network. The left-to-right Dagre layout uses rounded orthogonal relationships with marching-ant dashes. Drag the canvas to pan; use the wheel or zoom buttons to zoom and **Reset to fit** to fit the current view. Use **Pause** to stop the animation; reduced-motion preferences disable it automatically and it also stops while the page is hidden. Select a node to inspect its description and direct relationships, then select a related entity to navigate to its details. Use the collapsible **Entities** list to search full names case-insensitively; selecting a result opens its details and centers it on the canvas. Dashed amber nodes are undocumented dependencies and are also searchable.

After selecting an entity, use **Upstream**, **Downstream**, or **Connected** to show its transitive dependencies, entities that depend on it, or both. Selecting another entity while filtered refocuses and fits the view. Search selections also center the entity, zooming out further when needed to keep its filtered graph visible. **All** restores and fits the complete graph without clearing the selection.

Use **Filter entity names** beside the dependency views to show only entities whose full names contain the entered text, ignoring case and surrounding whitespace. It filters the current view and hides relationships to hidden entities; the graph fits the remaining entities as you type. Switching views keeps the filter, while clearing it restores the current view. A hidden selected entity remains the view's anchor. Selecting a nonmatching entity from the Entities list or details panel clears the filter. The filter starts empty on reload.

Use **Colours** to colour entities whose full names contain a rule's text, ignoring case. The first matching rule wins; use the arrows to change priority. Bronze, silver, and gold are enabled by default, with three more colours available. Blank rules are ignored. Toggle colouring off or use **Reset** to restore the default rules and order. Changes last until the page is reloaded; undocumented and selection borders remain visible.

Collapse **Entity details** at the bottom to give the graph more room; expand it again to see the current selection.

## Data injection

The template has exactly one `__DEPENDENCY_DATA_JSON__` marker, in the `application/json` script element with ID `dependency-data`. Replace that marker with a JSON object after validating it and verifying the marker occurs exactly once. Serialize JSON safely for HTML by escaping every `<` as `\u003c`; this prevents values such as `</script>` from ending the script element. The separate data project is responsible for validation, safe injection, and preserving its previous output on failure. An unfilled template reports that no data has been embedded.

The root object has a required `entities` array (which may be empty). Each entity has a required string `name` and array of string `dependencies`, and an optional string `description`. An entity can represent anything, including a table, process, person, or place; all are treated alike. Names are exact and case-sensitive, must not be blank or have leading/trailing whitespace, and need not have any particular number of parts. Entity records must be unique and the dependency graph must be acyclic. Dependencies refer to upstream entities; each edge points from a dependency to the entity that depends on it. Repeated dependencies yield one edge. A dependency without a record is shown as an undocumented entity with unknown description and dependencies. Additional entity properties appear beneath the description, with each original key above its value. Strings are shown as plain text; other values use compact JSON. Properties follow JavaScript `Object.entries` order, including its ordering of numeric keys.

The former `tables` and `inputs` fields and the old template marker and filenames are no longer supported. Integrations must use the names above.

For example, after safe serialization and injection, this dataset produces a graph from `raw.orders` to `mart.orders`:

```json
{
  "entities": [
    {
      "name": "raw.orders",
      "dependencies": []
    },
    {
      "name": "mart.orders",
      "description": "Orders",
      "dependencies": ["raw.orders"]
    }
  ]
}
```

## Acceptance walkthrough

The automated checks build and inject representative HTML files, including 200 documented entities in disconnected five-entity chains, a repeated undocumented dependency, case-sensitive names, and a description containing quotes, Unicode, and HTML-like text. To regenerate the same files for a manual check:

```sh
npm run build:dependency
node dependency-viewer/acceptance-fixtures.cjs
```

These are test fixtures, not a production validator or injector. On an isolated macOS test environment where networking can safely be disabled, open `dist/dependency-acceptance.html` directly in current Safari via `file://`. Use Safari's Network inspector while opening and exercising the file to check for external requests. Do not disable shared network services or change another user's settings.

- Search `db.raw` and verify `DB.Raw` and `db.raw` are separate results; select each and inspect its details.
- Search and select `table_4`; verify the quoted Unicode description including `</script>` is visible as text, the repeated `missing` dependency appears once, and `table_3` is its other dependency. Select `missing` and verify its undocumented, unknown details; navigate back to `table_4`.
- Inspect the left-to-right edges from `DB.Raw` through `table_4`. Select **Upstream**, **Downstream**, and **Connected**, including a four-edge path; change the selection while filtered. Select **All** and verify the full graph returns with the selection retained.
- Verify the edges use rounded orthogonal paths with moving dashes. Pause and resume edge motion, then confirm it remains disabled when the browser requests reduced motion.
- Drag to pan, zoom using the wheel and buttons, and reset to fit. Collapse and reopen the entity list.
- Open `dist/dependency-acceptance-empty.html` directly and verify the empty state. Open the unmodified `dist/dependency-viewer.html` and verify the missing-data message.

These checks do not substitute for the data project's production Python validation and injection tests. Edge on Windows is not an MVP release gate.
