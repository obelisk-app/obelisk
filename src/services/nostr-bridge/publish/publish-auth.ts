/**
 * The publish path's one explicit NIP-42 round (round 2 design, step 2):
 * AUTH a socket that refused an event before AUTH, under a `'publish'`
 * lease, and publish once more. `publish.ts` calls it for
 * `authRetryOnRestricted`.
 *
 * The hub does the work (`hub.publish` with `authMode: 'auth-first'`): it
 * rides an AUTH already in flight on the socket or answers the challenge
 * the relay sent, with the one signer and memo the rest of the app uses,
 * then publishes once. This module only takes the lease that permits it
 * and remembers which sockets already refused us after AUTH.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { AUTH_UNAVAILABLE, BoundedMap, type RelayHub } from '@nostr-wot/relay/hub';
import { pushRelayDebug } from '../relay/relay-debug';
import { publishRound } from './publish-round';

export class AuthRepublisher {
  /**
   * The socket generation, per relay, on which an AUTH-then-republish was
   * already refused. A key the relay refuses *after* AUTH isn't
   * whitelisted, and retrying every beacon would double the publish load
   * for nothing. Keyed by generation so a reconnect (fresh challenge, the
   * pre-AUTH race again) retries. LRU, 64 relays: this only ever holds the
   * rail and the voice relays, and a forgotten one costs one extra publish.
   */
  private readonly refusedOnGeneration = new BoundedMap<string, number>({ maxEntries: 64, policy: 'lru' });

  constructor(private readonly hub: Pick<RelayHub, 'acquireAuthLease' | 'publish' | 'status'>) {}

  /**
   * AUTH one relay socket and republish `event` on it. Returns null when
   * AUTH can't help: no challenge was ever sent, the signer failed, or this
   * socket already refused us after AUTH.
   */
  async run(url: string, event: NostrEvent): Promise<PromiseSettledResult<string> | null> {
    const generation = this.hub.status(url).socketGeneration;
    if (this.refusedOnGeneration.get(url) === generation) return null;
    // The caller opted into identifying for this event, so the publish
    // holds a NIP-42 lease on the relay for exactly this round.
    const lease = this.hub.acquireAuthLease(url, 'publish');
    try {
      const [result] = await publishRound(this.hub, [url], event, 'auth-first');
      if (result.status === 'rejected' && reasonText(result) === AUTH_UNAVAILABLE) return null;
      pushRelayDebug({ kind: 'publish-retry', relays: [url], eventKind: event.kind, reason: 'refused before AUTH; retried authenticated' }); // i18n-exempt: relay debug panel text
      if (result.status === 'rejected') this.refusedOnGeneration.set(url, generation);
      return result;
    } finally {
      lease.release();
    }
  }
}

function reasonText(result: PromiseRejectedResult): string {
  return result.reason instanceof Error ? result.reason.message : String(result.reason);
}
