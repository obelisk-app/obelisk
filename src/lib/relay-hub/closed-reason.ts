/**
 * How the subscription registry reads a relay's CLOSED reason. Pure string
 * classification, kept apart from the registry so it can be tested and
 * reused without a socket.
 */

/**
 * The reason nostr-tools' pool reports when a REQ was CLOSED `auth-required:`,
 * it ran `relay.auth(onauth)` and re-issued, and that failed. The inner
 * reason follows the colon.
 */
const AUTH_ATTEMPTED_PREFIX = 'auth was required and attempted, but failed with:';

export type ClosedReasonClass = 'auth' | 'restricted' | 'quota' | 'other';

export function isQuotaReason(reason: string): boolean {
  const r = reason.toLowerCase();
  return /too many|rate.?limit|quota|max.*subscriptions|slow down/.test(r);
}

/**
 * How the registry reads a relay CLOSED reason. `auth` covers a bare
 * `auth-required:` and nostr-tools' attempted-and-failed wrapper around one;
 * a wrapper around `restricted:` is the relay's final answer, so `restricted`.
 */
export function classifyClosedReason(reason: string): ClosedReasonClass {
  if (reason.startsWith(AUTH_ATTEMPTED_PREFIX)) {
    const inner = reason.slice(AUTH_ATTEMPTED_PREFIX.length).trim();
    return inner.startsWith('restricted:') ? 'restricted' : 'auth';
  }
  if (reason.startsWith('auth-required:')) return 'auth';
  if (reason.startsWith('restricted:')) return 'restricted';
  if (isQuotaReason(reason)) return 'quota';
  return 'other';
}
