---
type: object
name: Google Contacts source (called Gmail in code)
code_name: `syncGmail`, `lib/gmail-processor.js`, `lib/google-contacts-tab-scrape.js`
universe: live
cluster: platforms
status: stale
verified_on: 2026-10-27
verified_at: f9af543
owner_files: [chrome-extension/background/sw.js, chrome-extension/lib/google-contacts-tab-scrape.js, chrome-extension/lib/gmail-processor.js, chrome-extension/lib/gmail-message-tab-scrape.js]
---

# Google Contacts source (called Gmail in code)

Contacts read by scraping contacts.google.com lists in tabs; keyed by email. The code and storage call this platform `gmail`.

## Why this shape

Gmail address lists are the one place Google exposes a person's email without an API key.

## Shape

- `syncGmail` (`sw.js:3026`): for each of `GOOGLE_CONTACTS_SYNC_URLS`, `scrapeGoogleContactsPageViaBackgroundTab` (`lib/google-contacts-tab-scrape.js`), dedupe by email, `processGmailContacts` (`lib/gmail-processor.js:36`).
- **Opens a tab with `active: true`** and later re-activates the previous one (`google-contacts-tab-scrape.js:126,140,957`) — baselined deviation from the tab rule (I1; issue 03).
- ID: hash of lower-cased trimmed email (`gmail-processor.js:28-31`). Rows without `@` are dropped.
- Message lookup in Gmail: `lib/gmail-message-tab-scrape.js` (activates a tab, `:42`).
- **Pacing:** `syncGmail` waits the shared page delay (`getPaginationDelayMs`) between the list pages it loads one after another (not before the first).

## Connected to

- owns: `gmail` platform blob, `primaryEmail`.

## If you change this

**Hits:** email-based merge across networks, Gmail Contact IDs, the tab baseline.
**Does not hit:** Facebook/LinkedIn/WhatsApp; the Gmail mailbox itself is not read for contacts.

## Surfaces

Sync button.

## See

`chrome-extension/lib/gmail-processor.js`, `chrome-extension/background/sw.js:3026`
