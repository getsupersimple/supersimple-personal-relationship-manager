---
type: process
name: Ask AI turn
universe: live
cluster: processes
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/background/sw.js, chrome-extension/offscreen/handlers/chat-handler.js, chrome-extension/pages/ask-ai.js]
consumes: [[[mention-resolver]], [[effective-ids]], [[chat-handler]], [[provider-selection]]]
produces: [[[factoids-store]]]
---

# Ask AI turn

**Input →** typed question (optionally an `@`-picked contact, a pending disambiguation, an edited full prompt). **Movement →** resolve one contact, assemble that contact's data, up to three model calls, maybe save a new fact. **Output →** an answer plus a log of every call.

## Steps

1. Page sends `ASK_AI_CHAT` (`sw.js:225`); an empty prompt with no override is rejected (`:236-239`).
2. Load all contacts (`:249`). An `@`-mention (`mentionedContactId`) fixes the contact and skips the next two steps (`:253-254`).
3. Resolve a reply to a previous "which one?" question against its candidates, or combine it with the original question (`:268-338`); `SHOWN_CANDIDATE_LIMIT = 8` (`:63`).
4. Otherwise detect a name in the text with `resolveContactMention` (`:340-`); one match focuses it, several produce a disambiguation reply with no model call (`:360`).
5. Ensure the offscreen document (`:407`).
6. If the question looks conversational and this is not a preview, **fetch the latest messages from the network** for the focused contact (`:448-456`, `fetchAndSummarizeContactPlatform`, `:755`).
7. Collect factoids for all effective IDs (`:445-446`) and conversations; send `WEBLLM_CHAT` with provider credentials (`:489`).
8. Chat handler: general chat if no contact; else relevance pass → answer pass → extraction pass unless the text is a pure question (`chat-handler.js:237-382`).
9. If extraction returned candidates, merge into the contact's existing facts and **save under `focusedContact.id`** (`sw.js:506-532`).
10. Return answer, focus state, pending disambiguation and the call log (`:550`).

**What leaves the machine:** with `webllm` nothing; with `local-openai` or `chatgpt` the focused contact's factoids, conversation text and the user's question go to the configured URL. Step 6 also contacts the social network.

## If you change this

**Hits:** Ask AI replies, saved factoids, the call log shown on the page, latest-message cache.
**Does not hit:** contacts, conversations stores (read only, except the message fetch which may write a conversation and cache); the contacts-page search box.

## See

`chrome-extension/background/sw.js:225`
