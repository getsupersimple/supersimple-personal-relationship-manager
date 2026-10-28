# 0001 — Local-first: contact data stays in the browser

Status: accepted (stated product principle; enforcement via `harness/invariants.md`)

## Decision

All contact data lives in one IndexedDB (`prm-contacts`) in the user's browser. Platform access uses the
user's own logged-in session. Inference runs locally (WebLLM) or on an endpoint the user configures
themselves (ADR 0003). No server operated by the project exists.

## Consequences

- No analytics, telemetry or hosted backend. A new outbound host needs an ADR.
- Data portability is by file: CSV export of everything; factoid export/import.

## Network permissions (owner decision 2026-10-27, revised)

Plain `http://*/*` (host permission) and `http://*:*` (`connect-src`) **stay for now** so a local LLM server can be
tested without a TLS certificate. This is a known, accepted deviation from the principle, frozen in
`harness/baselines.json` (check I5) so nothing else is added.

Revisit when local testing no longer needs it: either HTTPS-only, or `optional_host_permissions` requested per
endpoint (which would also let `https://*/*` go). Issue 02 is closed as "later", not "never".
