# Issue tracker: GitHub Issues

GitHub Issues in `JustinFrizzell/dependency-viewer` are the canonical tracker.
Specs, maps, prototypes, and other planning records may remain in `.scratch/`.

## Conventions

- Keep each effort's `map.md` and `spec.md` in its own `.scratch/<effort>/` directory; do not treat artifacts from another effort as active unless the current task explicitly references them.
- Treat `.scratch/offline-lineage-viewer/` as historical prototype context. A new project derived from it gets a new effort directory and its own map and spec.
- Check for duplicates before creating an issue. Use `gh` from the repository checkout and verify authentication with `gh auth status`.
- Create and update work items in GitHub Issues; don't add new issue files under `.scratch`.
- Preserve prerequisite relationships as links between GitHub issues and retain useful acceptance criteria and status notes from local sources.
- When migrating any pre-existing local issue files, keep each until it has been imported and linked to its GitHub issue.
- See `triage-labels.md` for the canonical role labels.

## When a skill says "publish to the issue tracker"

Create a GitHub Issue in `JustinFrizzell/dependency-viewer`.

## When a skill says "fetch the relevant ticket"

Use `gh issue view <number> --repo JustinFrizzell/dependency-viewer`. The user may pass the issue number or URL directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** remains a local file; each **child ticket** is a GitHub Issue.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: create a GitHub Issue containing the question and relevant context. Keep the issue URL or number in the map.
- **Blocking**: link prerequisite issues in the issue body. A ticket is unblocked when all its blockers are closed.
- **Frontier**: find open issues whose blockers are closed and which are not already claimed.
- **Claim**: comment on the issue before starting work.
- **Resolve**: record the decision in an issue comment, close the issue, then append a context pointer (gist + issue URL) to the map's Decisions-so-far in `map.md`.
