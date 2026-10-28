---
type: object
name: Prompts
code_name: `offscreen/prompts.js`
universe: live
cluster: ai
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/offscreen/prompts.js]
---

# Prompts

The system prompts and prompt builders for each LLM task.

## Why this shape

Prompts are product behaviour; small local models are sensitive to wording, so they live together and carry worked examples.

## Shape

- Live: `PARSE_FACTOIDS_PROMPT` (`:19`), `RECENT_THREAD_SUMMARY_PROMPT` (`:46`), `SINGLE_MESSAGE_SUMMARY_PROMPT` (`:53`), `GENERAL_ASSISTANT_PROMPT` (`:248`), `CONTACT_RELEVANCE_PROMPT` (`:272`), `CONTACT_ANSWER_PROMPT` (`:320`); builders `withUserNameContext` (`:68`), `withContactContext` (`:195`).
- `EXTRACT_PROMPT` and the `FACEBOOK_RECENT_THREAD_SUMMARY_PROMPT` alias were deleted in 1.84.5 (no users).

## Connected to

- joins: chat handler, parse and summarize handlers.

## If you change this

**Hits:** answer quality for every provider; the relevance pass's field ids (`chat-handler.js:93-140`) must stay in step with `CONTACT_RELEVANCE_PROMPT`.
**Does not hit:** the parser (`factoids-parser.js` post-processes whatever the model returns).

## Surfaces

Offscreen handlers.

## See

`chrome-extension/offscreen/prompts.js`
