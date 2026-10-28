---
type: object
name: OpenAI-compatible client
code_name: `openaiChatCompletion`
universe: live
cluster: ai
status: verified
verified_on: 2026-10-27
verified_at: 1.84.0
owner_files: [chrome-extension/offscreen/openai-client.js]
---

# OpenAI-compatible client

POSTs a chat-completions request to a user-entered base URL (their own server) and returns the text.

## Why this shape

Lets users run a private LLM server without bundling a provider (ADR 0003).

## Shape

- `openaiChatCompletion({ baseUrl, model, apiKey?, messages })` POSTs to `<baseUrl>/chat/completions` (suffix added once); `Authorization: Bearer` only if a key is set (`offscreen/openai-client.js`).
- **No default host.** With no `baseUrl` or no `model` it returns an error and sends nothing (since 1.84.0; before that it fell back to `https://api.openai.com`). OpenAI is reachable only if the user types its URL.
- No scheme check: `http://` base URLs work (kept for local testing, ADR 0001).
- Pinned by `harness/tests/provider.test.mjs` (I5).

## Connected to

- joins: provider selection; callers `chat-handler.js`, `parse-factoids-handler.js`, `summarize-handler.js`.

## If you change this

**Hits:** Ask AI, factoid parsing and message summaries when the provider is Local LLM; I5.
**Does not hit:** WebLLM path (`ensureEngine`).

## Surfaces

Offscreen handlers.

## See

`chrome-extension/offscreen/openai-client.js`
