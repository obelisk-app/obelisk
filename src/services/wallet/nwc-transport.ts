/**
 * A wallet connection's relay traffic, on the page's RelayHub, under the
 * connection's own identity.
 *
 * The wallet relay sees the NWC client key (it signs every request), never
 * the user's. So, like a DM call (`src/services/dm-call/call-pool.ts`), the
 * connection runs as its own hub identity, `nwc:<client pubkey>`:
 *  - its REQs and EVENTs never share a socket with the session identity,
 *    even when the wallet relay is one the user also browses;
 *  - its socket's only possible NIP-42 signer is the client key. The socket
 *    holds no AUTH lease until the wallet relay asks for one (a CLOSED or an
 *    OK with `auth-required:`); only then does it take a `'wallet'` lease and
 *    authenticate, as the client key the relay already sees.
 * `destroy()` removes the identity: its socket, leases and cached reads go.
 *
 * The relay still sees the page's IP, as it does for every connection.
 */
import { finalizeEvent, type Event as NostrEvent, type Filter } from 'nostr-tools';
import type { AuthLease, RelayHub } from '@/lib/relay-hub';
import type { NwcConnection, NwcTransport } from '@/lib/nwc';

export type NwcHub = Pick<RelayHub, 'setIdentity' | 'removeIdentity' | 'subscribe' | 'publish' | 'acquireAuthLease'>;

export interface HubNwcTransport extends NwcTransport {
  readonly identityId: string;
  destroy(): void;
}

/** How long a relay may take to OK a request. The hub's 750 ms default for ephemeral kinds is too short for a wallet relay far away. */
const ACK_TIMEOUT_MS = 8_000;

export function nwcIdentityId(clientPubkey: string): string {
  return `nwc:${clientPubkey}`;
}

function asksForAuth(reason: string | null | undefined): boolean {
  return !!reason && (reason.startsWith('auth-required:') || reason.startsWith('auth was required'));
}

export function createHubNwcTransport(hub: NwcHub, connection: NwcConnection): HubNwcTransport {
  const { relays, secret, clientPubkey } = connection;
  const identityId = nwcIdentityId(clientPubkey);
  hub.setIdentity({
    id: identityId,
    pubkey: clientPubkey,
    signer: async (template) => finalizeEvent(template, secret),
    authPolicy: 'auth-when-challenged',
    localSigner: true,
  });
  const leases = new Map<string, AuthLease>();
  let destroyed = false;

  /** The relay asked: from now on this socket may AUTH, as the client key. */
  const allowAuth = (relay: string) => {
    if (destroyed || leases.has(relay)) return;
    leases.set(relay, hub.acquireAuthLease(relay, 'wallet', identityId));
  };

  return {
    identityId,

    subscribe(filter: Filter, handlers) {
      let ready = false;
      const handle = hub.subscribe({
        relays,
        filters: [filter],
        identityId,
        priority: 'active',
        label: 'obelisk-nwc',
        onEvent: (event) => handlers.onEvent(event),
        onEose: () => {
          if (ready) return;
          ready = true;
          handlers.onReady();
        },
        onRelayClosed: (relay, reason) => {
          if (asksForAuth(reason)) allowAuth(relay);
        },
      });
      return { close: () => handle.release() };
    },

    async publish(event: NostrEvent) {
      const rows = await hub.publish({ relays, event, identityId, authMode: 'never', ackTimeoutMs: ACK_TIMEOUT_MS });
      const askedAuth = rows.filter((r) => r.status === 'rejected' && asksForAuth(r.reason)).map((r) => r.url);
      let retried: typeof rows = [];
      if (askedAuth.length > 0 && !destroyed) {
        askedAuth.forEach(allowAuth);
        retried = await hub.publish({ relays: askedAuth, event, identityId, authMode: 'auth-first', ackTimeoutMs: ACK_TIMEOUT_MS });
      }
      // A timeout may still have reached the relay, so it counts as sent.
      return [...rows, ...retried].some((r) => r.status === 'ok' || r.status === 'timeout');
    },

    query(filter: Filter, maxWaitMs: number) {
      // A live REQ rather than `hub.query`, so a CLOSED `auth-required:` is
      // seen with its reason: the hub retries it once the lease is in place.
      return new Promise<readonly NostrEvent[]>((resolve) => {
        const events: NostrEvent[] = [];
        let done = false;
        let handle: { release(): void } | null = null;
        const settle = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          handle?.release();
          resolve(events);
        };
        const timer = setTimeout(settle, maxWaitMs);
        handle = hub.subscribe({
          relays,
          filters: [filter],
          identityId,
          priority: 'active',
          label: 'obelisk-nwc-info',
          onEvent: (event) => { events.push(event); },
          onEose: () => queueMicrotask(settle),
          onRelayClosed: (relay, reason) => {
            if (asksForAuth(reason)) allowAuth(relay);
          },
        });
        if (done) handle.release();
      });
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const lease of leases.values()) lease.release();
      leases.clear();
      hub.removeIdentity(identityId);
    },
  };
}
