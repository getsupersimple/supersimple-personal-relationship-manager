import { normalizeFacebookProfileUrlKey } from './facebook-profile-url.js';
import { normalizeLinkedInProfileUrl } from './linkedin-url.js';
import { getEffectiveContactIds } from './contact-effective-ids.js';

/**
 * Contact deduplication - merge contacts from multiple platforms
 * Same email = same person; fuzzy match by name+company for LinkedIn-only.
 * WhatsApp list imports (id whatsapp:…) only merge with the same chat (matching
 * chatKey) or same id — not email/name/Facebook — so each chat is its own row
 * until the user manually merges across networks.
 */

/**
 * Normalize string for comparison
 * @param {string} s
 * @returns {string}
 */
function normalize(s) {
  if (!s || typeof s !== 'string') return '';
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * @param {string | undefined} name
 * @returns {boolean}
 */
function isUnknownName(name) {
  return normalize(name || '') === 'unknown';
}

/**
 * Heuristic for names that look URL-slug-derived (digits/disambiguator tail).
 * @param {string | undefined} name
 * @returns {boolean}
 */
function looksSlugDerivedDisplayName(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  if (/\b\d{4,}\b/.test(n)) return true;
  if (n.includes('-')) return true;
  return false;
}

/**
 * Contacts from the WA conversation-list scrape use deterministic ids whatsapp:… .
 * @param {import('../shared/types.js').Contact | undefined} c
 * @returns {boolean}
 */
function isWhatsAppTabImportContact(c) {
  return typeof c?.id === 'string' && c.id.startsWith('whatsapp:') && Boolean(c.platforms?.whatsapp);
}

/**
 * Stable key for LinkedIn URL equality (matches pagination + contact id hashing: protocol/www stripped).
 * @param {import('../shared/types.js').Contact} c
 */
function linkedInProfileCompareKey(c) {
  const raw = c.platforms?.linkedin?.normalizedProfileUrl || c.platforms?.linkedin?.profileUrl || '';
  const n = normalizeLinkedInProfileUrl(raw);
  return n ? n.toLowerCase() : '';
}

/**
 * @param {import('../shared/types.js').Contact} existing
 * @param {import('../shared/types.js').Contact} incoming
 * @returns {boolean}
 */
function isSamePerson(existing, incoming) {
  // Deterministic IDs (e.g. linkedin:linkedin.com/in/slug) mean same person.
  if (existing.id && incoming.id && existing.id === incoming.id) {
    return true;
  }
  // An id folded into a merged contact earlier (platforms.*.absorbedIds) must not come back as a second row on re-sync.
  if (incoming.id && getEffectiveContactIds(existing).includes(incoming.id)) {
    return true;
  }
  // If both contacts have LinkedIn profile URLs and they differ, never merge by fuzzy name/company.
  // This prevents distinct LinkedIn connections from collapsing when names are similar or missing.
  const existingLiKey = linkedInProfileCompareKey(existing);
  const incomingLiKey = linkedInProfileCompareKey(incoming);
  if (existingLiKey && incomingLiKey && existingLiKey !== incomingLiKey) {
    return false;
  }
  // Two LinkedIn connection rows: match only when profile URLs match (same id already handled above).
  // Never use name/company heuristics — "Unknown" + empty company would collapse hundreds of people.
  if (existing.platforms?.linkedin && incoming.platforms?.linkedin) {
    return Boolean(existingLiKey && incomingLiKey && existingLiKey === incomingLiKey);
  }
  if (isWhatsAppTabImportContact(incoming)) {
    const existingWaKey = normalize(existing.platforms?.whatsapp?.chatKey || '');
    const incomingWaKey = normalize(incoming.platforms?.whatsapp?.chatKey || '');
    if (existingWaKey && incomingWaKey && existingWaKey === incomingWaKey) {
      return true;
    }
    return false;
  }
  if (existing.primaryEmail && incoming.primaryEmail) {
    return normalize(existing.primaryEmail) === normalize(incoming.primaryEmail);
  }
  if (existing.primaryEmail && incoming.platforms?.gmail?.email) {
    return normalize(existing.primaryEmail) === normalize(incoming.platforms.gmail.email);
  }
  if (incoming.primaryEmail && existing.platforms?.gmail?.email) {
    return normalize(incoming.primaryEmail) === normalize(existing.platforms.gmail.email);
  }
  if (existing.platforms?.gmail?.email && incoming.platforms?.gmail?.email) {
    return normalize(existing.platforms.gmail.email) === normalize(incoming.platforms.gmail.email);
  }
  const existingFbUrl = normalize(normalizeFacebookProfileUrlKey(existing.platforms?.facebook?.profileUrl || ''));
  const incomingFbUrl = normalize(normalizeFacebookProfileUrlKey(incoming.platforms?.facebook?.profileUrl || ''));
  if (existingFbUrl && incomingFbUrl && existingFbUrl === incomingFbUrl) return true;
  const existingWaKey = normalize(existing.platforms?.whatsapp?.chatKey || '');
  const incomingWaKey = normalize(incoming.platforms?.whatsapp?.chatKey || '');
  if (existingWaKey && incomingWaKey && existingWaKey === incomingWaKey) return true;
  const existingName = normalize(existing.displayName);
  const incomingName = normalize(incoming.displayName);
  if (existingName && incomingName && existingName === incomingName) {
    const existingCompany = normalize(existing.platforms?.linkedin?.company || '');
    const incomingCompany = normalize(incoming.platforms?.linkedin?.company || '');
    if (existingCompany && incomingCompany && existingCompany === incomingCompany) {
      return true;
    }
    if (!existingCompany && !incomingCompany) return true;
  }
  return false;
}

/**
 * Merge two contacts - prefer existing id, merge platforms and factoids
 * @param {import('../shared/types.js').Contact} existing
 * @param {import('../shared/types.js').Contact} incoming
 * @returns {import('../shared/types.js').Contact}
 */
export function mergeContacts(existing, incoming) {
  const platforms = { ...existing.platforms };
  if (incoming.platforms?.gmail) {
    const existingGm = existing.platforms?.gmail || {};
    const incomingGm = incoming.platforms?.gmail || {};
    const mergedName =
      String(incomingGm.name || '').trim() || String(existingGm.name || '').trim() || undefined;
    platforms.gmail = {
      ...existingGm,
      ...incomingGm,
      email: String(incomingGm.email || existingGm.email || '').trim(),
      ...(mergedName ? { name: mergedName } : {}),
    };
  }
  if (incoming.platforms?.linkedin) {
    const existingLi = existing.platforms?.linkedin || {};
    const incomingLi = incoming.platforms?.linkedin || {};
    const incomingCount = incomingLi.commonConnectionCount;
    const existingCount = existingLi.commonConnectionCount;
    const bestCount =
      typeof incomingCount === 'number' && typeof existingCount === 'number'
        ? Math.max(incomingCount, existingCount)
        : incomingCount ?? existingCount;
    platforms.linkedin = {
      ...existingLi,
      ...incomingLi,
      connectedOn: existingLi.connectedOn || incomingLi.connectedOn,
      ...(typeof bestCount === 'number' && { commonConnectionCount: bestCount }),
    };
  }
  if (incoming.platforms?.facebook) {
    const existingFb = existing.platforms?.facebook || {};
    const incomingFb = incoming.platforms?.facebook || {};
    const existingFbCount = existingFb.commonFriendCount;
    const incomingFbCount = incomingFb.commonFriendCount;
    const bestFbCount =
      typeof incomingFbCount === 'number' && typeof existingFbCount === 'number'
        ? Math.max(incomingFbCount, existingFbCount)
        : incomingFbCount ?? existingFbCount;
    platforms.facebook = {
      ...existingFb,
      ...incomingFb,
      ...(typeof bestFbCount === 'number' && { commonFriendCount: bestFbCount }),
    };
  }
  if (incoming.platforms?.whatsapp) {
    const existingWa = existing.platforms?.whatsapp || {};
    const incomingWa = incoming.platforms?.whatsapp || {};
    platforms.whatsapp = {
      ...existingWa,
      ...incomingWa,
      isDirectChat: incomingWa.isDirectChat ?? existingWa.isDirectChat ?? true,
    };
  }

  // Both sides have this platform: the spreads above made the incoming blob's `id` win. Keep every other identity
  // that was folded into the blob so factoids stored under it stay reachable (see getEffectiveContactIds).
  for (const key of Object.keys(platforms)) {
    const ex = existing.platforms?.[key];
    const inc = incoming.platforms?.[key];
    if (!ex || !inc) continue;
    const absorbed = [ex.id, inc.id, ...(ex.absorbedIds || []), ...(inc.absorbedIds || [])].filter(
      (id, i, all) => id && id !== platforms[key].id && all.indexOf(id) === i,
    );
    if (absorbed.length > 0) platforms[key] = { ...platforms[key], absorbedIds: absorbed };
    else delete platforms[key].absorbedIds;
  }

  const factoidIds = new Set(existing.factoids?.map((f) => f.key + ':' + f.value) || []);
  const factoids = [...(existing.factoids || [])];
  for (const f of incoming.factoids || []) {
    const key = f.key + ':' + f.value;
    if (!factoidIds.has(key)) {
      factoidIds.add(key);
      factoids.push(f);
    }
  }

  const existingAccesses = existing.recentAccesses || [];
  const incomingAccesses = incoming.recentAccesses || [];
  const mergedAccesses = [...existingAccesses, ...incomingAccesses]
    .filter((ts) => ts && !isNaN(new Date(ts).getTime()))
    .sort()
    .filter((ts, i, a) => i === 0 || ts !== a[i - 1]);
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentAccesses = mergedAccesses
    .filter((ts) => new Date(ts).getTime() >= thirtyDaysAgo)
    .slice(-500);

  const existingName = String(existing.displayName || '').trim();
  const incomingName = String(incoming.displayName || '').trim();
  const existingLooksSlug = looksSlugDerivedDisplayName(existingName);
  const incomingLooksUnknown = isUnknownName(incomingName) || !incomingName;
  let mergedDisplayName = existingName || incomingName;
  if (existingLooksSlug && !incomingLooksUnknown) {
    mergedDisplayName = incomingName;
  }

  return {
    ...existing,
    displayName: mergedDisplayName,
    primaryEmail: existing.primaryEmail || incoming.primaryEmail,
    platforms,
    factoids,
    lastInteraction:
      new Date(incoming.lastInteraction) > new Date(existing.lastInteraction || 0)
        ? incoming.lastInteraction
        : existing.lastInteraction,
    addedAt: existing.addedAt || incoming.addedAt,
    ...(recentAccesses.length > 0 && { recentAccesses }),
  };
}

/**
 * @param {import('../shared/types.js').Contact[]} existing
 * @param {import('../shared/types.js').Contact[]} incoming
 * @returns {{ contacts: import('../shared/types.js').Contact[], idMapping: Record<string, string> }}
 */
export function deduplicateAndMerge(existing, incoming) {
  const result = [...existing];
  const idMapping = {};
  for (const inc of incoming) {
    const idx = result.findIndex((e) => isSamePerson(e, inc));
    if (idx >= 0) {
      const kept = result[idx];
      result[idx] = mergeContacts(kept, inc);
      if (inc.id !== kept.id) idMapping[inc.id] = kept.id;
    } else {
      result.push(inc);
    }
  }
  return { contacts: result, idMapping };
}
