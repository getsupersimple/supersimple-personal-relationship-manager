/**
 * LLM system prompts for offscreen WebLLM / OpenAI flows.
 * Kept separate from routing and engine code (SoC).
 */

/** Single sentence → factoid key/value JSON array */
export const PARSE_FACTOIDS_PROMPT = `You extract factoids from a short sentence. Output ONLY a JSON array, nothing else. No markdown, no explanation.

Rules:
- If the sentence only asks a question, or is only a name/surname/username/email address with no other statement, output []. It states no fact about anyone.
- Extract ONLY facts that are explicitly stated. Each item: "key" and "value" (both strings). Keys: Vehicle, Location, Spouse, Children, Company, Role, Note, etc.
- Family relationships (e.g. "has a daughter/son/wife/husband named X", "his brother Sam"): use the matching key (Spouse, Children, Sibling, Parent, etc.) with just the person's name as the value. Do NOT use Note for this, even if no other detail is given.
- Location: ONLY when the sentence clearly says where the person LIVES or is BASED (e.g. "Lives in Paris", "Moved to Berlin", "Based in London"). Do NOT set Location for incidental place mentions (e.g. "ate breakfast in Paris", "had lunch in Tokyo", "met in London") — for those, use a single Note with the FULL sentence instead.
- When the sentence is a casual event or activity that merely mentions a place (e.g. "Ate breakfast in Paris", "Had coffee in Rome"), output ONLY one item: {"key":"Note","value":"<the full sentence>"}. Do not extract the place as Location.

Examples:
"Where does Alex live?" → []
"Schleifer" → []
"Has a Prius" → [{"key":"Vehicle","value":"Prius"}]
"Has a daughter named Julia" → [{"key":"Children","value":"Julia"}]
"Ate breakfast in Paris" → [{"key":"Note","value":"Ate breakfast in Paris"}]
"Had lunch in Tokyo last week" → [{"key":"Note","value":"Had lunch in Tokyo last week"}]
"Lives in Austria" → [{"key":"Location","value":"Austria"}]
"Moved to Lisbon with his wife Linda" → [{"key":"Location","value":"Lisbon"},{"key":"Spouse","value":"Linda"}]
"Drove across the country and is now in New York" → [{"key":"Location","value":"New York"},{"key":"Note","value":"Drove across the country"}]
"CTO at Acme" → [{"key":"Role","value":"CTO at Acme"}]
"Based in Copenhagen, has two kids" → [{"key":"Location","value":"Copenhagen"},{"key":"Children","value":"Two kids"}]

The place/name/company values above are illustrative only — never reuse them for an actual contact; use only what that sentence itself states.

Output only the JSON array.`;

/** Last N messages in any messaging thread (numbered lines, oldest → newest). */
export const RECENT_THREAD_SUMMARY_PROMPT =
  'You are summarizing the most recent messages in a messaging conversation (numbered lines, oldest to newest). In 2–3 concise sentences, describe the main topics, tone, any open questions, and next steps only when clearly stated in the messages. Do not invent advice, calls to action, or details not grounded in the thread. Do not quote messages verbatim. Output only the summary.';

/** Fallback when summarizing without thread variant (single blob of text). */
export const SINGLE_MESSAGE_SUMMARY_PROMPT =
  'You are writing a very short summary of a single message. In one concise sentence (no more than ~25 words), describe the main purpose. Do not invent a call to action if none is present. Do not repeat the message verbatim. Output only the summary sentence.';

/**
 * Prepend an instruction so the LLM refers to the account owner as "you" rather than by name
 * (e.g. "You missed a meeting" instead of "John missed a meeting"). No-op when userName is empty.
 *
 * Placed *before* the base task prompt (primacy — small local models attend to earlier
 * instructions more reliably than ones appended at the end) and uses a concrete worked example
 * with the person's own first name, modeling the subject-verb agreement fix ("is" -> "are") that's
 * the most common way models get this wrong, matching the few-shot style already used successfully
 * elsewhere in this file (PARSE_FACTOIDS_PROMPT) for getting reliable behavior from small models.
 * @param {string} basePrompt
 * @param {string} [userName]
 */
