/**
 * Contact ids that hold factoids/conversations for this contact (main id + merged-in platform ids, including
 * `platforms.*.absorbedIds`).
 * @param {import('../shared/types.js').Contact} contact
 * @returns {string[]}
 */
export function getEffectiveContactIds(contact) {
  if (!contact?.id) return [];
  const ids = [contact.id];
  for (const blob of Object.values(contact.platforms || {})) {
    // blob.id is the most recently merged-in identity; absorbedIds are earlier ones folded into the same blob.
    for (const id of [blob?.id, ...(Array.isArray(blob?.absorbedIds) ? blob.absorbedIds : [])]) {
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}
