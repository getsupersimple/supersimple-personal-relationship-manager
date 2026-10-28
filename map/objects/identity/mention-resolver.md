---
type: object
name: Contact mention resolver
code_name: `resolveContactMention`, `resolveDisambiguationReply`, `describeContactForDisambiguation`
universe: live
cluster: identity
status: verified
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/lib/contact-mention-resolver.js]
---

# Contact mention resolver

Finds which contact a typed question is about, and narrows a list of look-alikes from a follow-up reply.

## Why this shape

Ask AI only answers about one focused contact, so a name in free text has to become exactly one ID or a disambiguation question.

## Shape

- Exports at `lib/contact-mention-resolver.js:61,85,122`; keeps only best-scoring matches.
- Used by `ASK_AI_CHAT` in `background/sw.js` for disambiguation replies and fresh name detection (`:225-330`); `SHOWN_CANDIDATE_LIMIT = 8` (`sw.js:63`).
- An explicit `@`-mention from the Ask AI page bypasses it entirely (`mentionedContactId`, `sw.js:253-254`).

## Connected to

- joins: contacts list, factoids (for narrowing replies).

## If you change this

**Hits:** Ask AI turn behaviour and wording of disambiguation prompts.
**Does not hit:** the contacts-page search box (separate token filter, `pages/contacts.js:125-158`).

## Surfaces

Ask AI.

## See

`chrome-extension/lib/contact-mention-resolver.js`