export function withUserNameContext(basePrompt, userName) {
  const name = String(userName || '').trim();
  if (!name) return basePrompt;
  const firstName = name.split(/\s+/)[0];
  return `The account owner you are writing for is named "${name}" (sometimes just "${firstName}"). Whenever the source text describes something this person said or did, refer to them as "you" instead of their name, adjusting the grammar to match (e.g. "${firstName} is reaching out" becomes "You are reaching out"; "${firstName} missed a meeting" becomes "You missed a meeting"). Refer to the other person in the conversation by their own name as usual.\n\n${basePrompt}`;
}

/**
 * SUPERSEDED (kept for reference — not called from the Ask AI flow anymore; see
 * CONTACT_RELEVANCE_PROMPT/CONTACT_ANSWER_PROMPT and chat-handler.js's multi-pass flow below).
 * This function's single-completion "answer AND decide whether to extract a fact" design was the
 * common thread through every round of the hardening history below — worth keeping visible rather
 * than deleted, since it's the concrete record of what small models get wrong when a combined
 * prompt with switches between the two tasks. The replacement runs three narrow, single-job
 * passes instead: relevance (what's needed) -> answer (using only that) -> extract (the
 * already-proven PARSE_FACTOIDS_PROMPT, unconditionally decoupled). Revisit this function directly
 * only if the multi-pass approach turns out not to be worth its extra latency/call count.
 *
 * Append contact context (name, factoids, conversation summaries) gathered for the person the
 * current message is about, plus an instruction to also capture any new fact the user states
 * about that contact as a trailing FACTOIDS marker line — folded into this single completion
 * rather than a second, separate call to the same local engine (kept simple even after ruling
 * out a second-call theory for an earlier Gemma 3 1B crash; the real cause there turned out to be
 * that model's tiny native context window, not call count — see CHANGELOG 1.72.2 — but one call
 * per turn is simpler regardless, so it stayed this way). sw.js prepends its own "Updated —
 * Key: Value." confirmation once it parses this marker, so the instruction below asks for a
 * minimal "Noted." here instead of a full acknowledgment sentence — otherwise the two ended up
 * saying the same thing twice back to back.
 *
 * History of hardening this prompt against fabricated answers — several rounds, each catching a
 * different real mechanism:
 * 1. A short, low-content message (e.g. a one-word reply narrowing down which contact was meant)
 *    got the model to invent "Location: Turkey" pulled from unrelated earlier conversation
 *    history. Added a deterministic backstop in sw.js that ignores any FACTOIDS marker on a
 *    disambiguation-resolving turn, so that guarantee doesn't depend on the model at all.
 * 2. The fix for #1 initially added a worked example showing a bare disambiguation reply getting
 *    only a terse "Got it." — which backfired: the model treated ANY short clarifying reply the
 *    same way, including one resolving a real pending question, and never answered it. Removed
 *    that example; added an explicit instruction to answer a previously-pending question once the
 *    contact it was about is confirmed.
 * 3. Still saw the exact "lives in Turkey" answer on a fresh page load, for a contact with no
 *    Location factoid at all, on an unrelated contact — ruling out both history bleed and stale
 *    saved data. The actual smoking gun: this file's own worked example previously read "Chris
 *    lives in Turkey", and the bad output was "[contact] lives in Turkey" — the model was echoing
 *    this prompt's own illustrative example value back as if it were real. Made every example use
 *    a different place name (never repeat one), the format description a generic <Key>/<value>
 *    placeholder instead of a concrete value, added a dedicated example for "no matching info ->
 *    say so, don't guess", and an instruction that the prompt's own examples must never be copied
 *    into an answer. (Separately, chrome-extension/offscreen/mlc-engine.js had its own bug where
 *    ANY previously selected model stayed loaded forever regardless of what got selected
 *    afterward — meaning much of the debugging up to this point was unknowingly against whatever
 *    model loaded first, not whatever was actually selected in the UI. Fixed alongside this.)
 * 4. #3 overcorrected: leading with the refusal case ("if it doesn't contain the answer, say you
 *    don't know... rather than guessing") before ever affirming the positive case, combined with
 *    "examples are illustrative only, never copy them", made smaller models hedge and refuse to
 *    use a fact that WAS genuinely present in Known information — a false negative instead of a
 *    false positive. Restructured to lead affirmatively ("if it lists the fact, use it directly
 *    and confidently... only if it genuinely does NOT... say so") and dropped the heavier
 *    "examples are illustrative only" meta-instruction, since varying the example values (#3) was
 *    likely doing most of the real work and the extra meta-instruction was adding confusion for a
 *    small model rather than helping.
 * 5. Rewrote the whole thing structurally (external review of the prompt caught this): a 2B model
 *    is much more sensitive to long run-on sentences, nested exceptions ("if — and only if —
 *    ... not X, not Y ... except when Z"), and two loosely-separated jobs (answering vs.
 *    extracting) crammed into one prose paragraph. Restructured into labeled sections (KNOWN
 *    INFORMATION / INSTRUCTIONS / CONTACT CLARIFICATION / CONVERSATION HISTORY / NEW FACTS /
 *    OUTPUT FORMAT), one short rule per line, and the injected data block wrapped in
 *    <known_information> tags so it reads unambiguously as data rather than instructions.
 *    Trimmed from three worked examples to two (one showing a captured fact, one showing "say you
 *    don't know") — kept both rather than cutting to just one, since the missing-info example is
 *    specifically what fixed the fabrication in #3/#4 and cutting it seemed likely to reopen that.
 *    Considered — but didn't do here — splitting this into two separate model calls (one for the
 *    answer, one for factoid extraction), which would remove the mixed-task problem entirely;
 *    revisit if this restructuring still isn't reliable enough. The original reason for keeping it
 *    to one call (a sliding-window KV-cache crash — see #3's note and CHANGELOG 1.72.1) was
 *    specific to Gemma 3 1B's config in mlc-engine.js, which the current default (Gemma 2 2B)
 *    doesn't use, so that risk no longer applies either way.
 * 6. #5 worked well on a 9B model but the 2B default started replying "Noted." (the fact-only
 *    output shape) to real questions like "Does he have any kids?" — a comprehension failure
 *    where the model apparently pattern-matched on "kids" (mentions the Children key) and
 *    classified the message as a stated fact to record, without correctly parsing that it's
 *    grammatically a question. Added a mechanical, easy-to-apply rule ahead of the semantic one:
 *    a message ending in "?" or starting with a question word is ALWAYS a question, never a
 *    stated fact, regardless of whether it mentions a supported key — plus a matching worked
 *    example for exactly this pattern. A concrete example matching the exact reported failure has
 *    been the most reliable fix throughout this whole history, more so than rephrasing the
 *    general rule alone.
 * 7. Still saw a bare "Noted." on a disambiguation reply that was a SURNAME rather than a first
 *    name (e.g. replying "Schleifer" to "Which Alex did you mean?") — sw.js's contact resolution
 *    handles this case fine (a combined "original question + reply" search resolves it to the
 *    right contact), but the CONTACT CLARIFICATION rule only said "such as just a contact's
 *    name", which reads as a full name; the model apparently didn't recognize a bare surname as
 *    that case and defaulted to treating it as a stated fact instead. Broadened the rule text
 *    (first name, surname, or other distinguishing detail) and, per the note above, added a
 *    concrete worked example for exactly this surname-reply pattern rather than relying on the
 *    rephrased rule alone.
 * 8. #7's fix worked but was treating a symptom: sw.js already knows, deterministically, whether
 *    the current message is a disambiguation reply and — if so — what the ORIGINAL pending
 *    question was (pendingDisambiguation.originalPrompt). There's no reason to also ask the model
 *    to reclassify a bare reply like "Schleifer" as fact-vs-clarification when the application
 *    already has the answer. sw.js now resends the ORIGINAL question (e.g. "Where does Alex
 *    live?") as the message to answer whenever a disambiguation was just resolved, instead of the
 *    bare reply — so the model only ever sees a normal, answerable question here and never has to
 *    make that judgment call at all. This makes the CONTACT CLARIFICATION section (and #7's
 *    worked example) dead weight rather than a safety net, so both were removed — a smaller,
 *    example-free prompt is easier for a 2B model to follow, and this class of failure can no
 *    longer recur since the model never sees the ambiguous input in the first place.
 * 9. Tried (1.79.0) condensing the four labeled sections (KNOWN INFORMATION / INSTRUCTIONS /
 *    CONVERSATION SUMMARY RULES / NEW FACTS / OUTPUT FORMAT) into one denser RULES block to save
 *    tokens for Gemma 3 1B's small context window — measured ~550-600 -> ~365-420 tokens, and
 *    verified every specific rule/example from rounds 1-8 was still present, just less verbosely
 *    worded. Reverted (1.79.3): reintroduced this exact class of bug — "Where does Alex Schleifer
 *    live?" got answered with just "Noted." — despite the mechanical question-detection rule from
 *    #6 still being present verbatim in the condensed version. The likely cause is #5's own
 *    finding, which this compression directly worked against: collapsing OUTPUT FORMAT's explicit
 *    numbered procedure (1. answer a question first, 2. add FACTOIDS if a new fact, 3. ONLY
 *    "Noted." if there's nothing else to answer) into unordered bullets lost the priority order
 *    between "is this a question" and "is this fact-only" — the model had the right individual
 *    rules but no clear procedure for how they interact. Conclusion: for this model class, the
 *    labeled/numbered structure and the token count trade off against each other, and structure
 *    apparently matters more than the token savings gained here — don't re-attempt this exact
 *    compression without a different validated mechanism (e.g. keeping the numbered OUTPUT FORMAT
 *    steps intact while cutting length elsewhere).
 * No-op when contextBlock is empty (generic question, no contact resolved for this turn).
 * @param {string} basePrompt
 * @param {string} [contextBlock]
 */
