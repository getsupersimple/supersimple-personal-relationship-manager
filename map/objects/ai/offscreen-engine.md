---
type: object
name: Offscreen engine host
code_name: `offscreen/offscreen-src.js`, `offscreen/mlc-engine.js`
universe: live
cluster: ai
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/offscreen/offscreen-src.js, chrome-extension/offscreen/mlc-engine.js, chrome-extension/background/sw.js]
---

# Offscreen engine host

The hidden extension page that routes LLM requests and holds the WebLLM engine in memory.

## Why this shape

MV3 service workers cannot keep a WebGPU model loaded; an offscreen document can.

## Shape

- Created on demand by `ensureOffscreenDocument` with reason `DOM_PARSER` (`sw.js:650-668`).
- Routes `WEBLLM_PARSE_FACTOIDS`, `WEBLLM_SUMMARIZE_MESSAGE` and `WEBLLM_CHAT` to their handlers (`offscreen-src.js`). The old `WEBLLM_EXTRACT_CONTACTS` route had no sender and was deleted in 1.84.5.
- Handlers share one provider call, `runChatCompletion` in `offscreen/llm-client.js`: `providerContext(msg)` picks WebLLM or Local LLM, `localLlmConfigError` reports a missing server/model, and the engine path (`ensureEngine`) lives only there.
- `ensureEngine(modelId)` (`mlc-engine.js:93`) caches one engine and reloads on a different model; progress goes to the service worker as `WEBLLM_PROGRESS`, which stores it in `chrome.storage.local` `prmModelDownloadProgress` for open pages (`sw.js:152-165`).
- `DEFAULT_MODEL = gemma-2-2b-it-q4f16_1-MLC` (`offscreen/constants.js`); a saved legacy Qwen2-0.5B choice is rewritten in the `PARSE_FACTOIDS` path (`sw.js:204-212`).
- **Build output**: `offscreen/offscreen.js` and its `.map` are generated from `offscreen-src.js` by `vite.offscreen.config.js` and committed — edit the source.

## Connected to

- owns: model download/cache. joins: provider selection, handlers.

## If you change this

**Hits:** all in-browser LLM work, model download UX, the committed bundle size.
**Does not hit:** `local-openai` requests still pass through the same handlers but do not load a model (no `ensureEngine`).

## Surfaces

Service worker messages only.

## See

`chrome-extension/offscreen/offscreen-src.js`
