/**
 * Shared data models for Supersimple Personal Relationship Manager
 */

/** @typedef {'gmail' | 'linkedin' | 'facebook' | 'whatsapp'} Platform */

/**
 * @typedef {Object} GmailProfile
 * @property {string[]} [absorbedIds] - Other contact ids folded into this blob by a same-platform merge; they still hold factoids
 * @property {string} email
 * @property {string} [name]
 * @property {string} [id] - Deterministic contact id when this platform was standalone (merge/undo)
 */

/**
 * @typedef {Object} LinkedInProfile
 * @property {string[]} [absorbedIds] - Other contact ids folded into this blob by a same-platform merge; they still hold factoids
 * @property {string} profileUrl
 * @property {string} [id] - Original contact id when this platform was standalone (for merge/undo)
 * @property {string} [name] - Display name from this platform (for undo restore)
 * @property {string} [headline]
 * @property {string} [company]
 * @property {string} [connectedOn] - ISO date when they connected on LinkedIn
 * @property {number} [commonConnectionCount] - Number of mutual/shared connections (for sorting)
 */

/**
 * @typedef {Object} FacebookProfile
 * @property {string[]} [absorbedIds] - Other contact ids folded into this blob by a same-platform merge; they still hold factoids
 * @property {string} profileUrl
 * @property {string} [id] - Original contact id when this platform was standalone (for merge/undo)
 * @property {string} [name] - Display name from this platform (for undo restore)
 * @property {number} [commonFriendCount] - Number of mutual friends (for sorting)
 */

/**
 * @typedef {Object} WhatsAppProfile
 * @property {string[]} [absorbedIds] - Other contact ids folded into this blob by a same-platform merge; they still hold factoids
 * @property {string} profileUrl
 * @property {string} chatKey
 * @property {boolean} isDirectChat
 * @property {string} [id] - Original contact id when this platform was standalone (for merge/undo)
 * @property {string} [name] - Display name from this platform (for undo restore)
 * @property {string} [phoneE164] - Number-like chat label when available
 */

/**
 * @typedef {Object} Factoid
 * @property {string} id
 * @property {string} key - e.g. 'location', 'job', 'birthday'
 * @property {string} value
 * @property {string} [source] - platform that provided this
 */

/**
 * Factoid row in storage - keyed by contactId so factoids can be synced to cloud without contact PII.
 * @typedef {Object} FactoidRow
 * @property {string} id
 * @property {string} contactId
 * @property {string} key
 * @property {string} value
 * @property {string} [source]
 */

/**
 * @typedef {Object} Contact
 * @property {string} id - UUID or deterministic id (e.g. linkedin:hash)
 * @property {string} displayName
 * @property {string} [primaryEmail] - From Gmail
 * @property {{ gmail?: GmailProfile, linkedin?: LinkedInProfile, facebook?: FacebookProfile, whatsapp?: WhatsAppProfile }} platforms
 * @property {Factoid[]} [factoids] - In memory only; persisted in factoids store keyed by contact id
 * @property {string} lastInteraction - ISO date string
 * @property {string} [addedAt] - ISO date string, when contact was first added
 * @property {string} [conversationSummary] - AI-generated (body only; no network prefix)
 * @property {string} [conversationSummaryPlatform] - e.g. linkedin | facebook | whatsapp — network for latest exchange
 * @property {number} [conversationSummaryAt] - ms since epoch of newest message in summarized thread (for cross-network pick)
 * @property {string[]} [recentAccesses] - ISO date strings of views in the contacts list (kept for last 30 days, for "most accessed" sort)
 */

/**
 * @typedef {Object} Message
 * @property {string} id
 * @property {string} from
 * @property {string} to
 * @property {string} body
 * @property {string} date - ISO date string
 * @property {boolean} [isFromMe]
 */

/**
 * @typedef {Object} Conversation
 * @property {string} id
 * @property {string} contactId
 * @property {Platform} platform
 * @property {string} threadId
 * @property {Message[]} messages
 * @property {string} [summary]
 */

/**
 * @typedef {Object} SyncState
 * @property {string} lastSync - ISO date string
 * @property {{ gmail?: { success: boolean, error?: string }, linkedin?: { success: boolean, error?: string }, facebook?: { success: boolean, error?: string }, whatsapp?: { success: boolean, error?: string } }} platformStatus
 */

/**
 * @typedef {Object} Settings
 * @property {'webllm' | 'ollama' | 'openai' | 'anthropic'} aiProvider
 * @property {string} [webllmModel] - e.g. 'Phi-2', 'TinyLlama'
 * @property {string} [apiKey] - Stored as plain text in chrome.storage.local (not encrypted); never synced
 * @property {number} [importLimit] - Debug: max contacts to import per sync (0 = no limit)
 * @property {number} [conversationRefreshMinutes] - Skip re-fetching a contact's conversations if fetched within this many minutes (0 = always refresh)
 */

export function generateId() {
  return crypto.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
