---
type: object
name: Build pipeline
code_name: `npm run build`, `vite.*.config.js`
universe: live
cluster: build
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [package.json, vite.extension.config.js, vite.offscreen.config.js]
---

# Build pipeline

Two Vite builds plus a hand-listed copy of `lib` files into `dist/`, which Chrome loads.

## Why this shape

Pages are copied as plain files (not bundled), so every `lib` file they import must be copied by name.

## Shape

- `build` = `build:offscreen` (bundles WebLLM into `offscreen/offscreen.js`) then `build:extension` (crxjs for manifest + service worker, `cp -r pages`, `cp` of 15 named `lib` files) (`package.json` scripts).
- Guard: check I6 fails when a page reaches a `lib` file not in that list.
- `dist/` and `release/` are build products; `release/*.pem` is a signing key (gitignored).

## Connected to

- joins: manifest, version bump.

## If you change this

**Hits:** adding a `lib` file used by pages (extend the cp list or I6 fails).
**Does not hit:** source behaviour.

## Surfaces

Developer, Chrome.

## See

`package.json`
