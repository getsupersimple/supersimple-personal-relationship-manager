# Contact data outside IndexedDB and the factoid store

Status: done in 1.84.0 (API key storage documented, not changed)

1. Factoid CSV export no longer includes `displayName`; legacy files still import. (`lib/network-contact-csv.js`)
2. `msgCache_*` is purged on contact delete, network clear, clear-all, and after 7 days. (`lib/storage.js`, `lib/provider-migration.js`)
3. The local-LLM API key is plain text in `chrome.storage.local`; the misleading "encrypted/obfuscated" comment is
   fixed. Encrypting it needs a key the extension does not have; left as a documented limit.
Also fixed: contact CSV exports now include factoids held under absorbed IDs.
