# Offline dependency viewer

Use Node.js 24 or newer to build and check the viewer:

```sh
npm ci
npm run build:dependency
npm run test:dependency
npm run typecheck
```

The build writes `dist/dependency-viewer.html`, with scripts and styles embedded. Open it directly with `file://`, without a server or network, then choose a JSON file or paste JSON and select **Open pasted JSON**. The Document is read locally in the browser and is not retained after a refresh. Opening a valid Document replaces the graph and resets transient view state, including when selecting the same file again. The file toolbar stays open when there are no entities and collapses when a graph is loaded. Use **File** beside **Downstream** to reopen the toolbar. Invalid or unreadable input shows an error without changing the open Document. Expand **JSON format and example** for format guidance and a copyable example.

Expand **Opened Document** to edit the JSON and apply or discard the draft. Invalid drafts cannot replace the Document or be copied or downloaded. Apply is one undoable change; **Undo** and **Redo** operate within the current session, and opening another Document resets history. An unapplied draft must be applied or discarded before other Document edits. Unknown properties and repeated dependency entries are retained; undocumented graph nodes are not added as Entity records. Whitespace may change. The viewer rejects duplicate object keys and numbers that cannot round-trip accurately; store such numbers as strings if needed.

Entity, Direct dependency, new Entity, and property form drafts must also be applied or discarded before copying, downloading, undoing, or making conflicting Document edits. Use the form's **Discard** button to abandon a draft. Entity details cannot change selection while an Entity or Direct dependency draft is pending; reopen the details to resolve it. Drafts count as unsaved work and are protected by replacement and leave warnings.

Expand **Add Entity** to enter a name and optional description, then select **Add Entity**. Names must be nonblank, have no surrounding whitespace, and be unique among documented Entities; case matters. Adding a name already shown as an undocumented dependency creates its Entity record. The new Entity starts without dependencies, is selected in the details, and can be undone or redone. Apply or discard an unapplied JSON draft first.

Expand **Edit Entity properties** to select a documented Entity and add, change, or remove an additional property. Enter its value as JSON: for example, `"text"`, `42`, `false`, `null`, `["tag"]`, or `{"key":"value"}`. Choose an existing property to change or remove it; names including empty strings are allowed, but `name`, `description`, and `dependencies` cannot be changed here. Apply or discard a property draft before downloading, using undo/redo, or making other Document edits. Apply or discard an unapplied JSON draft before changing properties. Each applied property change is undoable.

Select an Entity to edit its name or, for a documented Entity, its description in **Entity details**. Apply the changes to update every reference; the new name must not belong to another documented or undocumented Entity. Renaming an undocumented Entity changes references without creating a record. **Remove Entity** asks for confirmation; when a documented Entity is referenced, choose whether to retain those references as undocumented or remove them too. Removing an undocumented Entity removes all its references. Cancel leaves the Document unchanged. Apply or discard an unapplied JSON draft before editing or removing.

Select a documented Entity to add or remove its **Direct dependencies** in Entity details. Enter an exact, case-sensitive name; a missing Entity appears as undocumented without creating a record. Duplicate dependencies and cycles are rejected. Existing repeated entries remain in JSON until that relationship is removed, which removes all its repeated entries. Edits are undoable and require an unapplied JSON draft to be applied or discarded first.

Copying does not mark changes saved. Downloading marks the current Document saved when the browser starts the download; it cannot guarantee the destination or that the file was stored. Undoing back to the last downloaded state clears the unsaved indicator. The viewer warns before replacing unsaved work or leaving the page, subject to browser restrictions. Neither Documents nor drafts are stored automatically. If clipboard access is unavailable, select and copy the displayed JSON manually.

The left-to-right Dagre layout uses rounded orthogonal relationships with marching-ant dashes. Drag the canvas to pan; use the wheel or zoom buttons to zoom and **Reset to fit** to fit the current view. Use **Pause** to stop the animation; reduced-motion preferences disable it automatically and it also stops while the page is hidden. Select a node to inspect its description and direct relationships, then select a related entity to navigate to its details. Use the collapsible **Entities** list to search full names case-insensitively; selecting a result opens its details and centers it on the canvas. Dashed amber nodes are undocumented dependencies and are also searchable.

After selecting an entity, use **Upstream**, **Downstream**, or **Connected** to show its transitive dependencies, entities that depend on it, or both. Selecting another entity while filtered refocuses and fits the view. Search selections also center the entity, zooming out further when needed to keep its filtered graph visible. **All** restores and fits the complete graph without clearing the selection.

Use **Filter entity names** beside the dependency views to show only entities whose full names contain the entered text, ignoring case and surrounding whitespace. It filters the current view and hides relationships to hidden entities; the graph fits the remaining entities as you type. Switching views keeps the filter, while clearing it restores the current view. A hidden selected entity remains the view's anchor. Selecting a nonmatching entity from the Entities list or details panel clears the filter. The filter starts empty on reload.

