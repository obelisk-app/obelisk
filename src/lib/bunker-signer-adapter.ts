/**
 * NIP-46 signer that wraps `nostr-tools/nip46`'s BunkerSigner and exposes the
 * `@nostr-wot/signers` `NostrSigner` interface so the rest of the auth flow
 * (`useLogin`, `authenticateWithBackend`) doesn't have to change.
 *
 * Replaces `@nostr-wot/signers`'s `Nip46Signer` whose remote-signer connection
 * was failing in production — we use nostr-tools directly to match what
 * obelisk-dex's bridge does.
 */

import type { NostrSigner } from '@nostr-wot/signers';
import type { Event, EventTemplate } from 'nostr-tools';
import { BunkerSigner, parseBunkerInput, createNostrConnectURI } from 'nostr-tools/nip46';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';

const NOSTRCONNECT_RELAYS = ['wss://relay.nsec.app', 'wss://relay.damus.io', 'wss://nos.lol'];

export class BunkerSignerAdapter implements NostrSigner {
  constructor(private readonly bunker: BunkerSigner) {}

  async getPublicKey(): Promise<string> {
    return this.bunker.getPublicKey();
  }

  async signEvent(template: EventTemplate): Promise<Event> {
    return (await this.bunker.signEvent(template as EventTemplate & { pubkey: string })) as Event;
  }

  async nip04Encrypt(recipientPubkey: string, plaintext: string): Promise<string> {
    return this.bunker.nip04Encrypt(recipientPubkey, plaintext);
  }

  async nip04Decrypt(senderPubkey: string, ciphertext: string): Promise<string> {
    return this.bunker.nip04Decrypt(senderPubkey, ciphertext);
  }

  async nip44Encrypt(recipientPubkey: string, plaintext: string): Promise<string> {
    return this.bunker.nip44Encrypt(recipientPubkey, plaintext);
  }

  async nip44Decrypt(senderPubkey: string, ciphertext: string): Promise<string> {
    return this.bunker.nip44Decrypt(senderPubkey, ciphertext);
  }

  async close(): Promise<void> {
    try { this.bunker.close(); } catch { /* ignore */ }
  }
}

export interface StartNostrConnectOptions {
  relays?: string[];
  metadata?: { name?: string; url?: string };
  onAuthChallenge?: (url: string) => void;
}

export interface NostrConnectHandle {
  uri: string;
  ready: Promise<BunkerSignerAdapter>;
  cancel: () => void;
}

export function startNostrConnect(options: StartNostrConnectOptions = {}): NostrConnectHandle {
  const localSecret = generateSecretKey();
  const localPubkey = getPublicKey(localSecret);
  const relays = options.relays && options.relays.length > 0 ? options.relays : NOSTRCONNECT_RELAYS;
  const uri = createNostrConnectURI({
    clientPubkey: localPubkey,
    relays,
    secret: Math.random().toString(36).substring(2, 15),
    name: options.metadata?.name ?? 'Obelisk',
    url: options.metadata?.url ?? (typeof window !== 'undefined' ? window.location.origin : 'https://obelisk.ar'),
  });

  let cancelled = false;
  let bunker: BunkerSigner | null = null;

  const ready = (async (): Promise<BunkerSignerAdapter> => {
    bunker = await BunkerSigner.fromURI(localSecret, uri, {
      onauth: (url) => { if (!cancelled) options.onAuthChallenge?.(url); },
    }, 60000);
    if (cancelled) {
      try { bunker.close(); } catch { /* ignore */ }
      throw new Error('NostrConnect cancelled');
    }
    return new BunkerSignerAdapter(bunker);
  })();

  return {
    uri,
    ready,
    cancel: () => {
      cancelled = true;
      if (bunker) try { bunker.close(); } catch { /* ignore */ }
    },
  };
}

export interface FromBunkerUriOptions {
  onAuthChallenge?: (url: string) => void;
}

export async function fromBunkerUri(bunkerUrl: string, options: FromBunkerUriOptions = {}): Promise<BunkerSignerAdapter> {
  const bp = await parseBunkerInput(bunkerUrl);
  if (!bp) throw new Error('Invalid bunker URL');
  const localSecret = generateSecretKey();
  const bunker = BunkerSigner.fromBunker(localSecret, bp, {
    onauth: (url) => options.onAuthChallenge?.(url),
  });
  await bunker.connect();
  return new BunkerSignerAdapter(bunker);
}
