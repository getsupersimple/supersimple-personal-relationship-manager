---
type: object
name: Database open and migration
code_name: `getDB`, `ensureStores`, `migrateLegacyDatabaseIfNeeded`
universe: live
cluster: storage
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/lib/storage.js]
---

# Database open and migration

Opens IndexedDB `prm-contacts` v2 once per context, creating missing stores and copying data over from the old `prm-rolodex` database.

## Why this shape

Several extension contexts (service worker, pages) open the same DB, so creation and the one-time legacy copy must be idempotent.

## Shape

- `DB_NAME`, `LEGACY_DB_NAME`, `DB_VERSION = 2` — `lib/storage.js:9-11`.
- `ensureStores` creates any missing store, including `factoids` + `byContactId` (`:19-37`); it runs on every upgrade.
- Legacy copy: reads all stores of `prm-rolodex`, puts them into `prm-contacts`, deletes the legacy DB (`:44-98`); failure is logged and ignored (`:113-116`).
- Module-level cached handle `db` (`:100`) — one per module instance.
- Pinned by `harness/tests/schema.test.mjs` (I10).

## Connected to

- owns: all four stores. looks like but is not: any schema change that does not bump `DB_VERSION` (no upgrade runs, new stores silently missing).

## If you change this

**Hits:** every read/write path; the schema snapshot test; the build copies `lib/storage.js` into `dist/lib` by name (`package.json`).
**Does not hit:** data shape inside rows (that is `Contact` / `FactoidRow` in `shared/types.js`).

## Surfaces

All extension contexts.

## See

`chrome-extension/lib/storage.js`, `harness/tests/schema.test.mjs`
