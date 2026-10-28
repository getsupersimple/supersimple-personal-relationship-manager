# Stop activating tabs in scrapes

Status: needs-info

Read 2026-10-27: both sites activate tabs on purpose. `google-contacts-tab-scrape.js` logs "load + hydrate while
visible" and re-activates the tab before each attempt; the Gmail scrape activates after load. Both pages virtualize
their lists, which do not render in background tabs. Making them inactive would likely break sync and cannot be
verified without live Google sessions. Left as-is and documented in `harness/invariants.md` (I1).

To close: someone with live accounts tries inactive tabs; if the list still renders, switch; if not, mark wontfix.
