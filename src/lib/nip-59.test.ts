import { describe, it, expect } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { v2 as nip44 } from 'nostr-tools/nip44';
import { finalizeEvent, type Event as NostrEvent } from 'nostr-tools';
import { bytesToHex } from 'nostr-tools/utils';
import { wrapForSelf, unwrapForSelf, type NipSigner } from './nip-59';

/**
 * Build a NipSigner backed by a raw nsec — the signer interface is the
 * same one nip07/bunker provide at runtime, just with the actual key
 * material in-memory for the test.
 */
function nsecSigner(): NipSigner {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  return {
    pubkey,
    signEvent: async (t) => finalizeEvent({ ...t }, sk),
    nip44Encrypt: async (rcpt, pt) => {
      const key = nip44.utils.getConversationKey(sk, rcpt);
      return nip44.encrypt(pt, key);
    },
    nip44Decrypt: async (sndr, ct) => {
      const key = nip44.utils.getConversationKey(sk, sndr);
      return nip44.decrypt(ct, key);
    },
  };
}

describe('nip-59 wrap/unwrap roundtrip', () => {
  it('wraps and unwraps a kind 30078 rumor with content intact', async () => {
    const signer = nsecSigner();
    const payload = JSON.stringify({ v: 1, groups: { 'g1': { lastReadAt: 1730000000000 } } });
    const wrap = await wrapForSelf(
      {
        kind: 30078,
        tags: [['d', 'obelisk:readstate:v1']],
        content: payload,
        created_at: 1730000010,
      },
      signer,
    );
    expect(wrap.kind).toBe(1059);
    expect(wrap.tags).toEqual([['p', signer.pubkey]]);
    expect(wrap.pubkey).not.toBe(signer.pubkey); // ephemeral

    const rumor = await unwrapForSelf(wrap, signer);
    expect(rumor).not.toBeNull();
    expect(rumor!.kind).toBe(30078);
    expect(rumor!.pubkey).toBe(signer.pubkey);
    expect(rumor!.created_at).toBe(1730000010);
    expect(rumor!.tags).toEqual([['d', 'obelisk:readstate:v1']]);
    expect(rumor!.content).toBe(payload);
  });

  it('returns null when the wrap is for a different recipient', async () => {
    const sender = nsecSigner();
    const wrap = await wrapForSelf({ kind: 30078, content: 'x' }, sender);
    const otherRecipient = nsecSigner();
    const result = await unwrapForSelf(wrap, otherRecipient);
    expect(result).toBeNull();
  });

  it('returns null on malformed wrap content', async () => {
    const signer = nsecSigner();
    const junkSk = generateSecretKey();
    const junk: NostrEvent = finalizeEvent(
      {
        kind: 1059,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', signer.pubkey]],
        content: 'not-an-encrypted-payload',
      },
      junkSk,
    );
    const result = await unwrapForSelf(junk, signer);
    expect(result).toBeNull();
  });

  it('returns null on non-1059 kinds (e.g. raw kind 14 DM rumor)', async () => {
    const signer = nsecSigner();
    const sk = generateSecretKey();
    const fake: NostrEvent = finalizeEvent(
      { kind: 14, created_at: 0, tags: [], content: 'x' },
      sk,
    );
    const result = await unwrapForSelf(fake, signer);
    expect(result).toBeNull();
  });

  it('produces a wrap whose pubkey is unrelated to the signer (privacy)', async () => {
    const signer = nsecSigner();
    const wrap = await wrapForSelf({ kind: 30078, content: '{}' }, signer);
    expect(wrap.pubkey).not.toBe(signer.pubkey);
    // Ephemeral pubkey is 64 hex chars, just verifying basic shape.
    expect(wrap.pubkey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('newer wrap.created_at (after reload) does not affect inner rumor created_at', async () => {
    const signer = nsecSigner();
    const wrap = await wrapForSelf(
      { kind: 30078, content: '{}', created_at: 1730000000 },
      signer,
    );
    const rumor = await unwrapForSelf(wrap, signer);
    // Inner created_at is what callers use for newest-wins; wrap.created_at
    // is fuzzy and meaningless for ordering.
    expect(rumor!.created_at).toBe(1730000000);
  });
});

// Belt-and-suspenders — make sure bytesToHex is reachable so the test
// file doesn't get tree-shaken to nothing if test selection regresses.
describe('nip-59 module wiring', () => {
  it('imports nostr-tools utils without throwing', () => {
    expect(typeof bytesToHex).toBe('function');
  });
});
