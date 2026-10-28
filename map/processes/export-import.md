---
type: process
name: Export and import
universe: live
cluster: processes
status: stale
verified_on: 2026-10-27
verified_at: 1.84.0
owner_files: [chrome-extension/lib/network-contact-csv.js, chrome-extension/pages/settings.js]
consumes: [[[contacts-store]], [[factoids-store]]]
produces: [[[contacts-store]], [[factoids-store]]]
---

# Export and import

**Input →** Settings export/import buttons, a CSV file. **Movement →** serialise to RFC-style CSV or parse and merge back. **Output →** a downloaded file, or merged rows.

## Steps

1. Export: read contacts (and factoids), build lines with `rowToCsvLine`, trigger an in-page blob download (`lib/network-contact-csv.js:42-58,295-330,331-362,483-499`).
2. Import: `parseCsv`, require the exact header or throw (`:60,:364-380,:501-515`).
3. Contacts: build contact objects from rows and run them through dedup before saving (`:380-466`).
4. Factoids: group by `contactId`, merge into each contact's existing facts by `key:value`, `saveFactoidsForContact`, report matched/unmatched (`:517-560`).
5. Per-platform import/export and "clear network" work the same way (`:147-290`; `storage.clearNetworkPlatform`).

## If you change this

**Hits:** backup/restore compatibility, factoid re-application on a clean import.
**Does not hit:** the `msgCache_*` message cache (not exported); IndexedDB schema. Factoid files carry only `contactId, key, value, source` (names removed in 1.84.0), but free-text `value` can still hold PII.

## See

`chrome-extension/lib/network-contact-csv.js`
