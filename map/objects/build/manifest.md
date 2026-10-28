---
type: object
name: Manifest, CSP and host permissions
code_name: `chrome-extension/manifest.json`
universe: live
cluster: build
status: stale
verified_on: 2026-10-27
verified_at: 1.84.0
owner_files: [chrome-extension/manifest.json]
---

# Manifest, CSP and host permissions

Declares permissions, hosts and CSP; the extension's privacy boundary on paper.

## Why this shape

Chrome enforces it, so it is the strongest statement of what the extension can reach.

## Shape

- Permissions: `storage, offscreen, cookies, scripting, activeTab, tabs`.
- Hosts: Facebook, WhatsApp, Google, LinkedIn, Hugging Face (model download), raw.githubusercontent.com, **`http://*/*`, `https://*/*`**. The explicit `api.openai.com` entries were removed in 1.84.0 (the wildcard still covers any host the user types). CSP `connect-src` also allows `http://*:*` and `https://*:*`.
- MV3 module service worker `background/sw.js`; popup action; `web_accessible_resources` exposes the offscreen page to `<all_urls>`.
- Decision (ADR 0001, revised 2026-10-27): plain `http` stays for now so local servers can be tested without a certificate; narrowing is a follow-up.

## Connected to

- joins: sync, AI endpoints, model download.

## If you change this

**Hits:** any new host, any provider, store review; I5.
**Does not hit:** runtime code (no code reads the manifest).

## Surfaces

Chrome.

## See

`chrome-extension/manifest.json`
