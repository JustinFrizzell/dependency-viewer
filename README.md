# Dependency viewer

Build a standalone HTML viewer for exploring dependencies between entities, including data lineage, without dbt artifacts.

## Build the HTML viewer

Use Node.js 18 or newer:

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

## License

This project is licensed under the [Apache License 2.0](LICENSE). It originated from [dbt Docs](https://github.com/dbt-labs/dbt-docs); a former CI sample was derived from [jaffle_shop](https://github.com/dbt-labs/jaffle_shop). The standalone viewer includes third-party software; its license notices are in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) and embedded in the generated HTML. Update those notices when bundled dependencies change.
