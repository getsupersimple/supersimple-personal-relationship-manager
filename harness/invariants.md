# Invariants

Things that must stay true. Each has an ID, a reason, and a check. Status: `enforced` (script fails the build),
`planned` (check not written yet), `baseline` (the tree has known exceptions; the check freezes them so nothing is added silently).
Static checks: `harness/checks/verify.mjs` (baselines in `harness/baselines.json`). Behaviour tests: `harness/tests/*.test.mjs` (identity, factoids, schema, provider/migration/cache, CSV, offscreen handlers) (`node:test` + `fake-indexeddb`, run against the real extension modules). `npm run verify` runs both; `npm test` runs only the tests.

| ID | Invariant | Why | Check | Status |
|---|---|---|---|---|
| I1 | Avoid opening or activating tabs whenever possible. New tab use only via `withBackgroundTab`, inactive, closed when done; never navigate a user's tab. | `AGENTS.md` rule (owner wording 2026-10-27) | Scan `chrome.tabs.create/update`, `window.open`, `location.href =`; fail on any call site not in the baseline below | enforced (baseline) |
| I2 | Factoid rows contain only `id, contactId, key, value, source`. | ADR 0002 | `tests/factoids.test.mjs` (storage rows, saveContacts, parser, merge) | enforced |
| I3 | Contact ID for the same input never changes. | Orphans factoids (ADR 0002) | `tests/identity.test.mjs` — literal golden IDs per platform + URL/email variants | enforced |
| I4 | Merge never loses an absorbed ID; undo restores it. | Factoid and conversation lookup | `tests/identity.test.mjs` — merge, idMapping, round trip, factoid reachability. Undo itself (`handleUndoMerge`, `pages/contacts.js`) is DOM-bound and untested; only the data it relies on is pinned | enforced (undo gap; same-platform merge fixed 1.83.4) |
| I5 | No network call to a host the user did not configure or that is not a platform being synced. In particular **no contact to `api.openai.com` (or any AI vendor) unless the user typed that URL in Settings.** Plain-`http` permissions are a baselined, accepted deviation for local testing (ADR 0001); no new ones. | ADR 0001, 0003 | Scan `fetch(`/URL literals and `manifest.json` hosts/CSP against an allowlist | enforced (baseline; known deviations: `manifest.json` `http://*/*`, CSP `http://*:*`; OpenAI default removed 1.84.0) |
| I6 | Every `chrome-extension/lib` file imported by shipped code reaches `dist/`. | `package.json` copies a hand-written list; a missed file breaks silently | Resolve import graph vs. `dist/` | enforced |
| I7 | Version identical in `manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `sw.js`, newest `CHANGELOG.md` entry, git tag. | Release rule | Script compare | enforced |
| I8 | `map/` entry twins and rule copies (`.cursorrules`, `.cursor/rules/`) agree with their source. | Drift | `cmp` / summary check | enforced |
| I9 | Removed code stays removed. | ADR 0003 | `lib/ai/` must not exist; no `openaiApiKey`/`CHATGPT_MODEL_ID` outside `lib/provider-migration.js` and `lib/model-ids.js` | enforced |
| I10 | IndexedDB schema changes bump `DB_VERSION` and carry a migration. | User data survives upgrades | `tests/schema.test.mjs` — schema snapshot pin, synthetic v1 → v2, legacy `prm-rolodex`, reopen. The v1 fixture is synthetic (no `factoids` store), not an export of a real v1 | enforced |
| I11 | The map index agrees with the cards; cards whose source changed since `verified_at` are reported. | Stale maps mislead | `verify.mjs` compares `map/objects/_index.md` to card frontmatter (failure) and runs `git diff` per card (note only) | enforced |
| I12 | Every relative import or script `src` in shipped source resolves to a file. | Deleting or moving a module must not leave a dangling import | `verify.mjs` scans `chrome-extension/` (excluding the offscreen bundle) | enforced |

## I1 baseline (found 2026-10-27; rule is now "avoid", so these are allowed but frozen)

- `lib/tab-scraper-utils.js:77` — `withBackgroundTab`, `active: false`; used by whatsapp (3 files), gmail-message, facebook-messenger scrapes.
- `lib/google-contacts-tab-scrape.js:126` — `tabs.create({ active: true })`; `tabs.update` at `:140`, `:957`. **Activates a tab on purpose**: the log says "load + hydrate while visible" — Google Contacts' list does not render in a background tab. Kept; changing it needs live testing (issue 03).
- `lib/gmail-message-tab-scrape.js:42` — `tabs.update(tabId, { active: true })`. **Same reason** (Gmail's thread list).
- `popup/popup.js:53-57` — focus or open the extension's own contacts page (user-initiated; fine).

## Known tensions

ADR 0001 (host permissions), ADR 0002 (unsalted hash).
