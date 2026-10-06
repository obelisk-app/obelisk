/**
 * The DM store's key, wrapped to the user's own Nostr key by their signer.
 *
 * The wrapped form is a NIP-78 app-data event (kind 30078, `d` =
 * `obelisk:dm-key:v1`) whose content is the key, NIP-44 encrypted to the
 * user's own pubkey. It is kept only in this browser (`store-db.ts`), never
 * signed and never published:
 *
 * - Signing would cost a second signer prompt and adds nothing here: NIP-44
 *   to oneself is authenticated with a conversation key only the user's
 *   signer can derive, so nobody else can make a wrapped key that opens.
 * - Publishing would tell relays this pubkey uses Obelisk, and would not
 *   help another device: it has no copy of the encrypted messages to open.
 *
 * Unwrapping is one `nip44Decrypt` through the signer per page session: a
 * prompt on an extension or bunker that asks, none for an nsec login.
 * Making a new key is one `nip44Encrypt` and no decrypt.
 */
import type { NipSigner } from '@/lib/nip-59';
import { RECORD_KEY_BYTES } from '@/lib/crypto/record-cipher';
import { fromBase64Url, toBase64Url } from '@/lib/crypto/webcrypto';
import { KIND_NIP78_APP_DATA } from '@/utils/nip-kinds';
import { forgetDecrypt } from '../decrypt-cache';

export const DM_KEY_D_TAG = 'obelisk:dm-key:v1';

/** An unsigned kind 30078 event, as kept in IndexedDB. */
export interface WrappedDmKey {
  readonly kind: number;
  readonly pubkey: string;
  readonly created_at: number;
  readonly tags: string[][];
  readonly content: string;
}

export function isWrappedDmKey(value: unknown, pubkey: string): value is WrappedDmKey {
  if (!value || typeof value !== 'object') return false;
  const ev = value as Record<string, unknown>;
  return ev.kind === KIND_NIP78_APP_DATA
    && ev.pubkey === pubkey
    && typeof ev.content === 'string'
    && Array.isArray(ev.tags)
    && ev.tags.some((t) => Array.isArray(t) && t[0] === 'd' && t[1] === DM_KEY_D_TAG);
}

/** Encrypt the key bytes to the signer's own pubkey. Throws when the signer refuses. */
export async function wrapDmKey(signer: NipSigner, raw: Uint8Array): Promise<WrappedDmKey> {
  const payload = JSON.stringify({ v: 1, alg: 'A256GCM', key: toBase64Url(raw) });
  const content = await signer.nip44Encrypt(signer.pubkey, payload);
  return {
    kind: KIND_NIP78_APP_DATA,
    pubkey: signer.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', DM_KEY_D_TAG]],
    content,
  };
}

/**
 * The key bytes, through one signer decrypt. Throws when the signer refuses
 * or fails (the store stays locked and the person can try again); returns
 * `null` when the signer answered but what came back is not a key (the key
 * is lost and the store starts over).
 */
export async function unwrapDmKey(signer: NipSigner, wrapped: WrappedDmKey): Promise<Uint8Array | null> {
  const payload = await signer.nip44Decrypt(signer.pubkey, wrapped.content);
  // The memo keeps decrypted results for a few minutes so concurrent
  // readers of one gift wrap share a round trip. Nothing else reads this
  // ciphertext, so the key's plaintext does not stay there.
  forgetDecrypt('nip44', signer.pubkey, wrapped.content);
  try {
    const parsed = JSON.parse(payload) as { v?: unknown; key?: unknown };
    if (parsed.v !== 1 || typeof parsed.key !== 'string') return null;
    const raw = fromBase64Url(parsed.key);
    return raw.byteLength === RECORD_KEY_BYTES ? raw : null;
  } catch {
    return null;
  }
}
