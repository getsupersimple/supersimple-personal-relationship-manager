/**
 * Shared factoid key-normalization and merge logic — used by the Contacts page's LLM-parse
 * factoid entry and by Ask AI's "update a factoid from what was just said" behavior, so both
 * agree on what counts as a duplicate key and how "Notes" factoids combine instead of overwrite.
 */

export const NOTES_KEY_CANONICAL = 'Notes';
export const NOTES_SEPARATOR = '. ';
const VALUE_LIST_SEPARATOR = ', ';

/** @param {string} k */
export function factoidKeyNorm(k) {
  return (k || '').trim().toLowerCase();
}

/** @param {string} k */
export function isNotesKey(k) {
  const n = factoidKeyNorm(k);
  return n === 'note' || n === 'notes';
}

/** Words signaling the new fact adds to an existing value rather than replacing it (e.g. "Chris
 * also has a son named Jeff" when Children is already "Julia" should become "Julia, Jeff"). */
const ADDITIVE_SIGNAL_RE = /\b(also|too|as well|another|additionally)\b/i;

/** @param {string} text */
export function looksAdditive(text) {
  return ADDITIVE_SIGNAL_RE.test(text || '');
}

/**
 * @param {string} oldValue
 * @param {string} newValue
 */
function combineFactoidValues(oldValue, newValue) {
  const old = (oldValue || '').trim();
  const next = (newValue || '').trim();
  if (!old) return next;
  if (!next) return old;
  const parts = old.split(',').map((p) => p.trim().toLowerCase());
  if (parts.includes(next.toLowerCase())) return old;
  return `${old}${VALUE_LIST_SEPARATOR}${next}`;
}

/**
 * Merge LLM-parsed {key, value} candidates into an existing factoid list: updates a matching
 * key's value if it changed, appends (or combines, for Notes) new ones, leaves everything else
 * untouched. Pure function — the caller persists the result (and refreshes any UI).
 * @param {Array<{id?: string, key: string, value: string, source?: string}>} existing
 * @param {Array<{key: string, value: string}>} parsed
 * @param {string} [source] - tag applied to added/changed rows
 * @param {boolean} [additive] - combine with the existing value (comma-joined) instead of
 *   replacing it, for a matching non-Notes key whose value actually changed. Notes always
 *   combine regardless of this flag; unaffected keys are unaffected either way.
 * @returns {{ merged: Array<{id?: string, key: string, value: string, source?: string}>, addedCount: number, updatedCount: number, changed: Array<{key: string, value: string}> }}
 */
export function mergeParsedFactoids(existing, parsed, source = 'llm', additive = false) {
  const merged = (existing || []).map((f) => ({ ...f }));
  let addedCount = 0;
  let updatedCount = 0;
  const changed = [];
  for (const p of parsed || []) {
    const keyTrim = (p.key || '').trim();
    const valueTrim = (p.value || '').trim();
    if (!keyTrim || !valueTrim) continue;
    const idx = isNotesKey(keyTrim)
      ? merged.findIndex((f) => isNotesKey(f.key))
      : merged.findIndex((f) => factoidKeyNorm(f.key) === factoidKeyNorm(keyTrim));
    if (idx >= 0) {
      if (isNotesKey(keyTrim)) {
        const combined = merged[idx].value ? merged[idx].value + NOTES_SEPARATOR + valueTrim : valueTrim;
        if (merged[idx].value !== combined) {
          merged[idx] = { ...merged[idx], key: NOTES_KEY_CANONICAL, value: combined, source };
          updatedCount++;
          changed.push({ key: merged[idx].key, value: merged[idx].value });
        }
      } else if (merged[idx].value !== valueTrim) {
        const nextValue = additive ? combineFactoidValues(merged[idx].value, valueTrim) : valueTrim;
        if (merged[idx].value !== nextValue) {
          merged[idx] = { ...merged[idx], value: nextValue, source };
          updatedCount++;
          changed.push({ key: merged[idx].key, value: merged[idx].value });
        }
      }
    } else {
      const row = { key: isNotesKey(keyTrim) ? NOTES_KEY_CANONICAL : keyTrim, value: valueTrim, source };
      merged.push(row);
      addedCount++;
      changed.push({ key: row.key, value: row.value });
    }
  }
  return { merged, addedCount, updatedCount, changed };
}
