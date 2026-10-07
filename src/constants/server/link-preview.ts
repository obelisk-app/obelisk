/**
 * Server: link preview. Values the code in
 * `services/server/link-preview/rate-limit.ts`,
 * `services/server/link-preview/safe-fetch.ts` reads, kept here so every
 * reader imports the one copy.
 */

export const RATE_LIMIT = 30;

export const RATE_WINDOW_MS = 60_000;

/** Stop reading a page after this. OG tags live in <head>; nothing past this is useful. */
export const MAX_BYTES = 512 * 1024;

export const FETCH_TIMEOUT_MS = 6_000;

export const MAX_REDIRECTS = 3;

export const UA = 'Mozilla/5.0 (compatible; ObeliskBot/1.0; +https://obelisk.ar)';
