/**
 * Browser-side Nostr read primitives. Foundation for the migration off NDK
 * for read-path traffic — DM modules and non-DM consumers (profile reads,
 * follows, follower lists, user notes) all share this pool + verifier.
 *
 * Browser-only: uses the global WebSocket. Server-side relay reads live in
 * src/lib/profile-sync.ts, which wires nostr-tools to `ws`.
 */

import { SimplePool } from 'nostr-tools/pool';
import { verifyEvent, verifiedSymbol, type Event as NostrEvent } from 'nostr-tools/pure';

let pool: SimplePool | null = null;

export function getNostrPool(): SimplePool {
  if (!pool) pool = new SimplePool();
  return pool;
}

export function resetNostrPool(): void {
  if (pool) {
    try { pool.close([]); } catch { /* ignore */ }
  }
  pool = null;
}

/**
 * Verify a Nostr event's signature.
 *
 * `nostr-tools` caches verification results on the event via a symbol-keyed
 * property (`verifiedSymbol`). That cache survives object spread, which means
 * a tampered event derived from `{ ...signedEvent, sig: other }` would still
 * report as verified. We strip the cache before re-verifying so callers can
 * trust the result on any input.
 */
export function verifyNostrEvent(event: NostrEvent): boolean {
  try {
    const { [verifiedSymbol]: _ignored, ...rest } =
      event as NostrEvent & { [verifiedSymbol]?: boolean };
    return verifyEvent(rest as NostrEvent);
  } catch {
    return false;
  }
}
