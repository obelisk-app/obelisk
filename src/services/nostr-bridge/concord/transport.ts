import type { Event, Filter } from 'nostr-tools';
import type { RelayHub, PublishResult, SubscribeSpec } from '@nostr-wot/relay/hub';

type Hub = Pick<RelayHub, 'setIdentity' | 'removeIdentity' | 'subscribe' | 'publish'>;

/** One lifecycle per session. Never exposes the user's AUTH signer to community relays. */
export function createConcordTransport(hub: Hub, identityId: string) {
  if (!identityId.startsWith('concord:')) throw new Error('Invalid Concord transport identity');
  hub.setIdentity({ id: identityId, pubkey: null, signer: null, authPolicy: 'never-auth' });
  let disposed = false;
  const releases = new Set<() => void>();
  const assertLive = () => {
    if (disposed) throw new DOMException('Concord session ended', 'AbortError');
  };
  return {
    subscribe(relays: readonly string[], filters: readonly Filter[], handlers: Pick<SubscribeSpec, 'onEvent' | 'onEose' | 'onClosed'>) {
      assertLive();
      let active = true;
      const handle = hub.subscribe({
        relays: [...relays], filters, identityId, priority: 'active',
        label: 'concord',
        onEvent: (event, relay) => { if (!disposed && active) handlers.onEvent(event, relay); },
        onEose: relay => { if (!disposed && active) handlers.onEose?.(relay); },
        onClosed: (relay, reason) => { if (!disposed && active) handlers.onClosed?.(relay, reason); },
      });
      const release = () => {
        if (!active) return;
        active = false;
        handle.release();
        releases.delete(release);
      };
      releases.add(release);
      return release;
    },
    async publish(relays: readonly string[], event: Event): Promise<readonly PublishResult[]> {
      assertLive();
      const result = await hub.publish({ relays: [...relays], event, identityId, authMode: 'never' });
      assertLive();
      return result;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const release of releases) release();
      hub.removeIdentity(identityId);
    },
  };
}
