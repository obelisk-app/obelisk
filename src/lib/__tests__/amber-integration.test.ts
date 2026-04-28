/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';
import NDK, { NDKPrivateKeySigner, NDKUser, NDKEvent } from '@nostr-dev-kit/ndk';
import { generateSecretKey, getPublicKey, nip04 } from 'nostr-tools';
import { bytesToHex } from 'nostr-tools/utils';

const TEST_RELAY = 'wss://relay.nsec.app';

describe('Amber Simulation Integration Test', () => {
  it('should successfully connect app to a simulated remote signer (Amber)', async () => {
    // 1. Setup Amber (Remote Signer)
    const amberSecretKey = generateSecretKey();
    const amberPrivkeyHex = bytesToHex(amberSecretKey);
    const amberPubkey = getPublicKey(amberSecretKey);

    const amberNDK = new NDK({ explicitRelayUrls: [TEST_RELAY] });
    await amberNDK.connect();
    
    // 2. Setup App (Client)
    const { createNostrConnectSession } = await import('../nostr');
    const session = await createNostrConnectSession(TEST_RELAY);

    // 3. App side: Wait for connection (starts listening)
    const waitForConnectionPromise = session.waitForConnection();

    // Give it a moment to setup the subscription
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. Amber side: "Scan" the URI and initiate connection
    const uri = new URL(session.uri);
    const clientPubkey = uri.hostname || uri.pathname.replace(/^\/\//, '');
    const secret = uri.searchParams.get('secret');
    
    // Amber sends 'connect' response to client (simulating scanning the QR)
    const connectRes = {
      id: '1',
      result: secret || ''
    };
    
    const { nip44 } = await import('nostr-tools');
    const convKey = nip44.getConversationKey(amberSecretKey, clientPubkey);
    const encryptedRes = nip44.encrypt(JSON.stringify(connectRes), convKey);

    const event = new NDKEvent(amberNDK);
    event.kind = 24133;
    event.pubkey = amberPubkey;
    event.content = encryptedRes;
    event.tags = [['p', clientPubkey]];
    await event.sign(new NDKPrivateKeySigner(amberPrivkeyHex));
    await event.publish();

    // 5. Amber side: Listen for client's signature requests or get_public_key
    const sub = amberNDK.subscribe({
      kinds: [24133 as number],
      '#p': [amberPubkey]
    }, { closeOnEose: false });

    sub.on('event', async (ev: NDKEvent) => {
      try {
        const decrypted = nip44.decrypt(ev.content, convKey);
        const req = JSON.parse(decrypted);

        if (req.method === 'get_public_key') {
          const response = { id: req.id, result: amberPubkey };
          const encryptedRes = nip44.encrypt(JSON.stringify(response), convKey);
          const resEv = new NDKEvent(amberNDK);
          resEv.kind = 24133;
          resEv.pubkey = amberPubkey;
          resEv.content = encryptedRes;
          resEv.tags = [['p', ev.pubkey]];
          await resEv.sign(new NDKPrivateKeySigner(amberPrivkeyHex));
          await resEv.publish();
        }
      } catch (e) {
        // ignore decryption errors for non-related events
      }
    });

    // 6. Finalize
    try {
      const user = await Promise.race([
        waitForConnectionPromise,
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Integration test timed out')), 20000))
      ]);

      expect(user?.pubkey).toBe(amberPubkey);
    } catch (err) {
      throw err;
    } finally {
      sub.stop();
    }
  }, 25000);
});
