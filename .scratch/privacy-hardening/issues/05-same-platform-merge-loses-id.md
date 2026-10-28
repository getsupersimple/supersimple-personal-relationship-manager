# Same-platform merge loses the kept contact's platform ID

Status: fixed in 1.83.4 (2026-10-27)

Reproduced: kept `gmail:1` with WhatsApp blob `whatsapp:A` absorbing `whatsapp:B` left effective IDs
`[gmail:1, whatsapp:B]`; factoids under `whatsapp:A` stopped showing.

Fix: displaced IDs are recorded in `platforms.<p>.absorbedIds` (`lib/dedup.js`), `getEffectiveContactIds` reads them,
`storage.mergeContactInto` preserves the `id` it stamps over, and `isSamePerson` matches absorbed IDs.
Migration: none needed (optional field). Contacts damaged before the fix are not repaired; a possible follow-up is
listing factoid rows whose `contactId` matches no contact's effective IDs.

Remaining (not fixed): absorbing a multi-platform contact stamps one `id` on all its blobs, so undoing two of its
platforms yields two rows with the same ID. Undo itself is untested (DOM-bound).
