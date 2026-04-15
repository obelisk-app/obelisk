
import NDK, { NDKPrivateKeySigner, NDKUser, NDKEvent } from '@nostr-dev-kit/ndk';
import { generateSecretKey, getPublicKey, nip19, nip44, nip04 } from 'nostr-tools';

// Use a public relay for the integration test
const TEST_RELAY = 'wss://relay.nsec.app';

describe('Amber Simulation Integration Test', () => {
  it('should successfully connect app to a simulated remote signer (Amber) using NIP-44', async () => {
    console.log('--- Integration Test: Amber Simulation (Manual) ---');

    // 1. Setup Amber (Remote Signer)
    const amberSecretKey = generateSecretKey();
    const amberPrivkeyHex = Buffer.from(amberSecretKey).toString('hex');
    const amberPubkey = getPublicKey(amberSecretKey);
    console.log('Amber Pubkey:', amberPubkey);

    const amberNDK = new NDK({ explicitRelayUrls: [TEST_RELAY] });
    await amberNDK.connect();
    
    // 2. Setup App (Client)
    const appNDK = new NDK({ explicitRelayUrls: [TEST_RELAY] });
    await appNDK.connect();
    const appLocalSigner = NDKPrivateKeySigner.generate();
    console.log('App Local Pubkey:', appLocalSigner.pubkey);

    // 3. App side: Create session
    // This generates the URI
    const { createNostrConnectSession } = await import('../nostr');
    const session = await createNostrConnectSession(TEST_RELAY);
    console.log('Connect URI:', session.uri);

    // 4. Amber side: Listen for requests
    console.log('Amber is listening for requests...');
    const sub = amberNDK.subscribe({
      kinds: [24133 as number],
      '#p': [amberPubkey]
    });

    const amberResponsePromise = new Promise<void>((resolve) => {
      sub.on('event', async (event: NDKEvent) => {
        console.log('Amber received request event from App:', event.id);
        
        // Decrypt request (Apps usually send NIP-04)
        try {
          const decrypted = await nip04.decrypt(amberPrivkeyHex, event.pubkey, event.content);
          const request = JSON.parse(decrypted);
          console.log('Amber decrypted request:', request);

          if (request.method === 'connect') {
            console.log('Amber approving connect request...');
            
            // Send response using NIP-44 (simulating Amber's behavior)
            const response = {
              id: request.id,
              result: amberPubkey
            };
            
            const convKey = nip44.getConversationKey(amberPrivkeyHex, event.pubkey);
            const encryptedResponse = nip44.encrypt(JSON.stringify(response), convKey);
            
            const responseEvent = new NDKEvent(amberNDK);
            responseEvent.kind = 24133;
            responseEvent.pubkey = amberPubkey;
            responseEvent.content = encryptedResponse;
            responseEvent.tags = [['p', event.pubkey]];
            
            await responseEvent.sign(new NDKPrivateKeySigner(amberPrivkeyHex));
            await responseEvent.publish();
            console.log('Amber published response event:', responseEvent.id);
            resolve();
          }
        } catch (e) {
          console.error('Amber failed to process request:', e);
        }
      });
    });

    // 5. App side: Wait for connection
    console.log('App is waiting for connection...');
    const waitForConnectionPromise = session.waitForConnection();

    // 6. Finalize
    try {
      const user = await Promise.race([
        waitForConnectionPromise,
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Integration test timed out')), 25000))
      ]);

      console.log('App successfully connected! User pubkey:', user?.pubkey);
      expect(user?.pubkey).toBe(amberPubkey);
    } catch (err) {
      console.error('Integration test failed:', err);
      throw err;
    } finally {
      sub.stop();
      await amberNDK.pool.close();
      await appNDK.pool.close();
    }
  }, 30000);
});
