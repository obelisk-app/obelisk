import { createConcordBrandingLoader } from '@/services/chat/concord/branding';
import { startConcordReadSync } from './read-sync';
import { startConcordReadHighlights } from '@/services/chat/concord/read-highlights';
import { ConcordClient } from '@applesauce/concord/client';
import { RelayPool } from 'applesauce-relay';
import type { RelayHub } from '@nostr-wot/relay/hub';
import type { NipSigner } from '@/types/nostr/nip-signer';
import { concordSocketConstructor } from './hub-socket';
import { openConcordStorage } from './storage';
import { concordRumorStore } from './rumor-store';
import { CONCORD_DEFAULT_RELAYS } from '@/constants/nostr-bridge/concord';
import { concordUploader } from '@/services/chat/concord/media';
import { disposeConcordOutbox } from '@/services/chat/concord/outbox';
import { startConcordWithCache } from './startup';
import { startClientMemberChannelGrants } from '@/services/chat/concord/member-channels';

/** SDK gets Obelisk's signer, encrypted storage, and virtual sockets over the shared hub. */
export async function createConcordRuntime(hub: RelayHub, signer: NipSigner, generation: number, assertCurrent: () => void, personalRelays: string[] = []) {
  const identityId = `concord:${signer.pubkey}:${generation}`;
  const storage = await openConcordStorage(signer.pubkey, assertCurrent);
  assertCurrent();
  hub.setIdentity({ id: identityId, pubkey: null, signer: null, authPolicy: 'never-auth' });
  const pool = new RelayPool({ WebSocket: concordSocketConstructor(hub, identityId) });
  const client = new ConcordClient({
    signer: {
      getPublicKey: async () => { assertCurrent(); return signer.pubkey; },
      signEvent: template => signer.signEvent(template),
      nip44: { encrypt: signer.nip44Encrypt, decrypt: signer.nip44Decrypt },
    },
    pool, storage, relays: [...new Set([...personalRelays, ...CONCORD_DEFAULT_RELAYS])],
    storeFactory: (communityId, plane) => concordRumorStore(storage, communityId, plane),
    autoUnlock: true, autoSaveCommunityList: true,
    uploader: concordUploader(assertCurrent),
  });
  const stopReadSync = startConcordReadSync(hub, signer, storage, identityId, personalRelays.length ? personalRelays : [...CONCORD_DEFAULT_RELAYS], assertCurrent);
  const stopHighlights = startConcordReadHighlights(client, identityId);
  let disposed = false;
  const stopMemberGrants = startClientMemberChannelGrants(client);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stopMemberGrants();
    stopHighlights();
    stopReadSync();
    for (const community of client.communities$.value) { const instance = client.getCommunity(community.material.community_id); if (instance) disposeConcordOutbox(instance); }
    client.dispose();
    pool.close();
    hub.removeIdentity(identityId);
  };
  try {
    const { ready } = await startConcordWithCache(client);
    assertCurrent();
    void ready.then(() => { assertCurrent(); if (!disposed) client.schedulePurge(); }).catch(() => {});
    return { client, ready, dispose, loadArtwork: createConcordBrandingLoader(storage, assertCurrent), readNavigation: () => storage.getItem('obelisk/navigation'), saveNavigation: (value: string) => storage.setItem('obelisk/navigation', value) };
  } catch (error) {
    dispose();
    throw error;
  }
}
