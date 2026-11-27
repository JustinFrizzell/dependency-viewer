# Dependency viewer

Build a standalone HTML viewer for exploring dependencies between entities, including data lineage, without dbt artifacts.

## Build the HTML viewer

Use Node.js 24 or newer:

```sh
npm ci
npm run build
```

The build writes a self-contained viewer to `dist/dependency-viewer.html`. Open it directly and choose a JSON file or paste JSON. Edit, undo, redo, copy, or download the opened Document from **Opened Document**. The viewer includes format guidance and a copyable example. See the [viewer guide](VIEWER_GUIDE.md) for the data format and acceptance instructions.

## Run tests

```sh
npm test
npm run typecheck
```

This builds the viewer and runs the automated viewer tests.

For real-browser offline checks, install Playwright's Chromium into an isolated project directory and run:

```sh
mkdir -p .tmp
export TMPDIR="$PWD/.tmp" PLAYWRIGHT_BROWSERS_PATH="$PWD/.tmp/browsers"
npx playwright install chromium
npm run test:browser
```

The browser suite opens the built HTML via `file://` in a fresh headless profile with networking disabled. It exercises paste, upload, editing, validation, warnings, download/reload, keyboard access, tooltips, graph views and PNG export; no server or shared browser profile is used. `.tmp/` can be removed after testing.

For supplementary Playwright WebKit coverage, install its browser with `npx playwright install webkit` and run `BROWSER=webkit npm run test:browser`. WebKit's offline emulation cannot navigate `file://`, so the suite instead blocks and fails on external requests. Playwright does not provide portable touch-drag input: WebKit tests touch inspection and mouse dragging, while Chromium additionally exercises touch dragging. WebKit is not a substitute for testing current Safari as described in the viewer guide.

## License

This project is licensed under the [Apache License 2.0](LICENSE). It originated from [dbt Docs](https://github.com/dbt-labs/dbt-docs); a former CI sample was derived from [jaffle_shop](https://github.com/dbt-labs/jaffle_shop). The standalone viewer includes third-party software; its license notices are in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) and embedded in the generated HTML. Update those notices when bundled dependencies change.
