---
type: object
name: WhatsApp source
code_name: `syncWhatsApp`, `lib/whatsapp-*.js`
universe: live
cluster: platforms
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/background/sw.js, chrome-extension/lib/whatsapp-store-scrape.js, chrome-extension/lib/whatsapp-tab-scrape.js, chrome-extension/lib/whatsapp-processor.js]
---

# WhatsApp source

One-to-one chats listed by scraping a background tab of WhatsApp Web: the in-page store first, the DOM as fallback.

## Why this shape

WhatsApp has no public API; the page's own data is the only source, so a tab is required.

## Shape

- `syncWhatsApp` (`sw.js:3089`): `scrapeWhatsAppChatListViaStoreInBackgroundTab`, falling back to `scrapeWhatsAppConversationListViaBackgroundTab(WHATSAPP_WEB_URL)`; keeps rows with `name` and `chatKey`; imports with `processWhatsAppConnections` (`lib/whatsapp-processor.js:36`). The sw log says "markup rules, no AI filter".
- Both scrapes go through `withBackgroundTab` (inactive).
- ID: hash of lower-cased `chatKey`. Each chat is its own contact; it merges only with the same `chatKey` or ID (`lib/dedup.js:48-50` and the early rule in `isSamePerson`, `:62-`) until the user merges manually.
- Thread reading: `lib/whatsapp-thread-tab-scrape.js`.

## Connected to

- owns: `whatsapp` platform blob.

## If you change this

**Hits:** WhatsApp Contact IDs, the tab baseline (I1), WhatsApp Web markup/store drift.
**Does not hit:** Other platforms; dedup rules for other networks.

## Surfaces

Sync button.

## See

`chrome-extension/lib/whatsapp-processor.js`, `chrome-extension/background/sw.js:3089`
