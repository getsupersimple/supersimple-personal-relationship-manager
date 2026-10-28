# map/ — edit map

Answers "what is X" and "what else moves if I change X" without reading the 31k-line tree.
The source tree stays authoritative; cards cite `path:line`. Status of every card: `stub | verified | stale`.
Do not hand-edit `AGENTS.md` / `routing.md` here — they are byte-identical copies of this file.

## Where to go

| Task | Open |
|---|---|
| Understand a noun (contact, factoid, store, provider…) | `objects/_index.md`, then one card |
| Understand a movement | `processes/`: sync, ask-ai-turn, factoid-capture, merge-undo, export-import, release |
| About to change something | the card's **If you change this**; `effects/` is not written yet (slice 4) |
| Product vocabulary | `../CONTEXT.md` |
| Why a decision was made | `../docs/adr/` |
| What must stay true | `../harness/invariants.md` |
| Card/frontmatter rules | `_meta/schema.md`, `_templates/` |

## Universes

- **live** — in force; build against it.
- **leftover** — nothing at the moment. (The `chatgpt` provider and the built-in OpenAI default were removed in 1.84.0.)
- **ghost** — nothing at the moment. (`lib/ai/`, the contact extractor, `GENERATE_SUMMARIES` and the unused LinkedIn profile scrape were deleted in 1.84.5; I9 keeps `lib/ai` from coming back.)

Build output (`dist/`, `offscreen/offscreen.js`, `offscreen.js.map`) is **product**, not source: edit `offscreen-src.js`, rebuild.

## Name collisions (product ↔ code)

- Provider `local-openai` = the user's own OpenAI-compatible server, **live**, the only non-WebLLM provider. OpenAI is used only if the user enters its URL (ADR 0003).
- "Gmail" = Google Contacts scrape. "Query box" = text filter, not LLM. No LLM reads network lists.
- Factoid = `FactoidRow` in store `factoids`, not a field on `Contact` (`Contact.factoids` is memory-only).
