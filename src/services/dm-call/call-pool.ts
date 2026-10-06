/**
 * The relay transport of one DM call: the page's relay hub, under the
 * call's own identity.
 *
 * The call signs with a throwaway key, so a relay must never be able to link
 * that key to the user. The hub keys sockets on `(relay, identity)`, and the
 * call runs as `ephemeral:${callId}` with `authPolicy: 'never-auth'`
 * (`audits/obelisk/round2/DECISIONS.md` §1), so:
 *  - its REQs and EVENTs never ride a socket the session identity uses,
 *    even on a relay the user is also browsing: that relay sees two
 *    connections, not one connection carrying both;
 *  - its sockets never get a NIP-42 signer, so they cannot answer a
 *    challenge with the session's key (or with any key).
 * Known limit, not solved here: the relay still sees one IP for both
 * connections. This removes the cryptographic link AUTH would create, not
 * network-level correlation.
 *
 * `destroy()` removes the identity from the hub (its sockets, records and
 * cached reads go with it): a finished call leaves nothing behind.
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { normalizeURL } from 'nostr-tools/utils';
import { currentRelayHub, type RelayHub } from '@/lib/relay-hub';

export interface CallPoolLike {
  subscribe(
    relays: string[],
    filter: Filter,
    params: { onevent: (ev: NostrEvent) => void; oneose?: () => void; onclose?: (reasons: string[]) => void },
  ): { close: (reason?: string) => void };
  /** Settles once every relay has answered: resolves if at least one accepted, rejects if none did. */
  publish(relays: string[], event: NostrEvent): Promise<unknown>;
  destroy?(): void;
}

export type CallHub = Pick<RelayHub, 'setIdentity' | 'removeIdentity' | 'subscribe' | 'publish'>;

export function callIdentityId(callId: string): string {
  return `ephemeral:${callId}`;
}

function normalized(url: string): string {
  try {
    return normalizeURL(url);
  } catch {
    return url;
  }
}

/** The page's hub; a DM call never runs before the bridge has created it. */
export function pageHubForCalls(): CallHub {
  const hub = currentRelayHub();
  if (!hub) throw new Error('DM call started before the relay hub exists');
  return hub;
}

/** One call's transport on `hub`, as `ephemeral:${callId}` with the throwaway `pubkey`, never authenticating. */
export function createCallPool(hub: CallHub, callId: string, pubkey: string): CallPoolLike {
  const identityId = callIdentityId(callId);
  hub.setIdentity({ id: identityId, pubkey, signer: null, authPolicy: 'never-auth' });
  let destroyed = false;
  return {
    subscribe(relays, filter, params) {
      // `oneose` once, when every relay has answered: the channel's `ready`.
      const waiting = new Set(relays.map(normalized));
      let eosed = false;
      const handle = hub.subscribe({
        relays,
        filters: [filter],
        identityId,
        priority: 'voice',
        label: 'obelisk-dm-call',
        onEvent: (ev) => params.onevent(ev),
        onEose: (relay) => {
          waiting.delete(relay);
          if (eosed || waiting.size > 0) return;
          eosed = true;
          params.oneose?.();
        },
        onClosed: (_relay, reason) => params.onclose?.([reason]),
      });
      return { close: () => handle.release() };
    },
    async publish(relays, event) {
      const rows = await hub.publish({ relays, event, identityId, authMode: 'never' });
      if (rows.some((r) => r.status === 'ok')) return rows;
      throw new Error(rows.map((r) => `${r.url}: ${r.reason ?? r.status}`).join('; ') || 'no call relay');
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      hub.removeIdentity(identityId);
    },
  };
}
