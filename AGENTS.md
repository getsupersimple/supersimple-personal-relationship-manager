# Supersimple Personal Relationship Manager – Agent Instructions

## Where things are

| Need | Go to |
|---|---|
| Vocabulary (contact, factoid, provider…) | `CONTEXT.md` |
| What is X / what else moves if I change X | `map/CLAUDE.md` |
| What must stay true, and its checks | `harness/invariants.md` |
| Why a decision was made | `docs/adr/` |

## Avoid Opening or Activating Tabs

**Avoid opening or activating tabs whenever possible.** This is a strong default, not an absolute ban.

- Prefer background work: service worker `fetch`, offscreen documents, and content scripts in pages the **user already opened themselves**.
- Do not navigate or change the URL of a tab the user opened (`chrome.tabs.update(..., { url })`, `location.href =`).
- If a tab is genuinely unavoidable (a scrape that needs the site's client JS to run), open it **inactive**, **close it when done**, and do it only through `withBackgroundTab` in `chrome-extension/lib/tab-scraper-utils.js`. Never `active: true` for new work.
- Every existing tab-using call site is listed in the baseline in `harness/invariants.md` (I1). Adding one means justifying it there.
- LinkedIn connections import uses background `fetch` only; do not open a tab for it.
- If the user explicitly asks for a specific tab to be opened or navigated, do exactly that and nothing more.

## Version Bump + Build (REQUIRED)

**Every time you make code changes**, you MUST:

0. Run `npm run verify` (static invariant checks + unit tests); fix failures before releasing.
1. Bump version: `python update-version.py bugfix` (or `minor` for features)
2. Build: `npm run build`

Chrome loads the extension from `dist/`, which is only updated by `npm run build`. Never skip the build after a version bump.

## Git Commit + Tag Each Release (REQUIRED)

A **release** = the version produced by the bump + build for the changes you just made. After that bump and build, you MUST:

1. Confirm git: `git rev-parse --is-inside-work-tree` → `true`.
2. Read **`chrome-extension/manifest.json`** → `"version"` (e.g. `1.19.1`). That string is the tag name.
3. Prepend an entry to **`CHANGELOG.md`** (just under the header block) for this version: `- **X.Y.Z** (YYYY-MM-DD) — <same summary as the commit message below>`. Use today's date. Newest entry always goes first.
4. `git add -A`
5. `git commit -m "chore: release X.Y.Z"` (or a message that clearly describes the change and includes the version).
6. Annotated tag, **same as manifest**: `git tag -a X.Y.Z -m "X.Y.Z"` (no `v` prefix).

Only commit/tag when there are changes to record. **Do not `git push`** unless the user explicitly asks.

## Git Repo Verification (REQUIRED)

At the start of work, verify this is a Git worktree by running:

`git rev-parse --is-inside-work-tree`

Expected output is `true`. Do not assume non-repo state without checking this command.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
