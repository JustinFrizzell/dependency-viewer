# Lineage viewer

Build a standalone HTML template for exploring table lineage without dbt artifacts.

## Build the HTML template

Use Node.js 18 or newer:

```sh
npm ci
npm run build
```

The self-contained template is written to `dist/lineage-viewer.html`. It contains the `__LINEAGE_DATA_JSON__` marker and must have lineage JSON injected before it displays a graph. See the [viewer guide](lineage-viewer/README.md) for the data format, safe injection details, and acceptance instructions.

## Run tests

```sh
npm test
```

This builds the template and runs the automated viewer tests.

This project originated from [dbt Docs](https://github.com/dbt-labs/dbt-docs). The repository's [Apache 2.0 license](LICENSE) and historical changelog are retained. The former CI sample was derived from [jaffle_shop](https://github.com/dbt-labs/jaffle_shop); its [license](ci-project/LICENSE) is retained.
