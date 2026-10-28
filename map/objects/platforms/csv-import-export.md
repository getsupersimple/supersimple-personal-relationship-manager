---
type: object
name: CSV import and export
code_name: `lib/network-contact-csv.js`
universe: live
cluster: platforms
status: stale
verified_on: 2026-10-27
verified_at: 1.84.0
owner_files: [chrome-extension/lib/network-contact-csv.js, chrome-extension/pages/settings.js]
---

# CSV import and export

Three file formats: per-platform contacts, all contacts, and factoids; each exported as CSV and re-importable.

## Why this shape

The mantra's "your control": everything leaves as plain files, and factoids can be re-applied to a clean import by Contact ID.

## Shape

- Per platform: `NETWORK_CSV_HEADERS`, `exportPlatformContactsCsv`/`importPlatformContactsCsv`. All contacts: `ALL_CONTACTS_CSV_HEADERS`, `exportAllContactsCsv`/`importAllContactsCsv`; header must match exactly or import throws. Factoids: `FACTOIDS_CSV_HEADERS = contactId, key, value, source`, `exportFactoidsCsv`/`importFactoidsCsv`.
- Contact exports (per platform, all) take factoids from **every effective ID** of the contact, de-duplicated by `key:value` (`factoidRowsForExport`); imports save under the contact's own ID.
- Factoid export no longer has a name column (1.84.0). Import still accepts the old five-column header (`contactId, displayName, ...`) and ignores the name.
- Factoid import merges into existing facts by `key:value` and reports matched/unmatched contacts.
- Wired from Settings; downloads use an in-page blob link.
- Internals (1.84.5): per-platform and all-contacts files share `contactsToCsv` (export), `importContactsCsv` (parse, validate, merge), `downloadCsv` and `assertPlatform`; they differ only in the header list and the platform column (`platformJson` one blob vs `platformsJson` all networks). Pinned by `harness/tests/csv.test.mjs`.

## Connected to

- joins: Contact ID, `factoids`, `contacts`, dedup (all-contacts import goes through merge).

## If you change this

**Hits:** backup compatibility (header changes break old files), factoid re-application, merge on import.
**Does not hit:** storage schema; the `msgCache_*` cache is not exported.

## Surfaces

Settings page.

## See

`chrome-extension/lib/network-contact-csv.js`
