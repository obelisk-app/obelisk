
import NDK, { NDKPrivateKeySigner, NDKUser, NDKEvent } from '@nostr-dev-kit/ndk';
import { nip04, nip44, generateSecretKey, getPublicKey } from 'nostr-tools';
import * as crypto from 'crypto';

async function simulate() {
  console.log('--- Amber Simulation Start ---');

  // 1. App Side (Local Signer)
  const appSigner = NDKPrivateKeySigner.generate();
  console.log('App Local Pubkey:', appSigner.pubkey);

  // 2. Amber Side (Remote Signer)
  const amberSecretKey = generateSecretKey();
  const amberSigner = new NDKPrivateKeySigner(Buffer.from(amberSecretKey).toString('hex'));
  const amberPubkey = getPublicKey(amberSecretKey);
  console.log('Amber Pubkey:', amberPubkey);

  // 3. Create a "connect" response event (Kind 24133)
  // According to NIP-46, the response should be a JSON object: { "id": "...", "result": "pubkey", "error": "..." }
  const responseData = JSON.stringify({
    id: 'test-id',
    result: amberPubkey
  });

  console.log('\\n--- Attempting NIP-04 Encryption (Amber -> App) ---');
  const encryptedNip04 = await nip04.encrypt(Buffer.from(amberSecretKey).toString('hex'), appSigner.pubkey, responseData);
  console.log('NIP-04 Content:', encryptedNip04);

  // Simulate receiving this event
  try {
    const decrypted = await nip04.decrypt(appSigner.privateKey!, amberPubkey, encryptedNip04);
    console.log('NIP-04 Decryption Success:', decrypted);
  } catch (err) {
    console.error('NIP-04 Decryption Failed:', err);
  }

  console.log('\n--- Attempting NIP-44 Encryption (Amber -> App) ---');
  // @ts-ignore
  const sharedSecret = nip44.getConversationKey(Buffer.from(amberSecretKey).toString('hex'), appSigner.pubkey);
  const encryptedNip44 = nip44.encrypt(responseData, sharedSecret);
  console.log('NIP-44 Content:', encryptedNip44);

  // Simulate receiving this event
  try {
    const decrypted = nip44.decrypt(encryptedNip44, sharedSecret);
    console.log('NIP-44 Decryption Success:', decrypted);
  } catch (err) {
    console.error('NIP-44 Decryption Failed:', err);
  }

  console.log('\\n--- Testing NDK Decryption ---');
  const ndk = new NDK();
  const remoteUser = new NDKUser({ pubkey: amberPubkey });
  remoteUser.ndk = ndk;

  try {
    const decryptedNDK = await appSigner.decrypt(remoteUser, encryptedNip04);
    console.log('NDK Decrypt NIP-04 Success:', decryptedNDK);
  } catch (err) {
    console.error('NDK Decrypt NIP-04 Failed:', err);
  }

  console.log('\\n--- Amber Simulation End ---');
}

simulate().catch(console.error);
