---
type: process
name: Merge and undo merge
universe: live
cluster: processes
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/pages/contacts.js, chrome-extension/lib/storage.js, chrome-extension/lib/dedup.js]
consumes: [[[merge-dedup]], [[effective-ids]]]
produces: [[[contacts-store]]]
---

# Merge and undo merge

**Input →** user picks a contact to keep and one to merge in; later may undo one platform. **Movement →** fold platform blobs into the kept contact, delete the other row; undo rebuilds a row from a blob. **Output →** one fewer (or one more) contact row.

## Steps

1. Merge search lists candidates by name tokens (`pages/contacts.js:800-845`); `confirmAndMerge` asks for confirmation (`:850`).
2. `doMerge` → `storage.mergeContactInto(keepId, mergeId)` (`:860`, `lib/storage.js:373`).
3. `mergeContacts(keep, merge)` combines platforms (incoming `id` overwrites the kept blob's `id`), factoids, accesses (`lib/dedup.js:129`).
4. Each merged-in blob is stamped with the absorbed `id` and `name`; the merged contact is saved and the absorbed row deleted (`lib/storage.js:379-387`). Factoids stay under the old ID.
5. Undo (`handleUndoMerge`, `pages/contacts.js:759`): a blob with an `id` becomes a new contact row (`id`, name from the blob, email for Gmail), the blob is removed from the kept contact, both saved (`:760-776`).

Known defects: same-platform merge loses the kept blob's ID (see Merge and dedup card, issue 05). Undo is DOM-bound and has no test. An undone contact gets no factoids copied — they remain under the ID they already had, which is the restored ID.

## If you change this

**Hits:** contact list, effective IDs, factoid visibility, `harness/tests/identity.test.mjs`.
**Does not hit:** Contact ID derivation; platform syncs (a later sync may re-create or re-merge the absorbed person by deterministic ID).

## See

`chrome-extension/lib/storage.js:373`
