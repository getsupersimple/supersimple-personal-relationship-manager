---
type: object
name: Service worker
code_name: `background/sw.js`
universe: live
cluster: surfaces
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/background/sw.js]
---

# Service worker

The message router and sync orchestrator; also builds Ask AI context and fetches latest messages.

## Why this shape

It is the only context that can hold cookies-based fetches and talk to the offscreen document.

## Shape

- 3136 lines. Actions: `SYNC`, `GET_SYNC_STATE`, `GET_CONTACTS`, `GET_RECENT_CONTACTS`, `GET_CONVERSATIONS`, `PARSE_FACTOIDS`, `ASK_AI_CHAT`, `FETCH_FACEBOOK_LATEST_MESSAGE`, `FETCH_LATEST_MESSAGE` (`sw.js:166-610`), plus `WEBLLM_PROGRESS` relay (`:152`).
- Holds `const VERSION` (I7).
- Bundled by Vite (crxjs), so its imports need no entry in the `package.json` copy list.
- Platform-specific protocol code (LinkedIn, Facebook parsing) lives inside this file, not in `lib/`.

## Connected to

- joins: everything.

## If you change this

**Hits:** sync, Ask AI, latest-message fetch; build bundling; release version string.
**Does not hit:** page-only logic (rendering).

## Surfaces

Popup, pages (messages), offscreen document.

## See

`chrome-extension/background/sw.js`
