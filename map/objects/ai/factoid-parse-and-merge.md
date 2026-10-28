---
type: object
name: Factoid parsing and merge
code_name: `parseFactoidsOutput`, `mergeParsedFactoids`
universe: live
cluster: ai
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/offscreen/factoids-parser.js, chrome-extension/lib/factoid-merge.js, chrome-extension/offscreen/handlers/parse-factoids-handler.js]
---

# Factoid parsing and merge

Turns a model reply into `{key, value}` facts, and merges them into a contact's existing facts.

## Why this shape

The same merge rules apply whether the fact came from the contacts-page box or from an Ask AI turn.

## Shape

- Parse: `parseFactoidsOutput(raw, source)` (`factoids-parser.js:117`) extracts a JSON array, retries with single quotes swapped, applies fallbacks, returns `{ok, factoids}` or an error.
- Merge: `mergeParsedFactoids(existing, parsed, source, additive)` (`lib/factoid-merge.js:57`): matching normalised key replaces the value; `Notes` always appends with `. `; `additive` (from `looksAdditive`, `:27`) comma-joins; returns `{merged, addedCount, updatedCount, changed}`. Pure function.
- Handler: `handleWebllmParseFactoids` (`parse-factoids-handler.js`) truncates input to 500 chars and calls the shared `runChatCompletion` (`offscreen/llm-client.js`); the raw reply is capped at 2000 characters.
- Pinned by `harness/tests/factoids.test.mjs` (row shape only).

## Connected to

- joins: factoids store (the caller persists), prompts.

## If you change this

**Hits:** contacts-page natural-language entry, Ask AI pass 3 saves, what counts as a duplicate fact.
**Does not hit:** the store shape (`saveFactoidsForContact` fixes it).

## Surfaces

Contacts page, service worker.

## See

`chrome-extension/lib/factoid-merge.js`
