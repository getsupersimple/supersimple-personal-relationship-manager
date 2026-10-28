# Supersimple Personal Relationship Manager

**Your contacts. Your data. Your control.**

A Chrome extension that gathers your contacts from LinkedIn, Facebook, WhatsApp Web and Google Contacts into one
database that lives in your browser (IndexedDB). Search them offline, keep private notes about people ("factoids"),
and ask a local AI about them. Nothing is sent to a server we run, because there isn't one.

> **Alpha release.** This extension is under active development; expect rough edges and back up your data
> (Settings → export CSV) before updating.

## What it does

- **Collects contacts** with your own logged-in browser sessions: LinkedIn and Facebook friends by background
  requests, WhatsApp Web chats and Google Contacts by reading those pages in a short-lived background tab.
- **Merges** the same person across networks so they appear once (and can be un-merged).
- **Factoids**: short facts about a contact ("Moved to Turkey with his wife Linda"). A local language model turns
  your sentence into key/value facts. They are stored separately, keyed only by a stable contact ID, so a factoid
  export can be re-applied to a clean contact import.
- **Ask AI**: chat about one contact; the model sees only that contact's factoids and recent conversation summaries.
- **Latest message** per network, fetched on demand and summarized locally.
- **CSV export/import** of everything: per network, all contacts, and factoids.

## Quick start

```bash
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked** → choose the `dist` folder.
Sign in to the networks you want in the same browser, click the extension icon, then **Sync Now**.

The first AI use downloads the selected WebLLM model (roughly 1–2 GB for the default, more for larger models). It needs WebGPU.

## AI and privacy

- Default: a WebLLM model runs inside the browser (Settings → Model).
- Optional: **Local LLM** sends requests to an OpenAI-compatible server *you* enter (Ollama, LM Studio, or any URL,
  including OpenAI if you choose to enter its address and key). Nothing is contacted unless you set it.
- Contact data stays in IndexedDB. Details and the rules we hold ourselves to: [docs/adr/](docs/adr/) and
  [harness/invariants.md](harness/invariants.md).

## Development

| Task | Command |
|---|---|
| Build the extension into `dist/` | `npm run build` |
| Watch-build the service worker and pages | `npm run dev` |
| Invariant checks and unit tests | `npm run verify` (or `npm test` for tests only) |
| Regenerate icons from `assets/logo.png` | `npm run generate-icons` |
| New version | `python update-version.py bugfix` (or `minor`) |

Release steps, the no-new-tabs rule and other agent rules are in [AGENTS.md](AGENTS.md). Vocabulary is in
[CONTEXT.md](CONTEXT.md); a map of what each part is and what else moves when you change it is in
[map/CLAUDE.md](map/CLAUDE.md).

```
chrome-extension/   source: manifest, background/sw.js, offscreen/ (WebLLM host), popup/, pages/, lib/, shared/
dist/               built extension (load this)
harness/            invariant checks, baselines, unit tests
docs/adr/           architecture decisions
map/                edit map (objects and processes)
assets/logo.png     app logo
```
