---
type: object
name: LinkedIn source
code_name: `extractLinkedInContactsViaPagination`, `lib/linkedin-*.js`
universe: live
cluster: platforms
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/background/sw.js, chrome-extension/lib/linkedin-processor.js, chrome-extension/lib/linkedin-url.js]
---

# LinkedIn source

Connections imported by background `fetch` against LinkedIn's own pagination API with the user's session, plus message lookup through LinkedIn's messaging API.

## Why this shape

No tab is needed to list connections: the service worker reuses the logged-in cookies and CSRF token.

## Shape

- Connections: `extractLinkedInContactsViaPagination` (`sw.js:1064`); CSRF from cookies (`:1687`). Each page is flushed through `mergeLinkedInConnectionsBatch` → `processConnections` (`lib/linkedin-processor.js:56,63`) so the contacts list fills while the sync runs, then `pingContactsUpdated` (`sw.js:132`).
- Import cap: setting `importLimit`; 0 = no limit (50000 internal) (`sw.js:2920-2923`).
- ID: hash of `normalizeLinkedInProfileUrl` (`lib/linkedin-url.js:7`). Two hard-coded seed profiles are filtered out (`linkedin-processor.js:11-14`).
- Messages: Voyager mailbox + conversation matching by vanity/URN/display name (`sw.js:2017-2600`), used by the latest-message flow, not by contact sync.
- **Response format (changed 2026-10, fixed 1.84.6):** each card's profile link is now a relative `"url":"/in/<slug>/"` (older responses: absolute `https://www.linkedin.com/in/...`), and name and headline arrive *before* it as SetState loading-state strings (`profile_name_loading_state`, `profile_headline_loading_state`, `"stringValue"`); the older format put them in `"p"` text nodes after the URL. `parseLinkedInConnectionsPageFromNavigateToUrl` handles both, preferring the loading states. Pager id selection was checked against the real page and still resolves to `mynetwork.connectionsList` (the page also lists the feed pager first).
- **Delay between pages:** one setting, "Delay between page requests (ms)", paces every paginator (LinkedIn, Facebook, Google Contacts lists). `lib/pagination-delay.js`: default **1000 ms**, never below **250 ms**, and a stored `0` (what the Settings page saved for a blank field before 1.84.7, so any settings save removed the delay) means the default. LinkedIn waits after each page (`getPaginationDelayMs`).
- Pinned by `harness/tests/sync.test.mjs` (the real service worker against a fake LinkedIn in both formats). The fixture's text is synthetic; its structure was copied from a capture. When LinkedIn changes the format again this test will still pass until its fixture is updated, so a "no connections" report means: capture a real response and add it as a new fixture.
- **No LLM is used to read the LinkedIn lists.**

## Connected to

- owns: `linkedin` platform blob. joins: Contact ID, dedup (company + name rule).

## If you change this

**Hits:** LinkedIn Contact IDs (URL normalizer change orphans factoids), the sync result, latest-message summaries.
**Does not hit:** Facebook, WhatsApp, Google import paths; `offscreen/` (no LLM reads LinkedIn lists).

## Surfaces

Sync button, contacts page.

## See

`chrome-extension/background/sw.js:1064`, `chrome-extension/lib/linkedin-processor.js`