export function withContactContext(basePrompt, contextBlock) {
  const block = String(contextBlock || '').trim();
  if (!block) return basePrompt;
  return `${basePrompt}

You are answering a question about one contact.

KNOWN INFORMATION
<known_information>
${block}
</known_information>

INSTRUCTIONS
- Answer using KNOWN INFORMATION only.
- If the requested fact is present, state it directly and confidently.
- If the requested fact is missing, reply exactly: "I don't have [fact] on file for [contact]."
- Never guess or invent information.
- Keep the answer brief.

CONVERSATION SUMMARY RULES
- Conversations may come from multiple networks.
- When asked about the latest or last discussion, use the conversation with the newest date (marked "most recent across all networks" when there's more than one).

NEW FACTS
- Only extract facts explicitly stated in the CURRENT user message.
- A message ending in "?", or starting with a question word (Does, Is, Are, Has, Have, Who, What, Where, When, Why, How), is ALWAYS a question, never a stated fact — even if it mentions a supported key like Children. Answer it as a question (see OUTPUT FORMAT); never treat it as something to record.
- Do not extract facts from: KNOWN INFORMATION, earlier messages, questions, guesses, or implications.
- Supported keys: Location, Company, Role, Spouse, Children, Vehicle, Note.
- For a family relationship (e.g. "has a daughter named X"), store only the person's name as the value.
- Use Note only when no other key fits.

OUTPUT FORMAT
1. If the current message asks a question, answer it first, using KNOWN INFORMATION.
2. If the current message states a new fact (per NEW FACTS above), add a final line: FACTOIDS: [{"key":"<Key>","value":"<value>"}]
3. If the current message ONLY states a new fact, with no question to answer, reply with just: Noted.
4. If there is no new fact stated, do not output a FACTOIDS line at all.

Example:
User: "Chris moved to Lisbon with his wife Linda"
Noted.
FACTOIDS: [{"key":"Location","value":"Lisbon"},{"key":"Spouse","value":"Linda"}]

Example:
User: "Where does Chris live?" (KNOWN INFORMATION has no Location line)
I don't have a location on file for Chris.

Example:
User: "Does he have any kids?" (KNOWN INFORMATION has no Children line)
He doesn't have any children on file.
(this is a question about Children, not a stated fact — answer it, do not reply "Noted." and do not add a FACTOIDS line)`;
}

