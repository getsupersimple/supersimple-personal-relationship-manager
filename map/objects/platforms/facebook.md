---
type: object
name: Facebook source
code_name: `syncFacebook`, `lib/facebook-api.js`
universe: live
cluster: platforms
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/background/sw.js, chrome-extension/lib/facebook-api.js, chrome-extension/lib/facebook-processor.js, chrome-extension/lib/facebook-messenger-tab-scrape.js]
---

# Facebook source

Friends imported by background `fetch` (embedded page JSON first, then Facebook's GraphQL endpoint) using the user's cookies.

## Why this shape

Keeps Facebook out of tabs for the list; the only tab use is the Messenger thread scrape.

## Shape

- `syncFacebook` (`sw.js:2606`): try `/friends/list` embedded JSON (`facebookTryFetchFriendsFromFriendsListPageSjs`, `lib/facebook-api.js:636`), else token init + paged GraphQL POST (`:678,:717`) with `credentials: 'include'` and cookie headers read through `chrome.cookies` (`:408-451`). Result → `processFacebookConnections` (`lib/facebook-processor.js:31`).
- ID: hash of `normalizeFacebookProfileUrlKey` (`lib/facebook-profile-url.js:10`); `profile.php?id=` is preserved.
- Messages: thread HTML fetch (`sw.js:2763`) or Messenger tab scrape via `withBackgroundTab`.
- No LLM in the import.
- **Pacing:** the friends list is walked by `collectCursorPages` (`lib/pagination-delay.js`), which waits the shared page delay (default 1000 ms, minimum 250) between GraphQL pages; the fixed 300 ms wait it replaced was below the new minimum.

## Connected to

- owns: `facebook` platform blob.

## If you change this

**Hits:** Facebook Contact IDs, `facebook-api.js` request shapes (Facebook can change them), cookie permission.
**Does not hit:** LinkedIn, WhatsApp, Google paths.

## Surfaces

Sync button.

## See

`chrome-extension/lib/facebook-api.js`, `chrome-extension/background/sw.js:2606`
