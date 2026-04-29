// src/lib/nip98.ts
// Pure builder for NIP-98 (kind 27235) HTTP auth events. Used by the wallet
// provisioning flow against zaps.nostr-wot.com — the server-side proxy
// verifies the signature before creating wallets / claiming addresses.

import type { NostrSigner } from '@nostr-wot/signers';

export interface Nip98EventTemplate {
  kind: 27235;
  created_at: number;
  tags: string[][];
  content: string;
}

export interface Nip98SignedEvent extends Nip98EventTemplate {
  pubkey: string;
  id: string;
  sig: string;
}

export async function buildNip98Event(
  signer: NostrSigner,
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  challenge: string,
): Promise<Nip98SignedEvent> {
  const template: Nip98EventTemplate = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', url],
      ['method', method],
    ],
    content: challenge,
  };
  const event = await signer.signEvent(template);
  return event as unknown as Nip98SignedEvent;
}
