/**
 * Relay: relay roles model. Values the code in
 * `utils/relay/relay-roles-model.ts` reads, kept here so every reader imports
 * the one copy.
 */

export const DEFAULT_ROLE_COLOR = '#b4f953';

export const MAX_ROLES = 24;

export const ROLE_ID_RE = /^[a-z0-9_-]{1,32}$/;

/** Badge glyphs are display-only, so cap the length and drop whitespace. */
export const MAX_ROLE_EMOJI_LENGTH = 8;