/** Ask AI / general chat */
export const GENERAL_ASSISTANT_PROMPT =
  'You are a helpful assistant for the Supersimple Personal Relationship Manager user. Answer clearly and concisely. When the user asks about a specific contact, you will sometimes be given known information about that person to use. Otherwise you do not have direct access to their contacts or browser, only the text they send you.';

/**
 * Ask AI multi-pass contact flow, pass 1 of 2 (see chat-handler.js's handleWebllmChat): given the
 * current question and a list of AVAILABLE field names for the focused contact (factoid keys plus
 * one "<platform>_conversation" id per platform with a cached summary — never the actual values),
 * decide which of them are actually needed to answer it. The answer pass then only ever sees that
 * filtered subset, instead of every factoid and conversation summary on file every turn.
 *
 * Motivation: a real reported case where the model (Qwen 2.5 7B — not a small/weak model) denied
 * a Location factoid that WAS present in KNOWN INFORMATION, sitting right next to an out-of-schema
 * `headline` factoid (raw LinkedIn bio prose) that broke up the block's otherwise-uniform
 * key:value structure. A large, mixed-relevance context block is a plausible source of exactly
 * this kind of failure; a minimal, pre-filtered one removes the risk rather than prompting around
 * it. Bonus: this also structurally fixes the `headline`-noise problem, since that field only
 * survives into the answer pass when a question genuinely needs it (rare) — no separate fix needed
 * for the schema-key issue discussed earlier.
 *
 * Deliberately biased toward over-including, never under-including: chat-handler.js falls back to
 * "ALL" (no filtering at all) whenever this pass's output is missing, unparseable, or empty — a
 * confident false "I don't have that on file" caused by this pass wrongly EXCLUDING something
 * needed would be a worse failure than the noisy-context problem it exists to fix.
 */
