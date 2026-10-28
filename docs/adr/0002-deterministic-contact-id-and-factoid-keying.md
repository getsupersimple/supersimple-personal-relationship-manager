# 0002 — Deterministic Contact ID; factoids keyed by ID only

Status: accepted (matches code; see citations)

## Decision

A Contact ID is `<platform>:<hash(normalized identifier)>` — LinkedIn/Facebook profile URL, Gmail address, WhatsApp
chat key — so re-importing the same person yields the same ID (`lib/linkedin-processor.js:47`,
`lib/gmail-processor.js:30`, `lib/facebook-processor.js:25`, `lib/whatsapp-processor.js:30`). If there is
nothing to hash, a random UUID is used (`shared/types.js` `generateId`).

Factoids live in their own store with index `byContactId` (`lib/storage.js:33`) and hold `contactId`, `key`,
`value`, `source` — no name, email or URL. Export/import of factoids therefore re-attaches to a clean import by ID.

## Consequences

- Changing any normalizer or hash **orphans every factoid** for that platform. Treat as a data migration.
- Merging keeps absorbed IDs in `platforms.*.id`; factoid reads must use all effective IDs
  (`lib/contact-effective-ids.js`).
- The hash and id format live in one module, `lib/contact-id.js` (1.84.5); before that each platform processor had
  its own copy. `harness/tests/identity.test.mjs` pins the output per platform.

## Known tension

The hash is FNV-1a 64-bit (`lib/contact-id.js`): non-cryptographic and unsalted. Emails and public
profile URLs are a small, guessable input space, so an ID plus a factoid export can be confirmed against a
candidate person. "Contains no PII" holds for the row shape, not against a motivated guesser, and free-text
`value` may contain PII the user typed. Open: per-install salt (breaks cross-install re-apply unless exported with
the factoids) or state the limit on the export screen.

## Where contact data exists outside the stores (found 2026-10-27; mostly fixed in 1.84.0)

- Factoid CSV export used to add a `displayName` column. **Fixed:** the export has `contactId, key, value, source`
  only; old files with the name column still import.
- Latest-message responses are cached in `chrome.storage.local` as `msgCache_<contactId>_<platform>`
  (`background/sw.js:72,119-130`). **Fixed:** purged on contact delete, network clear and clear-all, and entries older
  than 7 days are dropped at service-worker start. Still outside CSV exports by design.
- `chrome.storage.local` holds the local-LLM API key in plain text. **Documented** (comment in `shared/types.js`);
  not encrypted. The OpenAI key setting no longer exists.
