---
type: object
name: Version bump
code_name: `update-version.py`
universe: live
cluster: build
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [update-version.py]
---

# Version bump

Writes one version into the manifest, three HTML footers, the service worker, and `TASKS.md`.

## Why this shape

The version is shown in the UI, so every copy must agree (I7).

## Shape

- Targets: `manifest.json`, `popup/popup.html`, `pages/contacts.html`, `pages/ask-ai.html`, `background/sw.js` (`const VERSION`), and it **prepends to `TASKS.md`** (`update-version.py:16-22,85-98`). Commands `bugfix|minor|major|set`.
- `CHANNEL` (top of the script, currently `alpha`) adds `version_name` (`X.Y.Z-alpha`, shown on chrome://extensions) to the manifest and `vX.Y.Z alpha` to the three footers; the numeric `version` and the git tag stay plain `X.Y.Z`. Set `CHANNEL = ""` for a stable release. Check I7 accepts the suffix.
- It does not touch `CHANGELOG.md` — that is a manual step in AGENTS.md. So archiving `TASKS.md` means editing this script first.

## Connected to

- joins: manifest, release process.

## If you change this

**Hits:** I7, `TASKS.md`.
**Does not hit:** `CHANGELOG.md`, git tags.

## Surfaces

Developer.

## See

`update-version.py`
