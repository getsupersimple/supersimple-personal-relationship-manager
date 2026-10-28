---
type: process
name: Factoid capture
universe: live
cluster: processes
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/pages/contacts.js, chrome-extension/background/sw.js, chrome-extension/lib/factoid-merge.js]
consumes: [[[provider-selection]], [[factoid-parse-and-merge]]]
produces: [[[factoids-store]]]
---

# Factoid capture

**Input →** a sentence ("Moved to Turkey with his wife Linda") or a typed key/value, or an Ask AI statement. **Movement →** model parses to `{key,value}`, merge with existing facts, persist. **Output →** replaced factoid rows for that Contact ID.

## Steps

1. Contacts page natural-language box sends `PARSE_FACTOIDS` (`sw.js:202`); the service worker ensures the offscreen document, resolves the model and credentials, forwards `WEBLLM_PARSE_FACTOIDS` (`:204-222`).
2. `handleWebllmParseFactoids` caps the text at 500 chars and runs the prompt on the chosen provider (`offscreen/handlers/parse-factoids-handler.js`).
3. `parseFactoidsOutput` normalises the JSON (`offscreen/factoids-parser.js:117`).
4. `addFactoidsFromParsed` merges with `mergeParsedFactoids` and saves with `saveFactoidsForContact` (`pages/contacts.js:725-736`); manual add/remove save the full list the same way (`:697-737`).
5. Ask AI route: pass 3 extraction → merge → save (`sw.js:506-532`, see Ask AI turn).

## If you change this

**Hits:** contact detail view (factoids list), search results, factoid CSV, Ask AI context.
**Does not hit:** contacts store; the capture does not touch any platform. Facts typed on a merged contact are saved under the ID the page passes, which may not be the contact's own ID.

## See

`chrome-extension/lib/factoid-merge.js`
