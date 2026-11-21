# 06: Tidy obsolete dbt application files

**What to build:** After the replacement viewer is working, a maintainer can work in a repository focused on the new viewer without unused dbt application code or dependencies.

**Blocked by:** [05: Verify the complete offline viewer](05-verify-complete-offline-viewer.md).

**Status:** resolved

**Spec:** [Offline lineage viewer MVP](../../offline-lineage-viewer/spec.md).

- [x] Identify and remove dbt-specific application files and dependencies that are no longer used by the new viewer, its build, or its checks.
- [x] Update affected documentation, build configuration, and checks so the standalone viewer remains buildable and usable.
- [x] Preserve applicable license and attribution notices and retain the local planning and decision records.
- [ ] Re-run the relevant build and checks and confirm the generated standalone viewer still works offline.

## Comments

Implemented on `integration/offline-lineage-viewer` in `d4ff0fa`; `npm ci` and `npm test` passed. The user deferred the offline capability check on 2026-11-20; it has not been performed.
