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

/**
 * Some Nostr relays push EVENT/EOSE/NOTICE messages as binary WebSocket
 * frames (Blob or ArrayBuffer) — usually because they're behind a
 * compressing proxy or because they send NIP-42 AUTH challenges in
 * binary mode. nostr-tools v2 (`pool.js#getSubscriptionId`) does
 * `json.slice(0, 22).indexOf('"EVENT"')` without first checking that
 * `json` is a string, and crashes with `TypeError: ...indexOf is not a
 * function` for every binary message. The exception bubbles out of the
 * native `onmessage` handler, which means *every* event from such a
 * relay is silently dropped — the user sees an empty inbox even though
 * messages are arriving.
 *
 * The fix: subclass WebSocket and intercept `onmessage` so we coerce
 * `Blob`/`ArrayBuffer` payloads into UTF-8 strings before nostr-tools
 * touches them. SimplePool's constructor accepts a `websocketImpl`
 * option for exactly this kind of injection.
 */
class TextCoercingWebSocket extends WebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    this.binaryType = 'arraybuffer';
  }
  set onmessage(handler: ((ev: MessageEvent) => void) | null) {
    if (!handler) {
      super.onmessage = null;
      return;
    }
    super.onmessage = (ev: MessageEvent) => {
      const data = ev.data;
      if (typeof data === 'string') {
        handler(ev);
        return;
      }
      // Coerce binary → text. ArrayBuffer is the common case (binaryType
      // = 'arraybuffer' above guarantees we never get a Blob from frames
      // we initiate), but we keep the Blob branch for safety in case a
      // proxy somewhere downgrades the binaryType.
      try {
        if (data instanceof ArrayBuffer) {
          const text = new TextDecoder('utf-8').decode(data);
          handler(new MessageEvent(ev.type, { data: text, origin: ev.origin, lastEventId: ev.lastEventId, source: ev.source }));
          return;
        }
        if (typeof Blob !== 'undefined' && data instanceof Blob) {
          void data.text().then((text) => {
            handler(new MessageEvent(ev.type, { data: text, origin: ev.origin, lastEventId: ev.lastEventId, source: ev.source }));
          });
          return;
        }
      } catch (err) {
        console.warn('[nostr-pool] failed to coerce binary frame:', err);
      }
      // Unknown payload type — let the original handler decide what to
      // do. Safer than dropping a message we don't understand.
      handler(ev);
    };
  }
  get onmessage(): ((ev: MessageEvent) => void) | null {
    return super.onmessage;
  }
}

export function getNostrPool(): SimplePool {
  if (!pool) {
    pool = new SimplePool({
      websocketImplementation: TextCoercingWebSocket as unknown as typeof WebSocket,
    } as ConstructorParameters<typeof SimplePool>[0]);
  }
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
