/**
 * NIP-59 gift wrap (rumor → seal → wrap) addressed to self.
 *
 * Used for app-private state events (per-relay read state, future: settings)
 * where we want the relay to see only `kind:1059 from random pubkey #p=me` —
 * the same shape as a NIP-17 DM. The inner rumor's kind, tags, and content
 * are all opaque to the relay.
 *
 * We don't reuse `nostr-tools/nip59` directly because its helpers require a
 * `Uint8Array` private key for the seal layer — fine for nsec logins, but
 * NIP-07/bunker sessions never expose one. Our wrap accepts a `NipSigner`
 * abstraction (the same interface DM cache and wallet adapters use) so all
 * three login methods work transparently.
 */
import { type Event as NostrEvent, getEventHash, finalizeEvent } from 'nostr-tools';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { v2 as nip44 } from 'nostr-tools/nip44';
import { KIND_SEAL, KIND_GIFT_WRAP } from './nip-kinds';

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

export interface RumorTemplate {
  kind: number;
  tags?: string[][];
  content: string;
  /** Defaults to current unix seconds; rumor created_at is the value we
   * read for newest-wins, NOT the wrap created_at (which is fuzzed). */
  created_at?: number;
}

export interface Rumor {
  id: string;
  pubkey: string;
  kind: number;
  tags: string[][];
  content: string;
  created_at: number;
}

/**
 * Random unix-second within the last 2 days, per NIP-59 §Privacy tags.
 * Obscures the wrap publish time so a relay observer can't correlate
 * activity bursts to specific events.
 */
function fuzzyCreatedAt(): number {
  const now = Math.floor(Date.now() / 1000);
  const fuzz = Math.floor(Math.random() * 2 * 24 * 60 * 60);
  return now - fuzz;
}

function buildRumor(template: RumorTemplate, pubkey: string): Rumor {
  const created_at = template.created_at ?? Math.floor(Date.now() / 1000);
  const tags = template.tags ?? [];
  const ev = {
    pubkey,
    created_at,
    kind: template.kind,
    tags,
    content: template.content,
  };
  const id = getEventHash(ev as NostrEvent);
  return { ...ev, id };
}

/**
 * Wrap a rumor as a NIP-59 gift wrap addressed to self. Inner rumor is
 * sealed with the user's signer (kind 13 + NIP-44 to self), then the seal
 * is wrapped under an ephemeral keypair (kind 1059 + NIP-44 to self).
 */
export async function wrapForSelf(
  template: RumorTemplate,
  signer: NipSigner,
): Promise<NostrEvent> {
  const myPubkey = signer.pubkey;
  const rumor = buildRumor(template, myPubkey);

  const sealCiphertext = await signer.nip44Encrypt(myPubkey, JSON.stringify(rumor));
  const seal = await signer.signEvent({
    kind: KIND_SEAL,
    created_at: fuzzyCreatedAt(),
    tags: [],
    content: sealCiphertext,
  });

  const ephemPriv = generateSecretKey();
  const sharedKey = nip44.utils.getConversationKey(ephemPriv, myPubkey);
  const wrapCiphertext = nip44.encrypt(JSON.stringify(seal), sharedKey);
  return finalizeEvent(
    {
      kind: KIND_GIFT_WRAP,
      created_at: fuzzyCreatedAt(),
      tags: [['p', myPubkey]],
      content: wrapCiphertext,
    },
    ephemPriv,
  );
}

/**
 * Reverse of {@link wrapForSelf}. Returns `null` on any failure — decrypt
 * error, malformed JSON, mismatched seal pubkey — so callers can iterate
 * over a mixed stream of kind:1059 events (which will eventually include
 * NIP-17 DMs alongside our state events) without throwing.
 */
export async function unwrapForSelf(
  wrap: NostrEvent,
  signer: NipSigner,
): Promise<Rumor | null> {
  if (wrap.kind !== KIND_GIFT_WRAP) return null;
  try {
    const sealJson = await signer.nip44Decrypt(wrap.pubkey, wrap.content);
    const seal = JSON.parse(sealJson) as NostrEvent;
    if (seal.kind !== KIND_SEAL) return null;
    if (seal.pubkey !== signer.pubkey) return null;
    const rumorJson = await signer.nip44Decrypt(seal.pubkey, seal.content);
    const rumor = JSON.parse(rumorJson) as Rumor;
    return rumor;
  } catch {
    return null;
  }
}

/**
 * Use this from the bridge to assemble a {@link NipSigner} for the active
 * session. The seal layer requires a real signature (not just NIP-44) so
 * we route signEvent through the same path as the rest of the bridge.
 */
export interface NipSignerSources {
  readonly pubkey: string;
  signEvent: NipSigner['signEvent'];
  nip44Encrypt: NipSigner['nip44Encrypt'];
  nip44Decrypt: NipSigner['nip44Decrypt'];
}

export function makeNipSigner(sources: NipSignerSources): NipSigner {
  return sources;
}
