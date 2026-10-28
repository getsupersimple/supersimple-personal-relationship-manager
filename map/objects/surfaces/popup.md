---
type: object
name: Popup
code_name: `popup/popup.{html,js}`
universe: live
cluster: surfaces
status: verified
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/popup/popup.js]
---

# Popup

The toolbar popup: Sync Now, recent contacts, a search box, and a link to the contacts page.

## Why this shape

Fast entry point; heavy work is delegated to the service worker.

## Shape

- Sync: `chrome.runtime.sendMessage({action:'SYNC'})` (`popup/popup.js:181`).
- Search Enter opens `pages/contacts.html?q=…` — a text filter, not an LLM query (`:196-203`).
- `openOrFocusContacts` focuses an existing contacts tab or creates one (`:49-57`) — baselined I1 site.

## Connected to

- joins: sync state store, contacts store (counts, recent).

## If you change this

**Hits:** popup layout, sync trigger.
**Does not hit:** Ask AI.

## Surfaces

User.

## See

`chrome-extension/popup/popup.js`
