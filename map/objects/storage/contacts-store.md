---
type: object
name: Contacts store
code_name: IndexedDB store `contacts`
universe: live
cluster: storage
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/lib/storage.js]
---

# Contacts store

One row per Contact, keyed by Contact ID, holding the contact and its platform profiles (not its factoids).

## Why this shape

Contacts are always read and written as a whole list: every importer loads all contacts, merges, and writes all back.

## Shape

- keyPath `id` — `lib/storage.js:21`.
- `saveContacts(list)` runs `clear()` then `put` of every row in one transaction (`:186-247`); before that it persists each `c.factoids` through `saveFactoidsForContact` and **deletes `factoids` from the caller's object** (`:222-226`).
- Shrink guard: with 10+ stored contacts, a save that would leave fewer than half throws (`:208-216`). An empty list is silently ignored unless `bypassShrinkGuard` (`:188-189`).
- Single-row ops: `saveContact`, `getContact`, `deleteContact`, `mergeContactInto` (`:373`).

## Connected to

- joins: `factoids` and `conversations` by Contact ID. looks like but is not: `Contact.factoids`, which is in-memory only.

## If you change this

**Hits:** every platform processor (`lib/*-processor.js`), the contacts page, Ask AI context building, CSV import. Because writes replace the whole list, anything written between a processor's `getAllContacts` and its `saveContacts` is lost.
**Does not hit:** the `factoids` rows (separate store); `syncState`; the `msgCache_*` entries in `chrome.storage.local`.

## Surfaces

Service worker, contacts page, popup (counts), settings (clear network).

## See

`chrome-extension/lib/storage.js`
