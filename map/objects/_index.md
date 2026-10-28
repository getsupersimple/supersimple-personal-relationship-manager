# Object index

One line per noun. `verified` cards cite source at the commit in their frontmatter; `stale` means a source file changed since (re-verify before trusting line numbers). `npm run verify` (I11) keeps this index in step with the cards. Cards are created from `../_templates/object.md`.

## storage
- stale · live · [storage/contacts-store.md](storage/contacts-store.md)
- stale · live · [storage/conversations-store.md](storage/conversations-store.md)
- stale · live · [storage/sync-state-store.md](storage/sync-state-store.md)
- stale · live · Factoid / `factoids` store — [storage/factoids-store.md](storage/factoids-store.md)
- stale · live · [storage/db-open-and-migration.md](storage/db-open-and-migration.md)

## identity
- stale · live · Contact ID — [identity/contact-id.md](identity/contact-id.md)
- stale · live · [identity/merge-dedup.md](identity/merge-dedup.md)
- stale · live · [identity/effective-ids.md](identity/effective-ids.md)
- verified · live · [identity/mention-resolver.md](identity/mention-resolver.md)

## platforms
- stale · live · [platforms/linkedin.md](platforms/linkedin.md)
- stale · live · [platforms/facebook.md](platforms/facebook.md)
- stale · live · [platforms/whatsapp.md](platforms/whatsapp.md)
- stale · live · Google Contacts ("Gmail" in code) — [platforms/google-contacts.md](platforms/google-contacts.md)
- verified · live · [platforms/background-tab-helper.md](platforms/background-tab-helper.md)
- stale · live · [platforms/csv-import-export.md](platforms/csv-import-export.md)

## ai
- stale · live · [ai/offscreen-engine.md](ai/offscreen-engine.md)
- stale · live · [ai/provider-selection.md](ai/provider-selection.md)
- stale · live · [ai/prompts.md](ai/prompts.md)
- stale · live · [ai/chat-handler.md](ai/chat-handler.md)
- stale · live · [ai/factoid-parse-and-merge.md](ai/factoid-parse-and-merge.md)
- verified · live · OpenAI-compatible client (user's own server, no default host) — [ai/openai-compatible-client.md](ai/openai-compatible-client.md)
- verified · live · Shared LLM call (`runChatCompletion`, provider context) — `offscreen/llm-client.js`
- verified · live · Model ids and dropdown list — `lib/model-ids.js`, `lib/webllm-model-select.js`

## surfaces
- stale · live · [surfaces/service-worker.md](surfaces/service-worker.md)
- verified · live · [surfaces/popup.md](surfaces/popup.md)
- stale · live · Contacts page + search box — [surfaces/contacts-page.md](surfaces/contacts-page.md)
- verified · live · [surfaces/ask-ai-page.md](surfaces/ask-ai-page.md)
- stale · live · [surfaces/settings-page.md](surfaces/settings-page.md)

## build
- stale · live · [build/manifest.md](build/manifest.md)
- stale · live · [build/build-pipeline.md](build/build-pipeline.md)
- stale · live · [build/version-bump.md](build/version-bump.md)
