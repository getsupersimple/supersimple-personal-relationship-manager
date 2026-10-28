---
type: object
name: Contacts page and search box
code_name: `pages/contacts.{html,js}`
universe: live
cluster: surfaces
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/pages/contacts.js]
---

# Contacts page and search box

The main list/detail UI: search, sort, factoid editing, merge and undo, latest messages.

## Why this shape

All data work happens in the page against IndexedDB directly; only network and LLM work goes through the service worker.

## Shape

- The "query" box is `#searchInput` (`contacts.html:22`): every whitespace term must appear in the combined name, email, summary, LinkedIn company/headline and factoid keys/values (`contacts.js:125-158`). **No LLM and no database query language.** The merge search is a separate name search (`:815-845`).
- Factoid edit/add/remove paths: `addFactoid`, `addFactoidsFromParsed`, `removeFactoid` (`:697-742`); natural-language entry sends `PARSE_FACTOIDS`.
- Merge: `confirmAndMerge` / `doMerge` (`:850-880`); undo `handleUndoMerge` (`:759`).
- Reads `?id=` and `?q=` from the URL (`:120,:891-892`).
- Latest-message cards are driven by the `LATEST_MESSAGE_SOURCES` table (Gmail, LinkedIn, Facebook, WhatsApp) and one `loadLatestMessageFor` function; per-network differences (request fields, count wording, LinkedIn's empty-result diagnostic) are table entries.

## Connected to

- joins: storage, merge-dedup, factoid parse.

## If you change this

**Hits:** everything a user sees about a contact; CSS file `contacts.css` (1058 lines).
**Does not hit:** Ask AI context (built in the service worker).

## Surfaces

User.

## See

`chrome-extension/pages/contacts.js`
