import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { hexToBytes } from 'nostr-tools/utils';

export type SignedChallengeEvent = {
  pubkey: string;
  content: string;
  kind: number;
  created_at: number;
  sig: string;
  id: string;
  tags: string[][];
};

export function decodeNsec(input: string): Uint8Array {
  const trimmed = input.trim();
  if (trimmed.startsWith('nsec1')) {
    const decoded = nip19.decode(trimmed);
    if (decoded.type !== 'nsec') throw new Error('Invalid nsec');
    return decoded.data as Uint8Array;
  }
  // Accept raw hex secret too
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return hexToBytes(trimmed);
  throw new Error('Expected nsec1... or 64-char hex secret key');
}

export function signChallengeWithNsec(secret: Uint8Array, challenge: string): SignedChallengeEvent {
  const template = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [] as string[][],
    content: challenge,
  };
  const signed = finalizeEvent(template, secret);
  return {
    pubkey: signed.pubkey,
    content: signed.content,
    kind: signed.kind,
    created_at: signed.created_at,
    sig: signed.sig,
    id: signed.id,
    tags: signed.tags,
  };
}

export function pubkeyFromNsec(secret: Uint8Array): string {
  return getPublicKey(secret);
}
