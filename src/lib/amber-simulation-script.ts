
import NDK, { NDKPrivateKeySigner, NDKUser, NDKEvent } from '@nostr-dev-kit/ndk';
import { generateSecretKey, getPublicKey, nip19, nip44, nip04, utils } from 'nostr-tools';
import { createNostrConnectSession } from './nostr';

const TEST_RELAY = 'wss://relay.nsec.app';

async function runSimulation() {
  console.log('--- Amber Simulation (NostrConnect Flow) ---');

  const amberSecretKey = generateSecretKey();
  const amberPrivkeyHex = utils.bytesToHex(amberSecretKey);
  const amberPubkey = getPublicKey(amberSecretKey);
  console.log('Amber Pubkey:', amberPubkey);

  const amberNDK = new NDK({ explicitRelayUrls: [TEST_RELAY] });
  await amberNDK.connect();
  
  const appNDK = new NDK({ explicitRelayUrls: [TEST_RELAY] });
  await appNDK.connect();
  
  console.log('App: Creating session...');
  const session = await createNostrConnectSession(TEST_RELAY);
  console.log('App: Connect URI generated.');

  // Start waiting FIRST
  console.log('App: Waiting for connection...');
  const connectionPromise = session.waitForConnection();

  // Wait for subscription to be active
  console.log('Amber: Waiting 3s to simulate user scanning QR...');
  await new Promise(r => setTimeout(r, 3000));

  const url = new URL(session.uri);
  const appLocalPubkey = url.hostname || url.pathname.replace(/^\/\//, '');
  console.log('Amber: Scanned app local pubkey:', appLocalPubkey);

  console.log('Amber: Sending connect request to App using NIP-44...');
  const request = {
    id: 'sim-connect-id',
    method: 'connect',
    params: [amberPubkey]
  };

  const convKey = nip44.getConversationKey(amberSecretKey, appLocalPubkey);
  const encryptedRequest = nip44.encrypt(JSON.stringify(request), convKey);

  const requestEvent = new NDKEvent(amberNDK);
  requestEvent.kind = 24133;
  requestEvent.pubkey = amberPubkey;
  requestEvent.content = encryptedRequest;
  requestEvent.tags = [['p', appLocalPubkey]];
  
  await requestEvent.sign(new NDKPrivateKeySigner(amberPrivkeyHex));
  await requestEvent.publish();
  console.log('Amber: Connect request published:', requestEvent.id);

  try {
    const user = await Promise.race([
      connectionPromise,
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Simulation timed out')), 25000))
    ]);

    if (user) {
      console.log('SUCCESS! App logged in as:', user.pubkey);
      if (user.pubkey === amberPubkey) {
        console.log('Pubkey match confirmed.');
      }
    }
  } catch (err) {
    console.error('Simulation failed:', err);
  } finally {
    // amberNDK.pool.close() or stop()?
    process.exit(0);
  }
}

runSimulation().catch(err => {
  console.error(err);
  process.exit(1);
});
