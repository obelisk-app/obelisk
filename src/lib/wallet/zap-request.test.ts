// Regression tests for the SDK's NIP-57 buildZapRequest. Lives in obelisk
// because the SDK package has no test suite yet, and obelisk is the primary
// consumer of these zap helpers.

import { describe, it, expect, vi } from 'vitest';
import { buildZapRequest } from '@nostr-wot/wallet';
import type { NostrSigner } from '@nostr-wot/signers';

const fakeSigner: NostrSigner = {
  getPublicKey: vi.fn(async () => 'sender_pub'),
  signEvent: vi.fn(async (template) => ({
    ...template,
    pubkey: 'sender_pub',
    id: 'evt_id',
    sig: 'sig_hex',
  })),
};

describe('buildZapRequest', () => {
  it('produces a signed kind 9734 with amount, p, relays tags', async () => {
    const { event } = await buildZapRequest(fakeSigner, {
      recipientPubkey: 'recipient_pub',
      amountMsats: 21_000,
      relays: ['wss://relay.test', 'wss://relay2.test'],
    });
    expect(event.kind).toBe(9734);
    expect(event.pubkey).toBe('sender_pub');
    expect(event.sig).toBe('sig_hex');
    const tagsByName = Object.fromEntries(event.tags.map((t) => [t[0], t.slice(1)]));
    expect(tagsByName.amount).toEqual(['21000']);
    expect(tagsByName.p).toEqual(['recipient_pub']);
    expect(tagsByName.relays).toEqual(['wss://relay.test', 'wss://relay2.test']);
  });

  it('includes optional e tag when eventId is provided', async () => {
    const { event } = await buildZapRequest(fakeSigner, {
      recipientPubkey: 'recipient_pub',
      amountMsats: 1000,
      relays: ['wss://r'],
      eventId: 'msg_abc',
    });
    const eTag = event.tags.find((t) => t[0] === 'e');
    expect(eTag).toEqual(['e', 'msg_abc']);
  });

  it('omits e tag when no eventId', async () => {
    const { event } = await buildZapRequest(fakeSigner, {
      recipientPubkey: 'recipient_pub',
      amountMsats: 1000,
      relays: ['wss://r'],
    });
    expect(event.tags.find((t) => t[0] === 'e')).toBeUndefined();
  });

  it('uses comment as content', async () => {
    const { event } = await buildZapRequest(fakeSigner, {
      recipientPubkey: 'recipient_pub',
      amountMsats: 1000,
      relays: ['wss://r'],
      comment: 'gracias',
    });
    expect(event.content).toBe('gracias');
  });

  it('content defaults to empty string', async () => {
    const { event } = await buildZapRequest(fakeSigner, {
      recipientPubkey: 'r',
      amountMsats: 1,
      relays: ['wss://r'],
    });
    expect(event.content).toBe('');
  });

  it('rejects empty relays array (per NIP-57)', async () => {
    await expect(
      buildZapRequest(fakeSigner, { recipientPubkey: 'r', amountMsats: 1, relays: [] })
    ).rejects.toThrow(/relays/i);
  });

  it('rejects non-positive amountMsats', async () => {
    await expect(
      buildZapRequest(fakeSigner, { recipientPubkey: 'r', amountMsats: 0, relays: ['wss://r'] })
    ).rejects.toThrow(/amount/i);
  });

  it('returns the signed event uri-encoded for use as `nostr=...` LNURL param', async () => {
    const { encoded, event } = await buildZapRequest(fakeSigner, {
      recipientPubkey: 'recipient_pub',
      amountMsats: 1000,
      relays: ['wss://r'],
    });
    expect(decodeURIComponent(encoded)).toBe(JSON.stringify(event));
  });
});
