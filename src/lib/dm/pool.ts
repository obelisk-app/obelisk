// Browser-only — uses the global WebSocket. Server-side relay reads live
// in src/lib/profile-sync.ts which wires nostr-tools to `ws`.
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
    // nostr-tools/pure caches verification results on `event[verifiedSymbol]`.
    // JS object spread copies own symbol properties, so a tampered event
    // produced by `{ ...verifiedEv, sig: badSig }` would short-circuit to
    // `true`. Strip the cached flag onto a shallow copy before delegating —
    // this also avoids mutating the caller's event.
    const { [verifiedSymbol]: _ignored, ...rest } =
      event as NostrEvent & { [verifiedSymbol]?: boolean };
    return verifyEvent(rest as NostrEvent);
  } catch {
    return false;
  }
}
