---
type: process
name: Sync platforms
universe: live
cluster: processes
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/background/sw.js]
consumes: [[[settings-page]], [[linkedin]], [[facebook]], [[whatsapp]], [[google-contacts]]]
produces: [[[contacts-store]], [[sync-state-store]]]
---

# Sync platforms

**Input →** "Sync Now" click, per-platform toggles and `importLimit` in `chrome.storage.local`. **Movement →** four sequential platform imports, each read-merge-write of the whole contact list. **Output →** merged contacts and one sync-state row.

## Steps

1. Popup sends `SYNC` (`popup/popup.js:181`); the service worker calls `handleSync` (`sw.js:166-170`, `:2898`).
2. Read the four `sync*Enabled` flags; anything not explicitly `false` runs (`sw.js:2905-2917`).
3. LinkedIn: paginated background `fetch`; each page goes through `processConnections` as it arrives, then `pingContactsUpdated` (`sw.js:2920-2990`, `:1064`).
4. Facebook: `syncFacebook` (`:2606`) → `processFacebookConnections`.
5. WhatsApp: `syncWhatsApp` (`:3089`): store scrape in a background tab, DOM fallback → `processWhatsAppConnections`.
6. Google Contacts: `syncGmail` (`:3026`): list pages scraped in tabs → `processGmailContacts`.
7. Each processor loads all contacts, runs `deduplicateAndMerge`, and `saveContacts` (clear + put all) (e.g. `lib/linkedin-processor.js:93-106`).
8. Save `{lastSync, platformStatus}` and ping pages (`sw.js:3017-3023`).

Failure is per platform: an exception sets that platform's `error` and the loop continues; `handleSync` itself always returns a state. Platforms run one after another, so a slow LinkedIn run delays the rest.

## If you change this

**Hits:** contacts, merge outcomes, the sync-state row, every open page's list (via ping).
**Does not hit:** conversations and factoids (latest messages are a separate on-demand flow, `sw.js:755`); no LLM runs during sync.

## See

`chrome-extension/background/sw.js:2898`
