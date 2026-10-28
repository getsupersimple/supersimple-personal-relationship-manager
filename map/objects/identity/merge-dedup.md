---
type: object
name: Merge and dedup
code_name: `isSamePerson`, `mergeContacts`, `deduplicateAndMerge`, `storage.mergeContactInto`
universe: live
cluster: identity
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/lib/dedup.js, chrome-extension/lib/storage.js, chrome-extension/pages/contacts.js]
---

# Merge and dedup

The rules that decide two contact rows are one person, and the function that folds one into the other.

## Why this shape

Imports from four networks overlap; a person must appear once, but merging must stay reversible, so the absorbed identity is kept inside the kept contact's platform blob.

## Shape

- Same person if: equal IDs, or an incoming ID already absorbed by the kept contact; WhatsApp-list rows only on the same `chatKey`; same Gmail email; same Facebook URL key; same WhatsApp `chatKey`; or equal display name with equal non-empty LinkedIn company, **or no company on either side** (`lib/dedup.js:63-125`).
- `mergeContacts(existing, incoming)` keeps `existing.id`, spreads each incoming platform blob over the existing one (so the **incoming `id` wins** and the displaced one moves to `absorbedIds`), unions factoids by `key:value`, merges `recentAccesses` (`:129-232`).
- `deduplicateAndMerge` returns `idMapping` of absorbed → kept (`:234-248`).
- Manual merge: `storage.mergeContactInto` merges, stamps `id`/`name` of the absorbed contact onto each merged-in blob, saves, deletes the absorbed row (`lib/storage.js:373-388`); UI at `pages/contacts.js:850-880`. Factoids under the absorbed ID are **not moved**.

## Connected to

- joins: effective IDs (the read side), Contact ID. looks like but is not: a delete — the absorbed row is gone but its ID lives on in a blob.

## If you change this

**Hits:** every importer (they call `deduplicateAndMerge`), manual merge, undo, factoid and conversation lookup, `harness/tests/identity.test.mjs`.
**Does not hit:** Contact ID derivation (merge never re-hashes); the CSV format.

**Fixed in 1.83.4 (issue 05):** when both sides had platform P, the incoming blob's `id` used to replace the kept blob's `id`, dropping the kept identity from `getEffectiveContactIds`. Now `mergeContacts` (`lib/dedup.js`, loop before the factoid merge) records every displaced identity in `platforms.P.absorbedIds`, and `storage.mergeContactInto` keeps the `id` its stamping overwrites. `isSamePerson` also treats an incoming contact whose ID is in the kept contact's effective IDs as the same person, so a re-sync does not resurrect an absorbed row. Existing data needs no migration (`absorbedIds` is optional); contacts already damaged by the old bug cannot be repaired automatically. Still open: stamping gives every absorbed blob the same `id` (`merge.id`), so undoing two platforms of one absorbed contact yields two rows with the same ID; undo of a blob restores its `absorbedIds` onto the restored row.

## Surfaces

Processors, contacts page.

## See

`chrome-extension/lib/dedup.js`
