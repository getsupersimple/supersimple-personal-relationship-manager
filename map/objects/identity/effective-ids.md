---
type: object
name: Effective IDs
code_name: `getEffectiveContactIds`
universe: live
cluster: identity
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/lib/contact-effective-ids.js]
---

# Effective IDs

The list of Contact IDs whose factoids and conversations belong to one displayed contact: its own ID plus every merged-in platform ID.

## Why this shape

Merge keeps rows keyed by the old IDs, so lookups must fan out instead of rewriting stored rows.

## Shape

- 13 lines: `[contact.id]` plus each `platforms.*.id` and `platforms.*.absorbedIds[]` not already present (`lib/contact-effective-ids.js:6-13`). Each ID appears once; order is own ID first.
- Pinned by `harness/tests/identity.test.mjs`.

## Connected to

- joins: `factoids.contactId`, `conversations.contactId`.

## If you change this

**Hits:** contacts-page search and display (`pages/contacts.js:140,625`), Ask AI answer context (`background/sw.js:445-446`), CSV contact exports (`lib/network-contact-csv.js`).
**Does not hit:** storage reads: `getFactoidsByContactId` takes one ID. Callers that pass only `contact.id` miss absorbed facts: Ask AI disambiguation narrowing reads `c.id` only (`sw.js:275,352`), and Ask AI writes newly extracted facts under `focusedContact.id` only (`sw.js:521-532`), so a fact learned about a merged contact lands under the kept ID.

## Surfaces

Contacts page.

## See

`chrome-extension/lib/contact-effective-ids.js`