Use **Settings** in **Opened Document**, or expand **Settings** on the graph, to colour entities whose full names contain a rule's text, ignoring case. The first matching rule wins; use the arrows to change priority. Bronze, silver, and gold are enabled by default, with three more colours available. Blank rules are ignored. Toggle colouring off or use **Reset** to restore the default rules and order. Changes are undoable Document edits and appear in copied or downloaded JSON; apply or discard a JSON draft first. Undocumented and selection borders remain visible. Selection, filters, dependency view and dragged positions are not saved.

Non-default colour settings use `settings.colours`: `enabled` (boolean), `order` (the colour names in priority order), and `texts` (changed match text keyed by colour name). Omitted values use current defaults, and reset removes colour overrides. Other `settings` properties are preserved. If `settings` or `settings.colours` contains incompatible existing data, the viewer preserves it, explains the conflict, and disables colour editing until the JSON is resolved.

Hovering over a node shows its name, description, direct relationships, and additional properties as text. Select a node or an Entity in the keyboard-accessible list to see the same information in **Entity details**; touch users can tap a node. **Graph presentation** in Settings offers compact nodes and a toggle for hover tooltips. These changes are undoable Document edits and require any JSON draft to be applied or discarded first. Non-default values use `settings.appearance.compact` and `settings.tooltips.enabled`; omitted values use current defaults. **Reset presentation** removes these overrides. Incompatible values at either settings location are preserved and explained, and presentation controls are disabled until the conflict is resolved. Node positions are never saved; the graph is laid out automatically on reopening.

Collapse **Entity details** at the bottom to give the graph more room; expand it again to see the current selection.

Use **Export** to download a PNG of the entire current filtered graph, including nodes outside the viewport. The image preserves graph colours and selection highlighting on a white background, with a margin around the graph. Choose 1×, 2×, or 4× resolution; the menu shows the resulting dimensions, including the margin. Images are limited to 8,192 pixels per side and 32 million pixels in total. If the image is too large, choose a lower resolution or narrow the graph.

## Data format

The root object has a required `entities` array (which may be empty). Each entity has a required string `name` and array of string `dependencies`, and an optional string `description`. An entity can represent anything, including a table, process, person, or place; all are treated alike. Names are exact and case-sensitive, must not be blank or have leading/trailing whitespace, and need not have any particular number of parts. Entity records must be unique and the dependency graph must be acyclic. Dependencies refer to upstream entities; each edge points from a dependency to the entity that depends on it. Repeated dependencies yield one edge. A dependency without a record is shown as an undocumented entity with unknown description and dependencies. Additional entity properties appear beneath the description, with each original key above its value. Strings are shown as plain text; other values use compact JSON. Properties follow JavaScript `Object.entries` order, including its ordering of numeric keys.

The former `tables` and `inputs` fields and marker-based injection are no longer supported.

For example, save this as a JSON file to produce a graph from `raw.orders` to `mart.orders`:

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

The automated checks load representative JSON files, including 200 documented entities in disconnected five-entity chains, a repeated undocumented dependency, case-sensitive names, and a description containing quotes, Unicode, and HTML-like text. To regenerate the same files for a manual check:

```sh
npm run build:dependency
node --import tsx test/acceptance-fixtures.ts
```

On an isolated macOS test environment where networking can safely be disabled, open `dist/dependency-viewer.html` directly in current Safari via `file://`, and select `dist/dependency-acceptance.json`. Use Safari's Network inspector while opening and exercising the file to check for external requests. Do not disable shared network services or change another user's settings.

- Search `db.raw` and verify `DB.Raw` and `db.raw` are separate results; select each and inspect its details.
- Search and select `table_4`; verify the quoted Unicode description including `</script>` is visible as text, the repeated `missing` dependency appears once, and `table_3` is its other dependency. Select `missing` and verify its undocumented, unknown details; navigate back to `table_4`.
- Inspect the left-to-right edges from `DB.Raw` through `table_4`. Select **Upstream**, **Downstream**, and **Connected**, including a four-edge path; change the selection while filtered. Select **All** and verify the full graph returns with the selection retained.
- Verify the edges use rounded orthogonal paths with moving dashes. Pause and resume edge motion, then confirm it remains disabled when the browser requests reduced motion.
- Drag to pan, zoom using the wheel and buttons, and reset to fit. Collapse and reopen the entity list.
- Open **Settings**, edit and reorder colour rules, download the Document and reopen the downloaded file. Verify colours and priority return, then reset and verify the overrides are removed.
- Hover a node and verify the tooltip details; use the keyboard to select the same Entity from the list and verify the details are available without hover. Change presentation settings, download and reopen, then reset them.
- Select `dist/dependency-acceptance-empty.json` and verify the empty state. Refresh and verify that the viewer asks for a file again.

Edge on Windows is not an MVP release gate.
