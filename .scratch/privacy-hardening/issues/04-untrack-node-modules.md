# node_modules is tracked in git

Status: needs-triage

Found 2026-10-27: `git ls-files node_modules | wc -l` is ~4250 and `.gitignore` does not list `node_modules/`.
`npm install` therefore dirties tracked files (`node_modules/.package-lock.json`) and every dependency bump
is a huge diff. Proposed: add `node_modules/` to `.gitignore` and `git rm -r --cached node_modules` in its own
commit. Needs an owner call (history size, anyone relying on vendored modules).
