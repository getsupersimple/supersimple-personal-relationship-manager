---
type: process
name: Release
universe: live
cluster: processes
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [AGENTS.md, update-version.py, package.json, CHANGELOG.md]
consumes: [[[version-bump]], [[build-pipeline]]]
produces: [[[version-bump]]]
---

# Release

**Input →** a code change to the extension. **Movement →** verify, bump, build, changelog, commit, tag. **Output →** a tagged commit and a fresh `dist/`. Never pushed unless asked.

## Steps

1. `npm run verify` (static checks + tests; the tag-exists check in I7 only passes after step 7).
2. `python update-version.py bugfix|minor` rewrites the version in the manifest, popup/contacts/ask-ai HTML, `sw.js`, and prepends to `TASKS.md`.
3. `npm run build` produces `dist/` (Chrome loads from there).
4. Prepend `- **X.Y.Z** (YYYY-MM-DD) — summary` to `CHANGELOG.md`.
5. `git add -A`; `git commit -m "chore: release X.Y.Z"` (or a descriptive message with the version).
6. `git tag -a X.Y.Z -m "X.Y.Z"` (no `v`); do not push.
7. Documentation-only and harness-only changes are not releases: no bump.

Note: step 1 is new (ours); AGENTS.md has not yet been updated to require it. `git add -A` will also stage `node_modules/` changes because it is tracked (issue 04).

## If you change this

**Hits:** `dist/`, all version strings, tags (I7).
**Does not hit:** `release/*.zip` packing (separate, gitignored); nothing reads CHANGELOG at runtime.

## See

`AGENTS.md`, `harness/invariants.md`
