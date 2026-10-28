---
type: object
name: Conversation store
code_name: IndexedDB store `conversations`
universe: live
cluster: storage
status: stale
verified_on: 2026-10-27
verified_at: 1.84.0
owner_files: [chrome-extension/lib/storage.js]
---

# Conversation store

Per-contact, per-platform message threads that feed the "latest message" summary.

## Why this shape

Kept apart from contacts so a contact row stays small and a platform can be wiped without touching people.

## Shape

- keyPath `id` — `lib/storage.js`; shape `Conversation` in `shared/types.js`.
- `saveConversation(s)`, `getConversationsForContact`, `clearNetworkPlatform` (deletes a platform's rows).
- The refresh cache is **not here**: it lives in `chrome.storage.local` as `msgCache_<contactId>_<platform>` (`background/sw.js:72,119-130`) and holds fetched message text. Since 1.84.0 it is purged when a contact is deleted, a network is cleared, or all contacts are cleared (`purgeLatestMessageCache`, `lib/storage.js`), and entries older than 7 days are dropped at service-worker start (`lib/provider-migration.js`). It is still outside every CSV export.

## Connected to

- joins: Contact ID via `contactId`; absorbed IDs after a merge (read through effective IDs).

## If you change this

**Hits:** the latest-message flow (`fetchAndSummarizeContactPlatform`, `sw.js:755`), Ask AI context (conversations are passed to the model), `clearNetworkPlatform`.
**Does not hit:** factoids; the `msgCache_*` cache (different storage area; purged separately, see above).

## Surfaces

Service worker, contacts page, Ask AI.

## See

`chrome-extension/lib/storage.js`
