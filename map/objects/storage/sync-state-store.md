---
type: object
name: Sync state
code_name: IndexedDB store `syncState`, row `current`
universe: live
cluster: storage
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/lib/storage.js, chrome-extension/background/sw.js]
---

# Sync state

A single row recording when sync last ran and per-platform success or error.

## Why this shape

The popup and contacts page show last-sync status without asking the platforms.

## Shape

- keyPath `id`, one row with id `current` — `lib/storage.js:29,:489-:500`; `getSyncState` strips the id.
- Written at the end of `handleSync` (`sw.js:3016-3022`) and seeded empty on install (`sw.js:144-149`).
- `GET_SYNC_STATE` rewrites one legacy LinkedIn error string on read (`sw.js:171-180`).

## Connected to

- joins: nothing; it names platforms by string.

## If you change this

**Hits:** popup status line, contacts page, the sync result returned to callers.
**Does not hit:** contacts, conversations, factoids.

## Surfaces

Popup, contacts page.

## See

`chrome-extension/lib/storage.js`, `chrome-extension/background/sw.js:2898`
