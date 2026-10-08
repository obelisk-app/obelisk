import type { Event as NostrEvent } from 'nostr-tools';

/** Active session signing capability. The bridge owns login method and queue policy. */
export interface NipSigner {
  readonly pubkey: string;
  signEvent(template: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  }): Promise<NostrEvent>;
  nip44Encrypt(recipientPubkey: string, plaintext: string): Promise<string>;
  nip44Decrypt(senderPubkey: string, ciphertext: string): Promise<string>;
}
