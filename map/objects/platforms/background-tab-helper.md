---
type: object
name: Background tab helper
code_name: `withBackgroundTab`
universe: live
cluster: platforms
status: verified
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/lib/tab-scraper-utils.js]
---

# Background tab helper

Opens a URL in an inactive tab, waits for load, runs a callback, then always closes the tab.

## Why this shape

The single sanctioned way to open a tab (AGENTS.md rule); keeps open/close pairing in one place.

## Shape

- `chrome.tabs.create({ url, active: false })`, wait for load, `fn(tabId)`, `finally` close; optionally restores the previously active tab (`lib/tab-scraper-utils.js:59-96`; `restorePreviousTab` defaults false).
- Callers: whatsapp (store, list, thread), gmail-message, facebook-messenger scrapes. `google-contacts-tab-scrape.js` has its **own** create/update calls (it needs an active tab) but shares this module's `sleep` and `waitForTabLoadComplete`.

## Connected to

- looks like but is not: a content script in a tab the user opened.

## If you change this

**Hits:** every tab-based scrape; the I1 baseline in `harness/baselines.json`.
**Does not hit:** background `fetch` paths (LinkedIn, Facebook list).

## Surfaces

Service worker only.

## See

`chrome-extension/lib/tab-scraper-utils.js`
