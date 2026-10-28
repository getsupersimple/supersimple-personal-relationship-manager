---
type: object
name: Settings page
code_name: `pages/settings.{html,js}`
universe: live
cluster: surfaces
status: stale
verified_on: 2026-10-27
verified_at: 1.84.0
owner_files: [chrome-extension/pages/settings.js]
---

# Settings page

Model/provider choice, sync toggles and limits, CSV backup and restore, clear-per-network.

## Why this shape

Every user-controllable behaviour in one place; all values go to `chrome.storage.local`.

## Shape

- Saves `readSettingsFromForm()` with `chrome.storage.local.set` (`pages/settings.js`): `importLimit`, `sync*Enabled`, `webllmModel`, `localLlmBaseUrl/Model/ApiKey`, `conversationRefreshMinutes`, and others.
- CSV buttons; `clearNetworkPlatform` (also purges that network's cached message text).
- Shows the one-time `prmProviderMigrationNotice` and then removes it.
- **The local-LLM API key is stored in plain `chrome.storage.local`**; `shared/types.js` now says so. The placeholder base URL is still `http://localhost:11434/v1` (HTTP kept for local testing, ADR 0001).
- All status messages go through `showSettingsStatus(text, { error, clearMs })`; the model dropdown is filled by `populateModelSelect` (`lib/webllm-model-select.js`) from `MODEL_OPTIONS` in `lib/model-ids.js`.
- The "Delay between page requests (ms)" field (`#paginationDelayMs`, min 250, placeholder 1000) feeds `paginationDelayMs`; blank, invalid or 0 saves the default 1000 (`paginationDelayFromInput`), and the field always shows the resolved value.

## Connected to

- joins: provider selection, CSV, storage.

## If you change this

**Hits:** provider config, backup flow.
**Does not hit:** sync logic (reads the toggles at run time, `sw.js:2905-2917`).

## Surfaces

User.

## See

`chrome-extension/pages/settings.js`
