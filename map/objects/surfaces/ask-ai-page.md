---
type: object
name: Ask AI page
code_name: `pages/ask-ai.{html,js}`
universe: live
cluster: surfaces
status: verified
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/pages/ask-ai.js]
---

# Ask AI page

Chat UI with `@`-mention contact picker, a live per-turn call log, and an editable full-prompt box.

## Why this shape

Shows the model's inputs so users can see exactly what data leaves for the model (and edit it).

## Shape

- Sends `ASK_AI_CHAT` with prompt, history, `focusedContactId`, `pendingDisambiguation`, `mentionedContactId`, `previewOnly`, `overrideFullPrompt` (handled at `sw.js:225-`).
- Listens for `WEBLLM_PROMPT_PREVIEW` to stream the call log.
- Mention autocomplete runs in the page (`ask-ai.js:28-90`), by token matching.

## Connected to

- joins: service worker, chat handler, mention resolver.

## If you change this

**Hits:** Ask AI UX.
**Does not hit:** Contacts page search.

## Surfaces

User.

## See

`chrome-extension/pages/ask-ai.js`
