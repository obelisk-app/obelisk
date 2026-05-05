/**
 * Thin wrapper over nostr-tools `SimplePool` — the SFU's only Nostr surface.
 *
 * Why not the obelisk-dex bridge? The bridge is React/browser-shaped: it
 * holds session state, manages NIP-46 bunkers, dispatches into Zustand
 * stores. The SFU just needs to publish/subscribe with one fixed local
 * key. SimplePool directly is the right altitude.
 *
 * NIP-42 AUTH is wired through `automaticallyAuth`: when a relay sends an
 * AUTH challenge, we sign a kind 22242 event with our SFU identity and
 * push it back. Required for relays like `relay.obelisk.ar` that gate
 * writes by whitelisted-pubkey-after-AUTH.
 */
import { SimplePool, type Event, type EventTemplate, type Filter, type VerifiedEvent } from 'nostr-tools';

import { createLogger } from './log.js';
import type { Identity } from './identity.js';

const log = createLogger('relay');

export class RelayPool {
  private readonly pool: SimplePool;
  private closed = false;

  constructor(
    private readonly relays: string[],
    private readonly identity: Identity,
  ) {
    // automaticallyAuth: nostr-tools calls this for every relay URL we
    // touch. Returning a signer enables AUTH for that relay; returning
    // null means "skip AUTH for this URL". We sign every challenge — the
    // SFU has nothing to hide and the relay decides whether to accept.
    //
    // The cast is because SimplePool's exported type only `Pick`s
    // `enablePing | enableReconnect` from the wider AbstractPool options,
    // even though the runtime constructor honors `automaticallyAuth`.
    // Upstream issue, harmless in practice — see nostr-tools' AbstractSimplePool.
    this.pool = new SimplePool({
      automaticallyAuth: (relayURL: string) => {
        log.debug('AUTH signer requested', { relay: relayURL });
        return (template: EventTemplate): Promise<VerifiedEvent> => {
          const signed = this.identity.sign(template);
          log.debug('AUTH signing challenge', { relay: relayURL });
          return Promise.resolve(signed);
        };
      },
    } as ConstructorParameters<typeof SimplePool>[0]);
  }

  get pubkey(): string {
    return this.identity.pubkey;
  }

  /**
   * Sign + publish to all configured relays. Best-effort: a relay
   * rejecting one event is logged but doesn't throw.
   */
  async publish(template: EventTemplate): Promise<VerifiedEvent> {
    const event = this.identity.sign(template);
    const results = this.pool.publish(this.relays, event);

    let firstAck: string | null = null;
    let firstErr: unknown = null;
    await Promise.allSettled(
      results.map((p, i) =>
        p
          .then(() => {
            const relayUrl = this.relays[i];
            if (relayUrl && !firstAck) firstAck = relayUrl;
          })
          .catch((err) => {
            if (!firstErr) firstErr = err;
            log.debug('publish relay rejected', {
              relay: this.relays[i] ?? '(unknown)',
              kind: event.kind,
              err: (err as Error)?.message,
            });
          }),
      ),
    );

    if (!firstAck) {
      log.warn('publish: all relays rejected', { kind: event.kind, err: String(firstErr) });
    } else {
      log.debug('publish ok', { kind: event.kind, ack: firstAck });
    }
    return event;
  }

  /**
   * Subscribe to a filter across all relays. Returns an `unsub` fn.
   * `subscribeMany` in nostr-tools 2.x takes a SINGLE filter — the
   * handler is called once per unique event id across all relays.
   */
  subscribe(
    filter: Filter,
    onEvent: (ev: Event) => void,
    onEose?: () => void,
  ): () => void {
    if (this.closed) {
      log.warn('subscribe after close — no-op');
      return () => undefined;
    }
    const sub = this.pool.subscribeMany(this.relays, filter, {
      onevent: onEvent,
      onauth: this.signAuthChallenge,
      ...(onEose ? { oneose: onEose } : {}),
    });
    return () => sub.close();
  }

  /**
   * Sign a NIP-42 AUTH challenge with the SFU's identity. Wired into both
   * the constructor `automaticallyAuth` (publishes) and the per-call
   * `onauth` on every subscribe. nostr-tools' SimplePool routes them
   * separately, so we have to plug both holes — without the per-call
   * `onauth`, subscriptions on AUTH-required relays loop forever with
   * `Auth required` errors.
   */
  private readonly signAuthChallenge = (template: EventTemplate): Promise<VerifiedEvent> => {
    return Promise.resolve(this.identity.sign(template));
  };

  /**
   * Subscribe to a filter on each given relay separately, with the source
   * relay url passed through to the handler. Used by the call-listener so
   * it can distinguish events seen on a trusted relay (whose write-whitelist
   * authorizes the publisher) from events seen on an open relay (which need
   * the local allow.json check).
   *
   * Each relay gets its own `subscribeMany([url], …)`; an event published
   * to multiple relays will fire `onEvent` once per delivery. Callers MUST
   * dedupe by event id if they need each event handled exactly once.
   */
  subscribePerRelay(
    relays: string[],
    filter: Filter,
    onEvent: (ev: Event, sourceRelay: string) => void,
  ): () => void {
    if (this.closed) {
      log.warn('subscribePerRelay after close — no-op');
      return () => undefined;
    }
    const closers: Array<() => void> = [];
    for (const r of relays) {
      const sub = this.pool.subscribeMany([r], filter, {
        onevent: (ev: Event) => onEvent(ev, r),
        onauth: this.signAuthChallenge,
      });
      closers.push(() => sub.close());
    }
    return () => {
      for (const c of closers) c();
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.pool.close(this.relays);
    log.info('relay pool closed');
  }
}
