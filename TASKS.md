# Tasks

## Version History
- [x] Bump Minor version to 1.85.0 for one page-request delay setting for every paginator (default 1000 ms, minimum 250 ms) (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.84.7 for restore the LinkedIn delay between page requests (never below 250 ms) (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.84.6 for fix LinkedIn sync: parse LinkedIn's new connections response format (relative profile URLs, loading-state names) (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.84.5 for code cleanup: remove dead code, share duplicated helpers (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.84.4 for mark as alpha release (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.84.3 for show the logo next to the title in the popup and page headers (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.84.2 for add the app logo as the extension icon (16/32/48/128) (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.84.1 for rename product to Supersimple Personal Relationship Manager (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Minor version to 1.84.0 for remove built-in ChatGPT provider and OpenAI default; no names in factoid export; purge cached message text (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.83.4 for fix: same-platform merge no longer drops the kept contact's platform ID (absorbedIds) (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.83.3 for use token-based matching for @-mention search instead of raw substring (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.83.2 for fix @-mention dropdown resetting scroll on every arrow-key press (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.83.1 for fix @-mention search breaking on space and raise the suggestion cap (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Minor version to 1.83.0 for add @-mention autocomplete for unambiguous contact selection in Ask AI (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.82.2 for disclose hidden disambiguation candidates and suggest narrowing by last name (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.82.1 for format disambiguation candidate list as bullets instead of comma-separated (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Minor version to 1.82.0 for show every prompt and reply for the whole multi-pass turn in Ask AI, live (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.81.3 for add worked examples to CONTACT_ANSWER_PROMPT for conversation-summary questions and missing-fact placeholder substitution (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.81.2 for broadcast an early unfiltered prompt before the relevance pass, so Full prompt no longer waits through it (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.81.1 for stop duplicating the pending question in history on a disambiguation-resolving turn (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Minor version to 1.81.0 for multi-pass Ask AI: relevance pass narrows context before a minimal answer pass, extraction split into its own call (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.80.3 for fix LinkedIn message fetch picking wrong conversation via substring name search match (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.80.2 for fall back to a single user message when the edited full prompt has no role tags (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.80.1 for allow sending when only the full-prompt override is populated (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Minor version to 1.80.0 for editable live-preview textarea for Ask AI full prompt (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.79.3 for revert 1.79.0 prompt compression, regressed question-vs-fact classification (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.79.2 for broadcast the assembled prompt before the model call so Ask AI can show it while thinking (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.79.1 for show Full prompt link immediately under Thinking indicator (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Minor version to 1.79.0 for compress withContactContext/withUserNameContext scaffold for Gemma 3 1B token budget (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.78.1 for move Ask AI thinking/timing indicator to per-message placement in the transcript (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Minor version to 1.78.0 for Ask AI: show full prompt in a collapsible box and elapsed thinking time (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Minor version to 1.77.0 for drop carried-over Ask AI history for Gemma 3 1B contact-focused turns (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Minor version to 1.76.0 for experiment: raise Gemma 3 1B sliding_window_size from 512 to 2048 (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Minor version to 1.75.0 for add model selector to contacts factoid box and version footer to Ask AI page (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.74.15 for bug fixes (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.74.14 for bug fixes (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.74.13 for bug fixes (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.74.12 for bug fixes (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.74.11 for fix disambiguation escape hatch abandoning the original question when the reply ambiguously matches unrelated contacts (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.74.10 for fix 2B model replying Noted. to questions mentioning a factoid key instead of answering them (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.74.9 for restructure the Ask AI contact-answer prompt for a small model — labeled sections, one rule per line, XML-delimited data block (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.74.8 for rebalance the contact-answer prompt — it was over-correcting into refusing to use factoids that actually exist (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.74.7 for fix WebLLM engine never switching models after the first one loaded, and fix prompt examples getting echoed back as fabricated answers (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.74.6 for prevent cross-contact hallucination by dropping stale conversation history when Ask AI switches focus to a different contact (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.74.5 for fix Ask AI giving a bare 'Noted.' instead of answering the original question after resolving a disambiguation (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.74.4 for prevent Ask AI from inventing/hallucinating factoids on low-content or disambiguation-resolving turns (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.74.3 for fix layout shift between Add manually/Add with AI toggle states on the contact page (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.74.2 for auto-focus the prompt input on the Ask AI page (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.74.1 for fix factoid extraction misclassifying bare family-relationship statements as Notes instead of the matching key (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Minor version to 1.74.0 for factoid updates combine with an existing value instead of replacing it when the prompt signals additive intent (also/too/another) (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Minor version to 1.73.0 for default model to Gemma 2 2B, dedupe the redundant factoid-update confirmation text (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.72.2 for revert default model back to Qwen 2.5 1.5B — Gemma 3 1B's 512-token sliding window is too small for contact-context prompts and crashes (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.72.1 for fix Ask AI crash (exit code 1) — fold factoid extraction into the single chat completion instead of a second call to the same sliding-window-enabled engine (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Minor version to 1.72.0 for Ask AI updates or adds factoids when the user states a fact about the focused contact (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Minor version to 1.71.0 for make Gemma 3 1B the default WebLLM model on fresh installs (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.70.5 for correct the Gemma 3 1B window-size fix — disable our context_window_size override instead of the model's real sliding window, which was producing incoherent output (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.70.4 for fix Gemma 3 1B failing to load due to a sliding_window_size/context_window_size conflict (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.70.3 for move factoid description label onto the input as a placeholder (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.70.2 for contact page factoid add UI - arrow-icon parse button, manual entry hidden behind a toggle link (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.70.1 for fix Ask AI crash — offscreen document has no chrome.storage access, relay progress through the service worker instead (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Minor version to 1.70.0 for model download progress notification on Ask AI and a bottom banner on all pages (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.69.1 for fix new-install LinkedIn import defaulting to a 50-contact cap instead of unlimited (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Minor version to 1.69.0 for disable a network's sync toggle in Settings when not logged in (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Minor version to 1.68.0 for login-status indicators for LinkedIn/Facebook/WhatsApp/Gmail in the popup (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Minor version to 1.67.0 for rename product to Personal Relationship Manager, remove Rolodex trademark references (`manifest.json`, `popup.html`, `contacts.html`, `background/sw.js`)

- [x] Bump Minor version to 1.66.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.65.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.64.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.63.6 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.63.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.63.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.63.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.63.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.63.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.63.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.62.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.61.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.61.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.61.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.60.6 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`) — skipped 1.60.5, already used by the tag for the reverted dedup commit

- [x] Bump Bugfix version to 1.60.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.60.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.60.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.60.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.60.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`) — skipped 1.59.x, already used by tags from the abandoned experiment/gemma-4-webllm branch

- [x] Bump Minor version to 1.58.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.57.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.56.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.55.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.55.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.54.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.54.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.54.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.54.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.54.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.27 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.26 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.25 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.24 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.23 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.22 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.21 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.20 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.19 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.18 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.17 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.16 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.15 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.14 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.13 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.12 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.11 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.10 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.9 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.8 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.7 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.6 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.53.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.53.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.52.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.51.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.50.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.49.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.49.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.49.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.49.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.49.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.49.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.48.7 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.48.6 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.48.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.48.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.48.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.48.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.48.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.48.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.47.9 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.47.8 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.47.7 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.47.6 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.47.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.47.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.47.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.47.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.47.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.47.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.46.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.46.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.46.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.45.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.45.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.44.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.43.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.42.11 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.42.10 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.42.9 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.42.8 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.42.7 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.42.6 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.42.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.42.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.42.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.42.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.42.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.42.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.41.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.41.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.41.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.40.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.39.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.38.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.19 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.18 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.17 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.16 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.15 for Google Contacts: skip entries with email-as-name (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.14 for Google Contacts: remove debug instrumentation (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.13 for Google Contacts: remove blocking header wait before scroll (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.12 for Google Contacts: faster pre-scroll (parallel wait, shorter header cap) (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.11 for Google Contacts: prefer explicit scroll container xpath (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.10 for Google Contacts: gradual virtualized list scroll (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.9 for Google Contacts: header count fallback + relaxed scroll when no goal (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.8 for Google Contacts: scroll diag nudgeSamples + scrollEl probe (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.7 for Google Contacts: scrollIntoView + window scroll + wheel nudge (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.6 for Google Contacts: scroll main viewport + header-count guard (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.5 for Google Contacts: list root via role=presentation + text email fallback (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.5 for Google Contacts: list root via div[role=presentation] under body/div[9] (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.4 for Google Contacts: multi-candidate list root XPath + DOM probe (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.3 for manifest: CSP + host for debug ingest localhost (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.2 for Google Contacts: active tab during load + debug ingest logs (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.37.1 for Google Contacts: skip scrape when header count is (0) (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.37.0 for Gmail: Google Contacts tab scrape sync (contacts.google.com lists) (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.36.16 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.36.15 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.36.14 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.36.13 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.36.12 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.36.11 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.36.10 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.36.9 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.36.8 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.36.7 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.36.6 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.36.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.36.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.36.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.36.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.36.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.36.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.35.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.34.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.34.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.34.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.34.0 for WhatsApp: skip blocked, group markup, phone-only names (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.33.5 for WhatsApp list: div[role=row] + gridcell/ak8 selectors (real WA DOM) (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.33.4 for WhatsApp debug: full outerHTML in SW logs (no clip) (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.33.3 for WhatsApp scrape: log clipped list/row HTML to service worker (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.33.2 for WhatsApp scrape: remove height filter and div[N] row fallback (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.33.1 for WhatsApp scrape: row path fallback, relax height filter, waScrapeDiag (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.33.0 for WhatsApp list: indexed XPath rows, person vs group DOM, preview path (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.32.1 for WhatsApp scrape: console + SW logs for list row titles (debug) (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.32.0 for LinkedIn connections: NavigateToUrl-only parser (no elements[] fallback) (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.31.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.31.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.31.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.30.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.30.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.30.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.30.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.29.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.29.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.28.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.28.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.27.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.27.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.27.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.22 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.21 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.20 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.19 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.18 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.17 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.16 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.15 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.14 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.13 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.12 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.11 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.10 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.9 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.8 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.7 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.6 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.26.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.26.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.25.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.25.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.25.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.25.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.25.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.25.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.24.14 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.24.13 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.24.12 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.24.11 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.24.10 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.24.9 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.24.8 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.24.7 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.24.6 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.24.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.24.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.24.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.24.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.24.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.24.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.24.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.23.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.23.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.23.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.23.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.23.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.23.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.26 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.25 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.24 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.23 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.23 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.22 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.21 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.20 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.21 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.20 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.19 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.18 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.17 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.16 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.15 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.14 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.13 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.12 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.11 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.10 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.9 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.8 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.7 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.6 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.22.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.22.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.21.6 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.21.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.21.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.21.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.21.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.21.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.21.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.20.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.20.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.20.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.20.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.20.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.20.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.19.14 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.19.13 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.19.12 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.19.11 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.19.10 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.19.9 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.19.8 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.19.7 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.19.6 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.19.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.19.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.19.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.19.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.19.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.19.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.18.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.18.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.18.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.17.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.17.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.17.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.17.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.17.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.16.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.16.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.16.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.15.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.15.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.15.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.15.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.14.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.14.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.13.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.13.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.13.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.13.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.12.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.11.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.10.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.10.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.10.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.10.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.10.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.10.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.70 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.69 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.68 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.67 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.66 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.65 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.64 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.63 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.62 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.61 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.60 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.59 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.58 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.57 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.56 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.55 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.54 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.53 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.52 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.51 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.50 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.49 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.48 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.47 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.46 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.45 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.44 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.43 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.42 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.41 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.40 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.39 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.38 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.37 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.36 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.35 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.34 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.33 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.32 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.31 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.30 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.29 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.28 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.27 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.26 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.25 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.24 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.23 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.22 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.21 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.20 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.19 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.18 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.17 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.16 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.15 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.14 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.13 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.12 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.11 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.10 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.9 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.8 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.7 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.6 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.9.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.9.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.8.17 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.8.16 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.8.15 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.8.14 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.8.13 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.8.12 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.8.11 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.8.10 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.8.9 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.8.8 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.8.7 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.8.6 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.8.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.8.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.8.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.8.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.8.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.8.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.7.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.7.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.7.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.7.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.7.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.6.7 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.6.6 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.6.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.6.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.6.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.6.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.6.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.6.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.5.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.5.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.5.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.5.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.4.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.3.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.2.13 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.2.12 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.2.11 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.2.10 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.2.9 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.2.8 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.2.7 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.2.6 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.2.5 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.2.4 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.2.3 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.2.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.2.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.2.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.1.2 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.1.1 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Minor version to 1.1.0 for new features (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.27 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.26 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.25 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.24 for add pagination extractor stub and call it from Sync (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.23 for log that fetch-only path has no scrolling (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.22 for add detailed logging for sync and parse path (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.21 for fix CSP: remove inline style from settings (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.20 for add rule: no tabs or URL changes unless asked (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.19 for remove background tab path; keep sync fully background (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.18 for use background tab when import limit set so scroll runs (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.17 for add verbose logging for LinkedIn scrolling extraction (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.16 for scroll LinkedIn connections page until import limit reached (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.15 for add debug import limit setting (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.14 for show LinkedIn connected date in contact list (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.13 for add addedAt field to contact list (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.12 for include pages in build, Open Rolodex opens in new tab (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.11 for add build step to version instructions (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.10 for add AGENTS.md and .cursorrules version reminders (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.9 for strengthen version-management rule (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.8 for bug fixes (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.7 for remove seed contacts (John Doe, Jane Smith) (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.6 for add IndexedDB storage logging (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.5 for IndexedDB storage - Rolodex uses storage directly for DevTools visibility (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.4 for use chrome.storage.local - IndexedDB not visible in extension context (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.3 for popup uses IndexedDB directly for DevTools visibility (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)

- [x] Bump Bugfix version to 1.0.2 for revert to IndexedDB storage (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)


- [x] Bump Bugfix version to 1.0.1 for version management setup (`manifest.json`, `popup.html`, `rolodex.html`, `background/sw.js`)
