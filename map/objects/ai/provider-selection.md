---
type: object
name: Provider selection
code_name: `CHATGPT_MODEL_ID`, `LOCAL_LLM_MODEL_ID`, `getLlmProviderCredentials`
universe: live
cluster: ai
status: stale
verified_on: 2026-10-27
verified_at: 1.84.0
owner_files: [chrome-extension/offscreen/constants.js, chrome-extension/background/sw.js]
---

# Provider selection

The saved `webllmModel` setting decides where inference runs: an in-browser WebLLM model, or `local-openai`, the user's own OpenAI-compatible server.

## Why this shape

One setting feeds every LLM call; the service worker attaches the matching credentials to each message.

## Shape

- Two provider kinds: a WebLLM model id (in-browser) or `local-openai` (the user's own OpenAI-compatible server) — `offscreen/constants.js`. The `chatgpt` provider was removed in 1.84.0.
- `getLlmProviderCredentials(modelId)` returns `{localLlmBaseUrl, localLlmModel, localLlmApiKey}` for `local-openai`, else `{}` (`background/sw.js:98-110`). `getSelectedModelId()` (`lib/provider-migration.js`) reads the saved model and never returns `chatgpt`.
- Each handler recomputes `isLocalLlm` from `modelId` (`chat-handler.js`, `parse-factoids-handler.js`, `summarize-handler.js`, `offscreen-src.js`).
- Migration (`migrateRemovedChatGptProvider`, run from `onInstalled`): a saved `chatgpt` model becomes the default WebLLM model, the stored `openaiApiKey` is deleted, and `prmProviderMigrationNotice` makes Settings show a one-time notice.
- Settings keys in `chrome.storage.local`: `webllmModel`, `localLlmBaseUrl`, `localLlmModel`, `localLlmApiKey` (plain text).
- **What the endpoint sees**: with `local-openai` the focused contact's factoids and conversations and the user's text are sent to the URL the user entered.
- Model and provider ids live only in `lib/model-ids.js` (`DEFAULT_MODEL`, `LOCAL_LLM_MODEL_ID`, `REMOVED_CHATGPT_MODEL_ID`, `MODEL_OPTIONS`, `normalizeModelId`); `offscreen/constants.js` re-exports two of them.

## Connected to

- joins: openai client, offscreen engine.

## If you change this

**Hits:** Settings UI, all three handlers, the migration test (`harness/tests/provider.test.mjs`), the I5 network invariant.
**Does not hit:** contacts/factoid storage.

## Surfaces

Settings page, service worker.

## See

`chrome-extension/offscreen/constants.js`, `chrome-extension/background/sw.js:98`
