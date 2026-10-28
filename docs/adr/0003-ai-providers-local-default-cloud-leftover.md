# 0003 — AI providers: local by default; no hidden connection to OpenAI

Status: accepted 2026-10-27 (owner decisions); implemented in 1.84.0

## Decision

Live providers (`offscreen/constants.js`): `webllm` (default `DEFAULT_MODEL`) and `local-openai`: any
OpenAI-compatible server at a user-entered base URL (Ollama, LM Studio, or a private server).

1. **`offscreen/openai-client.js` stays**, to let users run their own private server.
2. **The extension must not contact OpenAI's servers unless the user has entered an OpenAI API URL in Settings.**
   Until 1.84.0 it could: with no `baseUrl` the client fell back to `https://api.openai.com/v1/chat/completions`
   via the `chatgpt` provider. That default is gone; a user who wants OpenAI enters `https://api.openai.com/v1` as
   the base URL themselves.
3. **`lib/ai/`** (`index.js`, `ollama.js`, `cloud.js`, `webllm.js`) was a ghost with no caller (`cloud.js` also reached
   `api.anthropic.com`). **Deleted in 1.84.5**; check I9 keeps it from coming back.

## Removed in 1.84.0

- The `chatgpt` provider (`CHATGPT_MODEL_ID`, `CHATGPT_DEFAULT_MODEL`), the `openaiApiKey` setting and Settings field,
  the key branch in `getLlmProviderCredentials`, the hardcoded OpenAI URL, and the explicit `api.openai.com`
  manifest entries. `openai-client.js` now requires a user-entered base URL and model.
- Migration: a saved `chatgpt` model falls back to the default WebLLM model, the stored key is deleted, and Settings
  shows a one-time notice (`lib/provider-migration.js`, `harness/tests/provider.test.mjs`).

## Consequences

- No new cloud providers or key-handling features. Users who want OpenAI enter `https://api.openai.com/v1` as the
  Local LLM base URL and their own key.
