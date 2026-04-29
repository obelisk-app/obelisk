/**
 * Shared decrypt helpers for cached DM events. Used by both the provider's
 * background decryption pipeline and any per-thread on-demand decrypt.
 *
 * The two-phase contract is the same everywhere:
 *   1. Try the secrets-cache (`getSecret`) — AES-GCM unwrap with the
 *      account's KEK. Zero signer touches; succeeds for any wire event we've
 *      already decrypted at least once on this device.
 *   2. Fall back to the signer (NIP-04 nip04Decrypt for kind 4, NIP-17
 *      `giftUnwrap` for kind 1059). Writes the resulting plaintext envelope
 *      back to the secrets-cache so the next read is instant.
 *
 * `partnerOfNip04` extracts the partner pubkey from a NIP-04 wire event
 * without decrypting — one of `event.pubkey` (the partner sent us this) or
 * the `p` tag (we sent it to them). NIP-17 wraps don't expose the partner
 * until unwrap, so callers walk all wraps and discover partners on decrypt.
 */

import { getSigner } from '@/lib/nostr';
import { getSecret, putSecret, type CachedDMEvent } from './dm-cache';
import type { DMProtocol } from './dm';

export interface SecretEnvelope {
  senderPubkey: string;
  recipientPubkey: string;
  content: string;
  createdAt: number;
  protocol: DMProtocol;
}

export function partnerOfNip04(ev: CachedDMEvent, myPubkey: string): string {
  if (ev.pubkey === myPubkey) {
    const pTag = ev.tags.find((t) => t[0] === 'p');
    return pTag?.[1] ?? '';
  }
  return ev.pubkey;
}

export async function decryptToEnvelope(
  myPubkey: string,
  cacheKey: CryptoKey,
  ev: CachedDMEvent,
): Promise<SecretEnvelope | null> {
  const cached = await getSecret(myPubkey, cacheKey, ev.id);
  if (cached) {
    try {
      return JSON.parse(cached) as SecretEnvelope;
    } catch {
      // Corrupt blob — fall through to signer fallback.
    }
  }

  const signer = getSigner();
  if (!signer) return null;

  if (ev.kind === 4) {
    try {
      if (!signer.nip04Decrypt) return null;
      const counter = partnerOfNip04(ev, myPubkey);
      if (!counter) return null;
      // The other party is whichever side of the conversation isn't us —
      // sender pubkey for inbound, the `p` tag for outbound.
      const otherPk = ev.pubkey === myPubkey ? counter : ev.pubkey;
      const plaintext = await signer.nip04Decrypt(otherPk, ev.content);
      const pTag = ev.tags.find((t) => t[0] === 'p');
      const env: SecretEnvelope = {
        senderPubkey: ev.pubkey,
        recipientPubkey: pTag?.[1] ?? '',
        content: plaintext,
        createdAt: ev.created_at,
        protocol: 'nip04',
      };
      await putSecret(myPubkey, cacheKey, ev.id, JSON.stringify(env));
      return env;
    } catch {
      return null;
    }
  }

  if (ev.kind === 1059) {
    try {
      const { unwrapGiftWrap } = await import('@nostr-wot/dm');
      const wrap = {
        id: ev.id,
        pubkey: ev.pubkey,
        kind: 1059 as const,
        content: ev.content,
        tags: ev.tags,
        created_at: ev.created_at,
        sig: ev.sig ?? '',
      };
      const { message: rumor, senderPubkey } = await unwrapGiftWrap(signer, wrap);
      if (rumor.kind !== 14) return null;
      const recipientTag = (rumor.tags as string[][]).find((t) => t[0] === 'p');
      const env: SecretEnvelope = {
        senderPubkey,
        recipientPubkey: recipientTag?.[1] ?? '',
        content: rumor.content,
        createdAt: rumor.created_at ?? ev.created_at,
        protocol: 'nip17',
      };
      await putSecret(myPubkey, cacheKey, ev.id, JSON.stringify(env));
      return env;
    } catch {
      return null;
    }
  }

  return null;
}

/** Resolve the "partner" of a decrypted envelope — the other party,
 *  whichever side `myPubkey` ISN'T on. */
export function partnerOfEnvelope(env: SecretEnvelope, myPubkey: string): string {
  return env.senderPubkey === myPubkey ? env.recipientPubkey : env.senderPubkey;
}
