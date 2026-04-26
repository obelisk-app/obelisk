import { SimplePool } from 'nostr-tools/pool';
import { verifyEvent, verifiedSymbol, type Event as NostrEvent } from 'nostr-tools/pure';

let pool: SimplePool | null = null;

export function getDMPool(): SimplePool {
  if (!pool) pool = new SimplePool();
  return pool;
}

export function resetDMPool(): void {
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
export function verifyDMEvent(event: NostrEvent): boolean {
  try {
    const fresh = event as NostrEvent & { [verifiedSymbol]?: boolean };
    if (verifiedSymbol in fresh) {
      delete fresh[verifiedSymbol];
    }
    return verifyEvent(event);
  } catch {
    return false;
  }
}
