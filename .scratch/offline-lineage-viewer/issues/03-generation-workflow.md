# Define the HTML generation workflow

Type: grilling
Status: resolved

## Question

How should a maintainer in the separate data project supply a JSON dataset and generate or update the standalone HTML? Decide the integration boundary, where the generated file belongs, how build dependencies are supplied, and the expected failure experience without requiring viewers to install anything.

## Answer

- This project uses Node.js and its installed dependencies to build a reusable, self-contained `dist/lineage-viewer.html` template. A maintainer manually copies template updates into the separate data project.
- The template exposes one documented JSON injection point, for example `<script type="application/json" id="lineage-data">__LINEAGE_DATA_JSON__</script>`. The marker must appear exactly once.
- A Python 3.12 step owned by the data project validates its lineage JSON against the agreed contract, checks the marker, safely serializes the data, and injects it. Escape `<` as `\u003c` in the embedded JSON so data cannot prematurely close the script element. This project does not need to supply that Python step.
- The data project chooses the final HTML path. A validation or injection failure reports an error and leaves any existing output unchanged.
- The final file opens directly in a modern desktop browser without Node.js, a server, or network access. An unfilled template displays a clear message that lineage data has not been embedded.
