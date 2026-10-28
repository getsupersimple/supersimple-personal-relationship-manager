/**
 * Processes Facebook friends list from content script. Merges with existing contacts via dedup.
 */
import { storage } from './storage.js';
import { deduplicateAndMerge } from './dedup.js';
import { normalizeFacebookProfileUrlKey } from './facebook-profile-url.js';
import { contactIdFromIdentifier } from './contact-id.js';

const LOG = (...args) => console.log('[PRM facebook-processor]', ...args);

function contactIdFromProfileUrl(profileUrl) {
  return contactIdFromIdentifier('facebook', normalizeFacebookProfileUrlKey(profileUrl));
}

/**
 * @param {Array<{ name: string, profileUrl: string, commonFriendCount?: number }>} connections
 */
export async function processFacebookConnections(connections) {
  LOG('processFacebookConnections: received', connections?.length, 'connections');
  if (connections?.length) {
    const sample = connections.slice(0, 3).map((c) => ({ name: c.name, profileUrl: (c.profileUrl || '').slice(0, 60) }));
    LOG('processFacebookConnections: sample', sample);
  }
  const now = new Date().toISOString();
  const contacts = (connections || []).map((c) => {
    const profileUrl = (c.profileUrl || '').trim();
    const normalizedProfileUrl = normalizeFacebookProfileUrlKey(profileUrl);
    if (!normalizedProfileUrl) return null;
    const commonCount = typeof c.commonFriendCount === 'number' && c.commonFriendCount >= 0 ? c.commonFriendCount : undefined;
    const contactId = contactIdFromProfileUrl(profileUrl);
    const fbPlatform = {
      profileUrl: profileUrl.startsWith('http') ? profileUrl : `https://www.facebook.com/profile.php?id=${profileUrl}`,
      id: contactId,
      name: (c.name || '').trim() || undefined,
    };
    if (commonCount !== undefined) fbPlatform.commonFriendCount = commonCount;
    return {
      id: contactId,
      displayName: (c.name || '').trim() || 'Unknown',
      primaryEmail: undefined,
      platforms: {
        facebook: fbPlatform,
      },
      factoids: [],
      lastInteraction: now,
      addedAt: now,
    };
  }).filter(Boolean);

  LOG('processFacebookConnections: after normalize', contacts.length, 'contacts (valid profileUrl)');
  let existing = await storage.getAllContacts();
  if (existing.length === 0 && contacts.length > 0) {
    LOG('processFacebookConnections: getAllContacts returned 0; retrying once (possible cold start)');
    existing = await storage.getAllContacts();
  }
  LOG('processFacebookConnections: existing contacts:', existing.length);
  const { contacts: merged } = deduplicateAndMerge(existing, contacts);
  LOG('processFacebookConnections: after dedup, merged count:', merged.length);
  try {
    await storage.saveContacts(merged);
    LOG('processFacebookConnections: saved', merged.length, 'contacts');
  } catch (e) {
    LOG('processFacebookConnections: saveContacts FAILED:', e);
    throw e;
  }
}
