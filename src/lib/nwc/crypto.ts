/**
 * Encrypting a request to the wallet and opening its answer, in the scheme
 * the info event chose. No app imports: a mini-package.
 */
import * as nip04 from 'nostr-tools/nip04';
import { v2 as nip44 } from 'nostr-tools/nip44';
import type { NwcEncryption } from './info';

export function encryptFor(scheme: NwcEncryption, secret: Uint8Array, walletPubkey: string, text: string): string {
  if (scheme === 'nip44_v2') return nip44.encrypt(text, nip44.utils.getConversationKey(secret, walletPubkey));
  return nip04.encrypt(secret, walletPubkey, text);
}

/**
 * Open an answer: the scheme the request used first, then the other (a
 * wallet that answers a NIP-44 request in NIP-04 still gets read). Throws
 * when neither opens it.
 */
export function decryptFrom(scheme: NwcEncryption, secret: Uint8Array, walletPubkey: string, data: string): string {
  const order: NwcEncryption[] = scheme === 'nip44_v2' ? ['nip44_v2', 'nip04'] : ['nip04', 'nip44_v2'];
  let last: unknown = null;
  for (const s of order) {
    try {
      return s === 'nip44_v2'
        ? nip44.decrypt(data, nip44.utils.getConversationKey(secret, walletPubkey))
        : nip04.decrypt(secret, walletPubkey, data);
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error('undecryptable'); // i18n-exempt: developer message
}
