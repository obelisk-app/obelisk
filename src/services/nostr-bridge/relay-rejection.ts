/**
 * Pure parsers for relay CLOSED reasons and publish-rejection messages.
 * They map free-text relay replies to a {@link RelayAccessState}; nothing
 * here touches sockets or bridge state, so the pattern bank can be tested
 * on strings alone.
 */
import type { RelayAccessState } from './types';

/**
 * Map a CLOSED reason or publish-rejection message to a RelayAccessState.
 * Returns `null` if the reason is benign (e.g. local close) so callers leave
 * the existing state untouched. Pattern bank derives from common relay
 * implementations: strfry, nostream, nostrudel, gnost-relay.
 */
export function isRelayQuotaOrRateLimit(reason: string): boolean {
  const r = reason.toLowerCase();
  return (
    r.includes('rate limit') ||
    r.includes('rate-limit') ||
    r.includes('too many') ||
    r.includes('slow down') ||
    r.includes('quota') ||
    r.includes('concurrent')
  );
}

export function parseRelayRejection(reason: string): RelayAccessState | null {
  const r = reason.toLowerCase();
  // Rate-limit / quota messages often ship with the "restricted:" prefix
  // (e.g. "restricted: connection rate limit exceeded", "restricted:
  // Subscription quota exceeded: 50/50", "ERROR: too many concurrent REQs").
  // They are transient (not a pubkey-allowlist signal), and classifying
  // them as 'restricted' would wrongly flash "Not whitelisted" to legitimate
  // users.
  if (isRelayQuotaOrRateLimit(reason)) return null;
  // nostr-tools' wrapper when its own AUTH-and-resubscribe failed (signer
  // threw, AUTH timed out, or the relay answered OK false). The relay's OK
  // reason, if any, is inside: classify that; otherwise it's an AUTH problem.
  const AUTH_FAILED = 'auth was required and attempted, but failed with: ';
  if (r.startsWith(AUTH_FAILED)) {
    return parseRelayRejection(reason.slice(AUTH_FAILED.length)) ?? 'auth-required';
  }
  if (r.includes('auth-required') || r.includes('auth_required') || r.includes('auth required')) {
    return 'auth-required';
  }
  if (
    r.includes('restricted') ||
    r.includes('blocked') ||
    r.includes('not allowed') ||
    r.includes('not whitelisted') ||
    r.includes('whitelist') ||
    r.includes('forbidden')
  ) {
    return 'restricted';
  }
  return null;
}

/**
 * Classify a CLOSED reason for the relay-access indicator, using what
 * nostr-tools already did with it before we saw it.
 *
 * On a sub that carries `onauth`, nostr-tools swallows a CLOSED whose
 * reason starts with `auth-required: `, runs NIP-42 AUTH, and resubscribes
 * (abstract-pool.js `subscribeMap`). If AUTH fails we get `auth was required
 * and attempted, but failed with: …` instead. So a bare `auth-required: `
 * reaching us on such a sub can only be the *resubscribed* REQ's answer: the
 * relay accepted our AUTH and still refused us. That is a whitelist refusal,
 * not an authentication problem: obelisk-relay's read path answers both
 * cases with the same `auth-required:` string (see docs/data-system.md
 * "Relay-side contract for access rejection").
 */
export function classifyAccessClose(reason: string, hadOnAuth: boolean): RelayAccessState | null {
  if (hadOnAuth && reason.startsWith('auth-required: ')) return 'restricted';
  return parseRelayRejection(reason);
}

/**
 * A publish rejection that names the whitelist is a relay-wide verdict,
 * authoritative enough to show without the soak. Other `restricted:` OKs
 * (NIP-29 membership, a private group) are per-group and keep the soak.
 */
export function isWhitelistRefusal(reason: string): boolean {
  const r = reason.toLowerCase();
  return r.startsWith('restricted:') && r.includes('whitelist');
}
