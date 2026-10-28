---
type: object
name: Factoid
code_name: FactoidRow, IndexedDB store `factoids`
universe: live
cluster: storage
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/lib/storage.js, chrome-extension/shared/types.js]
---

# Factoid

A small fact about a contact (`key`, `value`, `source`) stored in its own table keyed by Contact ID, separate from the contact.

## Why this shape

Separation lets facts be exported/imported and re-applied to a clean contact import without carrying the contact's
name, email or URLs (ADR 0001/0002). `Contact.factoids` exists only in memory (`shared/types.js`).

## Shape

- Store `factoids`, keyPath `id`, index `byContactId` on `contactId`, non-unique — `lib/storage.js:33-34`.
- Row: `id, contactId, key, value, source?` (`shared/types.js` `FactoidRow`).
- `saveFactoidsForContact(contactId, items)` **replaces all** rows for that contact: deletes by index, then puts the
  new rows; fills `id` (UUID) and `contactId` — `lib/storage.js` `saveFactoidsForContact`.
- Reads: `getFactoidsByContactId`, `getAllFactoids`.
- `value` is free text: nothing stops PII in it.

## Connected to

- joins: `contacts.id` via `contactId` (no foreign-key enforcement).
- looks like but is not: `Contact.factoids` (memory only).

## If you change this

**Hits:** Ask AI context building (`background/sw.js:258`), focused-contact factoid save (`sw.js:532`), the contacts
page edit/restore paths (`pages/contacts.js:715-785`), CSV export/import (`lib/network-contact-csv.js:131,156,335,484,546-556`),
merge/undo (must read all effective IDs), DB version (I10).
**Does not hit:** `conversations` and `syncState` stores; `lib/factoid-merge.js` is the merge *policy* for incoming
facts, not storage.

## Surfaces

Service worker, contacts page, CSV import/export, Ask AI. Humans via the contacts page.

## See

`chrome-extension/lib/storage.js`.