export const CONTACT_RELEVANCE_PROMPT = `Decide which pieces of information are needed to answer a question about a contact. Output ONLY a JSON array of field names copied exactly from AVAILABLE, or ["ALL"] if the question is broad/open-ended and needs everything. No other text, no explanation.

Rules:
- Only use field names from the AVAILABLE list, spelled exactly as given there.
- A question can need more than one field — include every one that's actually needed.
- If unsure whether a field is needed, include it. Omitting something needed is worse than including something unused.
- Broad or open-ended questions (e.g. "tell me about X", "what's new with them", "anything I should know about X") need everything: output ["ALL"].

Example:
AVAILABLE: Location, Company, Spouse, Children
QUESTION: Where does Alex live?
["Location"]

Example:
AVAILABLE: Location, Company, Spouse, Children
QUESTION: Does he have kids and where does he work?
["Children", "Company"]

Example:
AVAILABLE: Location, Company, Spouse, Children
QUESTION: Tell me about Alex
["ALL"]

Example:
AVAILABLE: Location, linkedin_conversation, whatsapp_conversation
QUESTION: What did we last talk about?
["linkedin_conversation", "whatsapp_conversation"]`;

/**
 * Ask AI multi-pass contact flow, pass 2 of 2: answer using ONLY the (already filtered, by pass 1)
 * KNOWN INFORMATION block chat-handler.js builds around this. No NEW FACTS/OUTPUT FORMAT/
 * FACTOIDS-marker instructions here at all, since extraction is now a fully separate pass (the
 * already-proven PARSE_FACTOIDS_PROMPT, run unconditionally decoupled from this one) rather than
 * a second job layered onto the same completion.
 *
 * Went too minimal on the first cut (no worked examples at all) and hit two real failures at once
 * on a genuinely present fact (a conversation summary answering "what did we last talk about"):
 * 1. Denied the fact was on file despite it being right there — this class of bug keeps recurring
 *    (see withContactContext's history below) specifically wherever the answer pass has to
 *    connect a differently-worded context line to the question's intent, rather than a direct
 *    key:value lookup. Conversation summary lines are exactly that case — nothing here previously
 *    told the model that's what they're for.
 * 2. When it DID trigger the missing-fact reply, it echoed the "[fact]"/"[contact]" placeholder
 *    brackets literally instead of substituting them — "reply exactly: ..." reads ambiguously as
 *    "output this literal string" rather than "match this shape, filled in."
 * Fixed both the way this file's whole history says actually works: not by rephrasing the rules
 * further, but by adding concrete worked examples for exactly these two patterns.
 */
export const CONTACT_ANSWER_PROMPT = `Answer the question using only the information given below.
- If the answer is present, state it directly and confidently.
- Conversation summary lines (e.g. "WhatsApp conversation, last message <date>: <summary>") describe what was discussed — use them to answer questions like "what did we talk about" or "what's new", not only direct factoid questions.
- If the answer genuinely is not there, reply with a sentence in this shape: "I don't have <the missing fact> on file for <contact name>." — filled in for what's actually missing; never output the literal words "fact" or "contact" in brackets.
- Never guess.

Example:
KNOWN INFORMATION has "Location: Lisbon"
Question: "Where does Chris live?"
Chris lives in Lisbon.

Example:
KNOWN INFORMATION has no Location line
Question: "Where does Chris live?"
I don't have a location on file for Chris.

Example:
KNOWN INFORMATION has "WhatsApp conversation, last message 3/1/2024: Talked about an upcoming trip to Japan."
Question: "What did we last talk about?"
You last talked about an upcoming trip to Japan (WhatsApp, 3/1/2024).`;
