---
type: object
name: Ask AI chat handler
code_name: `handleWebllmChat`
universe: live
cluster: ai
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/offscreen/handlers/chat-handler.js]
---

# Ask AI chat handler

Runs one Ask AI turn as up to three model calls and returns the answer plus a log of every call.

## Why this shape

Small models answer badly with noisy context, so a relevance pass trims the contact data before the answer pass.

## Shape

- No contact name → one call with `GENERAL_ASSISTANT_PROMPT`, **no database data** (`chat-handler.js:294-306`).
- Contact focused → Pass 1 `determineNeededFields` picks fields from factoids + conversation summaries; Pass 2 answers from the filtered set (`buildAnswerMessages`); Pass 3 extracts new facts through `handleWebllmParseFactoids` unless `looksLikePureQuestion`.
- Every pass calls the shared `runChatCompletion` (`offscreen/llm-client.js`) through a thin wrapper that trims and caps the reply at 4000 characters.
- `previewOnly` returns the assembled prompt with no model call; `overrideFullPrompt` sends the user's hand-edited prompt verbatim as one call (`:237-300`).
- Every call is broadcast as `WEBLLM_PROMPT_PREVIEW` for the page's live log.
- It receives contact data from the service worker; it does not query IndexedDB.

## Connected to

- joins: prompts, provider selection, openai client.

## If you change this

**Hits:** Ask AI answers and the call-log view; pass 3 output is what the service worker may save as factoids.
**Does not hit:** contact resolution (done in the service worker before this runs).

## Surfaces

Ask AI page via the service worker.

## See

`chrome-extension/offscreen/handlers/chat-handler.js`
