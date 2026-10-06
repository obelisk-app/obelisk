import { hexToNpub } from '@nostr-wot/data';

/** The full npub for a hex pubkey, or the input itself when it does not encode. */
export function safeNpub(pubkey: string): string {
  try {
    return hexToNpub(pubkey);
  } catch {
    return pubkey;
  }
}
