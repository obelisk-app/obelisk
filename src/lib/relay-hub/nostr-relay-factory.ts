/**
 * The direct `RelayFactory`: one nostr-tools `AbstractRelay` per
 * `(url, identity)`, with `enableReconnect: false` because the hub's own
 * supervisor owns reconnection (DECISIONS §3). This is the transport the hub
 * ends on once the bridge's suites observe sockets through `FakeRelay`
 * (step 7). Until then the page singleton runs on `pool-backed-relay.ts`,
 * whose header says why; both satisfy the same `RelayLike` seam.
 */
import { AbstractRelay } from 'nostr-tools/abstract-relay';
import { verifyEvent } from 'nostr-tools/pure';
import type { RelayFactory, RelayLike } from './types';

export interface NostrRelayFactoryOptions {
  /** Some relays push binary frames; obelisk passes its `TextCoercingWebSocket` here. */
  readonly websocketImplementation?: typeof WebSocket;
  /** Default true. */
  readonly enablePing?: boolean;
}

export function createNostrRelayFactory(opts: NostrRelayFactoryOptions = {}): RelayFactory {
  return (url) => {
    // Assigning to `RelayLike` is the compile-time proof that nostr-tools'
    // class satisfies the hub's seam; `FakeRelay` implements the same type.
    const relay: RelayLike = new AbstractRelay(url, {
      verifyEvent,
      websocketImplementation: opts.websocketImplementation,
      enablePing: opts.enablePing ?? true,
      enableReconnect: false,
    });
    return relay;
  };
}
