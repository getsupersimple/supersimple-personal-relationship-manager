# Privacy hardening

Status: ready-for-human

Implements owner decisions of 2026-10-27 (ADR 0001, 0003). Goal: the extension never contacts a vendor or host
the user did not choose, and requests no broader network access than it uses.

Out of scope: salting Contact IDs (ADR 0002 tension), narrowing `https://*/*` to optional permissions.
Each code change follows the release rule in `AGENTS.md` (bump, build, changelog, commit, tag).
