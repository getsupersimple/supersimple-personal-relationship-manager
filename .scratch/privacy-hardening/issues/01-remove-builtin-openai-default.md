# Remove built-in OpenAI default and the `chatgpt` provider

Status: done in 1.84.0 (2026-10-27)

`openai-client.js` has no default host: no `baseUrl` or model means nothing is sent. `chatgpt` provider, key field,
key branch, constants and explicit manifest entries removed. Saved `chatgpt` model migrates to the default with a
one-time Settings notice; the stored OpenAI key is deleted. Tests: `harness/tests/provider.test.mjs`.
