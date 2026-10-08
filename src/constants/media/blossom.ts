/**
 * Media: blossom. Values the code in `services/media/blossom.ts` reads, kept
 * here so every reader imports the one copy.
 */

/** Public profile images, emoji and other recognizable media. */
export const BLOSSOM_SERVERS = [
  'https://blossom.primal.net',
  'https://nostr.build',
  'https://blossom.band',
];

/**
 * Servers for encrypted DM attachments, a separate list on purpose.
 *
 * Every server above sniffs the upload and only stores recognisable media:
 * measured 2026-09-26, primal and blossom.band answer 415 to
 * `application/octet-stream` (and 400 "does not match the file content" if
 * the ciphertext is labelled as an image), and nostr.build returns an HTML
 * page. AES-GCM ciphertext is indistinguishable from random bytes, so it can
 * never pass that check. These two store arbitrary blobs from a key they have
 * never seen, serve them back byte-for-byte with `Access-Control-Allow-Origin:
 * *`, and were verified with 4 KB and 3 MB round trips the same day.
 */
export const ENCRYPTED_BLOSSOM_SERVERS = [
  'https://nostr.download',
  'https://blossom.yakihonne.com',
];
