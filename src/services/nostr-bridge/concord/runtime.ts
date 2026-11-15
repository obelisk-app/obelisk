import { ConcordClient } from '@applesauce/concord/client';
import { RelayPool } from 'applesauce-relay';
import type { RelayHub } from '@nostr-wot/relay/hub';
import type { NipSigner } from '@/types/nostr/nip-signer';
import { concordSocketConstructor } from './hub-socket';
import { openConcordStorage } from './storage';
import { concordRumorStore } from './rumor-store';
import { CONCORD_DEFAULT_RELAYS } from '@/constants/nostr-bridge/concord';
import { concordUploader } from '@/services/chat/concord/media';

/** SDK gets Obelisk's signer, encrypted storage, and virtual sockets over the shared hub. */
export async function createConcordRuntime(hub: RelayHub, signer: NipSigner, generation: number, assertCurrent: () => void) {
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
    pool, storage, relays: [...CONCORD_DEFAULT_RELAYS],
    storeFactory: (communityId, plane) => concordRumorStore(storage, communityId, plane),
    autoUnlock: true, autoSaveCommunityList: true,
    uploader: concordUploader(assertCurrent),
  });
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    client.dispose();
    pool.close();
    hub.removeIdentity(identityId);
  };
  try {
    await client.start();
    assertCurrent();
    client.schedulePurge();
    return { client, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
