# Supersimple Personal Relationship Manager — Domain Glossary

Chrome extension (MV3). Mantra: **Your contacts. Your data. Your control.**
It gathers a user's contacts from LinkedIn, Facebook, WhatsApp Web and Google Contacts/Gmail into one
IndexedDB in the browser, with offline search and an Ask AI page.
Nothing leaves the machine except calls the user's own browser session makes to the social networks and to
the AI endpoint the user configured. Where to go next: `AGENTS.md` (rules), `map/CLAUDE.md` (what is X / what moves),
`harness/invariants.md` (what must stay true).

Use these terms exactly. Left column is product language; right is code.

| Term | Meaning | Code |
|---|---|---|
| **Contact** | One person row. May carry several platform profiles after a merge. | `Contact`, store `contacts` (`shared/types.js`, `lib/storage.js:21`) |
| **Platform profile** | The per-network blob on a contact (`linkedin`, `facebook`, `whatsapp`, `gmail`). | `Contact.platforms.*` |
| **Contact ID** | Deterministic `<platform>:<one-way hash of normalized URL/email>`; same person → same ID on every import. Random UUID only when nothing to hash. | `lib/*-processor.js` (`contactIdFrom…`) |
| **Merge** | Collapsing contacts so a person appears once; absorbed IDs are kept in `platforms.*.id` (and `platforms.*.absorbedIds` when two contacts shared a platform) so undo and factoid lookup still work. | `lib/dedup.js`, `lib/contact-effective-ids.js` |
| **Effective IDs** | Main ID plus merged-in platform IDs; the set of IDs whose factoids/conversations belong to a contact. | `getEffectiveContactIds` |
| **Factoid** | A small fact about a contact (`key`/`value`/`source`) in its own store, keyed only by Contact ID, so it can be exported and re-applied to a clean import. | `FactoidRow`, store `factoids` |
| **Conversation** | Latest-message thread per contact per platform; feeds the summary. | store `conversations` |
| **Sync** | Reading a platform with the user's existing browser session: background `fetch` (LinkedIn, Facebook) or a scraped tab (WhatsApp, Google Contacts). No LLM is involved. | `background/sw.js`, `lib/*-tab-scrape.js` |
| **Ask AI** | Chat about **one focused contact**: the service worker finds the contact and hands its factoids and conversations to the model (relevance → answer → extraction passes); with no contact it is a general chat with no database data. `@`-mentions pin a contact. | `pages/ask-ai.js`, `offscreen/handlers/chat-handler.js` |
| **Query box** | The search field on the contacts page and in the popup: a plain text filter (every word must appear in name, email, summary, company/headline or a factoid). Not LLM-backed. | `pages/contacts.js:125-158` |
| **Offscreen document** | Hidden extension page that hosts the LLM engines. | `offscreen/` |
| **Provider** | Where inference runs: `webllm` (default, in-browser), `local-openai` (user's own OpenAI-compatible server, e.g. Ollama), (the built-in `chatgpt` option was removed in 1.84.0; OpenAI is reachable only if the user enters its URL as the Local LLM base URL). | `offscreen/constants.js` |

## Name collisions

- `openai-client.js` speaks the OpenAI wire format but only to the server URL the user entered (`local-openai`). It has no default host (ADR 0003).
- "Gmail" in code and storage means **Google Contacts** (scraped from contacts.google.com), not the mailbox.
- Product copy once said an LLM finds contacts in network lists; the code never did, and the unused extractor was deleted in 1.84.5. Sync uses APIs and page scrapes only.
- "Factoid" never means a stored contact attribute like name/email; those live on the Contact.
