# Remove plain-HTTP wildcard permissions

Status: wontfix (for now)

Owner decision 2026-10-27: keep `http://*/*` and `http://*:*` so local servers can be tested without a certificate.
Frozen in `harness/baselines.json`; ADR 0001 records it. Revisit with per-endpoint `optional_host_permissions`.
