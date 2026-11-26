## Agent skills

### Issue tracker

GitHub Issues in `JustinFrizzell/dependency-viewer` are canonical. Use `gh issue` for work items, link prerequisites to their GitHub issues. Specs, maps, and decision records may remain local Markdown. See `docs/agents/issue-tracker.md` for workspace-specific details.

### Planning artifacts

Keep each effort's `map.md` and `spec.md` scoped to its own `.scratch/<effort>/` directory. Treat them as active only when the current task explicitly names that effort or its issue; never assume one effort's artifacts apply to another. The existing `.scratch/offline-lineage-viewer/` files are prototype history and may be used as reference for a new project, not as its active map or spec.

### Triage labels

Triage uses the default five-role vocabulary. If present, see `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context layout. If present, see `docs/agents/domain.md`.
