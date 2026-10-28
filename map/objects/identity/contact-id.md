---
type: object
name: Contact ID
code_name: contactIdFrom* (one per platform processor)
universe: live
cluster: identity
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/lib/contact-id.js, chrome-extension/lib/linkedin-processor.js, chrome-extension/lib/facebook-processor.js, chrome-extension/lib/gmail-processor.js, chrome-extension/lib/whatsapp-processor.js]
---

# Contact ID

The stable key of a Contact, `<platform>:<16 hex chars>`, derived from the person's normalized identifier so a re-import yields the same ID.

## Why this shape

Factoids and conversations are keyed only by this ID (ADR 0002), so a factoid export can be re-applied to a clean
import. Stability is the whole point; privacy is secondary (see below).

## Shape

- LinkedIn: hash of `normalizeLinkedInProfileUrl(url)` — `lib/linkedin-processor.js:45-48`.
- Facebook: hash of normalized profile URL — `lib/facebook-processor.js:23-26`.
- Gmail: hash of lower-cased trimmed email — `lib/gmail-processor.js:28-31`.
- WhatsApp: hash of lower-cased trimmed chat key — `lib/whatsapp-processor.js:28-31`.
- Hash = FNV-1a 64-bit, hex, zero-padded to 16: `hashStringToHex64` and `contactIdFromIdentifier(platform, normalized)` in `lib/contact-id.js` (the four processors call it; before 1.84.5 each had its own copy), one per processor file (same algorithm in the two read; not diffed against the others).
- Empty identifier → `generateId()` random UUID (`shared/types.js`), which is **not** reproducible.

## Connected to

- owns: nothing. owned by: `Contact.id` (store `contacts`, keyPath `id`, `lib/storage.js:21`).
- joins: `FactoidRow.contactId`, `Conversation.contactId`.
- looks like but is not: a merged contact's absorbed IDs, kept in `platforms.*.id` — see `lib/contact-effective-ids.js`.

## If you change this

**Hits:** every stored factoid and conversation for that platform (orphaned); factoid export/import round-trips;
merge/undo restore (`platforms.*.id`); dedup comparisons by ID.
**Does not hit:** display names, `recentAccesses`, sync state (`syncState` is a single row `current`).

Privacy note: FNV-1a is not cryptographic and the input space (emails, public URLs) is small, so an ID is
guessable/confirmable, not anonymous. The code comment calling it "collision-resistant" is about collisions only.
Recorded in ADR 0002.

## Surfaces

Written by the four processors during import; read everywhere a contact is looked up.

## See

`chrome-extension/lib/linkedin-processor.js`, `docs/adr/0002-deterministic-contact-id-and-factoid-keying.md`.
