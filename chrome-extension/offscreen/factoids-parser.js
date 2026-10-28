/**
 * Shared parsing and normalization for LLM-produced factoids JSON.
 */

/**
 * @param {string} out
 * @returns {string}
 */
function extractLikelyJsonArray(out) {
  let text = String(out || '').trim();
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) text = codeBlock[1].trim();

  let depth = 0;
  let start = -1;
  let end = -1;
  let inString = false;
  let escape = false;
  const quote = (c) => c === '"' || c === "'";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (quote(c) && !inString) {
      inString = c;
      continue;
    }
    if (quote(c) && inString === c) {
      inString = false;
      continue;
    }
    if (inString) continue;
    if (c === '[') {
      if (depth === 0) start = i;
      depth++;
      continue;
    }
    if (c === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  let jsonStr = start >= 0 && end >= start ? text.slice(start, end + 1) : text;
  jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
  return jsonStr;
}

/**
 * @param {unknown} arr
 * @returns {Array<{ key: string, value: string }>}
 */
function normalizeFactoidsArray(arr) {
  const inArr = Array.isArray(arr) ? arr : (arr && typeof arr === 'object' ? [arr] : []);
  return inArr
    .filter(
      (x) =>
        x &&
        (typeof x.key === 'string' || typeof x.key === 'number') &&
        (typeof x.value === 'string' || typeof x.value === 'number'),
    )
    .map((x) => ({ key: String(x.key).trim(), value: String(x.value).trim() }))
    .filter((x) => x.key && x.value);
}

/**
 * Keep legacy fallback behavior for location/note inference.
 * @param {Array<{ key: string, value: string }>} factoids
 * @param {string} content
 * @returns {Array<{ key: string, value: string }>}
 */
function applyFactoidFallbacks(factoids, content) {
  let out = [...factoids];

  if (out.length === 0 && content) {
    const locationMatch =
      content.match(/\b(?:lives in|based in|located in)\s+(.+?)(?:\s*[.,]|$)/i) ||
      content.match(/^(?:lives in|based in|located in)\s+(.+)$/i);
    if (locationMatch) {
      const value = locationMatch[1].trim();
      if (value.length > 0 && value.length < 100) out = [{ key: 'Location', value }];
    } else {
      out = [{ key: 'Note', value: content.slice(0, 500) }];
    }
  }

  const contentIndicatesResidence = /^(lives in|moved to|based in|located in)\b/i.test(content.trim());
  const hadLocation = out.some((f) => (f.key || '').trim().toLowerCase() === 'location');
  if (!contentIndicatesResidence && hadLocation && content.length > 0) {
    out = out.filter((f) => (f.key || '').trim().toLowerCase() !== 'location');
    const noteIdx = out.findIndex((f) => {
      const k = (f.key || '').trim().toLowerCase();
      return k === 'note' || k === 'notes';
    });
    const fullNote = { key: 'Note', value: content.slice(0, 500) };
    if (noteIdx >= 0) out[noteIdx] = fullNote;
    else out.push(fullNote);
  }

  return out;
}

/**
 * Parse and normalize factoids from a model response body.
 * @param {string} rawModelOutput
 * @param {string} sourceContent
 * @returns {{ ok: true, factoids: Array<{ key: string, value: string }> } | { ok: false, error: string }}
 */
export function parseFactoidsOutput(rawModelOutput, sourceContent) {
  const content = String(sourceContent || '').trim().slice(0, 500);
  const jsonStr = extractLikelyJsonArray(String(rawModelOutput || ''));

  let parsed = null;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (_) {
    try {
      parsed = JSON.parse(jsonStr.replace(/'/g, '"'));
    } catch (__) {
      return { ok: false, error: 'LLM returned invalid JSON. Try a shorter or simpler description.' };
    }
  }

  const normalized = normalizeFactoidsArray(parsed);
  const factoids = applyFactoidFallbacks(normalized, content);
  return { ok: true, factoids };
}
