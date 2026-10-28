/**
 * Deterministic contact-name-mention detection and disambiguation for the contact-aware Ask AI
 * flow. No LLM involved — matches words in a message directly against real contact names/data
 * already in storage, so this step is reliable regardless of which model is selected.
 */
import { conversationSummaryPlatformLabel } from './conversation-summary-display.js';

/** Canonical display order, matching the sync toggles order in Settings. */
const PLATFORM_ORDER = ['linkedin', 'facebook', 'whatsapp', 'gmail'];

// Common English function words/pronouns — never meaningful as a name-match signal on their own,
// but common enough in both natural-language queries and junk/garbage scraped display names
// (e.g. a LinkedIn contact whose displayName ended up containing their whole tagline) that without
// this, a query like "What did diego and I last talk about" would match "and" against a contact
// named "...ITFM and FinOps Advisor" and "I" against anyone with a middle initial. Deliberately
// excludes modal verbs (will/may/can/...) since those double as common first names.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as',
  'is', 'was', 'are', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'doing', 'have', 'has', 'had', 'having',
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'ours', 'you', 'your', 'yours',
  'he', 'him', 'his', 'she', 'her', 'hers', 'it', 'its', 'they', 'them', 'their', 'theirs',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
  'not', 'no', 'so', 'than', 'then', 'there', 'here', 'up', 'down', 'out', 'about', 'into', 'over', 'under',
  'again', 'further', 'just', 'now',
]);

function normalizeWord(w) {
  return String(w || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

// Single-character tokens (bare initials like "I" or "J") and stopwords are excluded from both
// query words and contact name-tokens, since matching on them is essentially matching on noise.
function tokenize(text) {
  return String(text || '')
    .split(/\s+/)
    .map(normalizeWord)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

/** Name-tokens for a contact's displayName (e.g. "Christian Bach" -> ["christian", "bach"]). */
function nameTokensForContact(contact) {
  return tokenize(contact?.displayName || '');
}

/**
 * Find contacts whose name is mentioned (as a whole word) in `text`, keeping only the contacts
 * that match the *most* name-tokens. Used on a fresh message to detect "is this asking about
 * someone in my contacts" — intentionally name-only (not company/factoid matching) to avoid false
 * positives on generic questions that happen to share a word with some company name.
 *
 * Only keeping the best-scoring matches (rather than any match at all) matters because a query
 * like "Where does christian bach live?" would otherwise flag every contact named "Christian" as
 * equally likely as the one actually named "Christian Bach" — a single shared first name is a much
 * weaker signal than matching someone's full name.
 * @param {string} text
 * @param {import('../shared/types.js').Contact[]} contacts
 * @returns {import('../shared/types.js').Contact[]}
 */
export function resolveContactMention(text, contacts) {
  const words = new Set(tokenize(text));
  if (words.size === 0) return [];
  const scored = [];
  for (const contact of contacts || []) {
    const nameTokens = nameTokensForContact(contact);
    if (nameTokens.length === 0) continue;
    const count = nameTokens.filter((t) => words.has(t)).length;
    if (count > 0) scored.push({ contact, score: count });
  }
  return bestScoring(scored);
}

/**
 * Narrow an ambiguous set of candidates using a follow-up reply (e.g. "Bach" or "the guy who
 * works at Netlify"). Matches name tokens, LinkedIn company/headline, and factoid values as
 * substrings — broader matching is safe here since the search space is already a handful of
 * named candidates, not the whole contact database. Keeps only the best-scoring matches, same
 * reasoning as resolveContactMention.
 * @param {string} text
 * @param {import('../shared/types.js').Contact[]} candidates
 * @param {Record<string, import('../shared/types.js').FactoidRow[]>} [factoidsByContactId]
 * @returns {import('../shared/types.js').Contact[]}
 */
export function resolveDisambiguationReply(text, candidates, factoidsByContactId = {}) {
  const norm = String(text || '').toLowerCase().trim();
  if (!norm) return [];
  const words = new Set(tokenize(text));
  const scored = [];
  for (const contact of candidates || []) {
    const nameTokens = nameTokensForContact(contact);
    const nameMatchCount = nameTokens.filter((t) => words.has(t)).length;
    const company = (contact?.platforms?.linkedin?.company || '').toLowerCase().trim();
    const headline = (contact?.platforms?.linkedin?.headline || '').toLowerCase().trim();
    const fieldHit = (company && norm.includes(company)) || (headline && norm.includes(headline));
    const factoids = factoidsByContactId[contact.id] || [];
    const factoidHit = factoids.some((f) => {
      const v = String(f?.value || '').toLowerCase().trim();
      return v && norm.includes(v);
    });
    const score = nameMatchCount + (fieldHit ? 1 : 0) + (factoidHit ? 1 : 0);
    if (score > 0) scored.push({ contact, score });
  }
  return bestScoring(scored);
}

/** @param {Array<{ contact: import('../shared/types.js').Contact, score: number }>} scored */
function bestScoring(scored) {
  if (scored.length === 0) return [];
  const maxScore = Math.max(...scored.map((s) => s.score));
  return scored.filter((s) => s.score === maxScore).map((s) => s.contact);
}

/**
 * Short "Name (networks — context)" label for disambiguation prompts and a "currently discussing"
 * indicator — e.g. "Emilio Gallego (LinkedIn, Facebook, WhatsApp)" or, with company data,
 * "Emilio Gallego (LinkedIn, Facebook, WhatsApp — CEO at DICO Co., Ltd.)". The network list helps
 * distinguish same-named contacts that are legitimately different people (not duplicates to merge).
 * @param {import('../shared/types.js').Contact} contact
 * @param {import('../shared/types.js').FactoidRow[]} [factoids]
 */
export function describeContactForDisambiguation(contact, factoids = []) {
  const name = contact?.displayName || 'Unknown';
  const networks = PLATFORM_ORDER.filter((p) => contact?.platforms?.[p]).map((p) =>
    conversationSummaryPlatformLabel(p),
  );
  const company =
    contact?.platforms?.linkedin?.company ||
    contact?.platforms?.linkedin?.headline ||
    factoids.find((f) => /company|role|employer/i.test(f?.key || ''))?.value;
  const parts = [];
  if (networks.length) parts.push(networks.join(', '));
  if (company) parts.push(company);
  return parts.length ? `${name} (${parts.join(' — ')})` : name;
}
