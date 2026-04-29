import { describe, it, expect, vi } from 'vitest';
import type { NostrSigner } from '@nostr-wot/signers';
import { buildZapRequest } from './zap-request';

const fakeSigner: NostrSigner = {
  getPublicKey: vi.fn().mockResolvedValue('sender_pub'),
  signEvent: vi.fn(async (template) => ({
    ...template,
    pubkey: 'sender_pub',
    id: 'evt_id',
    sig: 'sig_hex',
  })),
};

describe('buildZapRequest', () => {
  it('produces a signed kind 9734 with amount, p, relays tags', async () => {
    const ev = await buildZapRequest(fakeSigner, {
      recipientPubkey: 'recipient_pub',
      amountMsat: 21_000,
      relays: ['wss://relay.test', 'wss://relay2.test'],
    });
    expect(ev.kind).toBe(9734);
    expect(ev.pubkey).toBe('sender_pub');
    expect(ev.sig).toBe('sig_hex');
    const tagsByName = Object.fromEntries(ev.tags.map((t) => [t[0], t.slice(1)]));
    expect(tagsByName.amount).toEqual(['21000']);
    expect(tagsByName.p).toEqual(['recipient_pub']);
    expect(tagsByName.relays).toEqual(['wss://relay.test', 'wss://relay2.test']);
  });

  it('includes optional e tag when messageId is provided', async () => {
    const ev = await buildZapRequest(fakeSigner, {
      recipientPubkey: 'recipient_pub',
      amountMsat: 1000,
      relays: ['wss://r'],
      messageId: 'msg_abc',
    });
    const eTag = ev.tags.find((t) => t[0] === 'e');
    expect(eTag).toEqual(['e', 'msg_abc']);
  });

  it('omits e tag when no messageId', async () => {
    const ev = await buildZapRequest(fakeSigner, {
      recipientPubkey: 'recipient_pub',
      amountMsat: 1000,
      relays: ['wss://r'],
    });
    expect(ev.tags.find((t) => t[0] === 'e')).toBeUndefined();
  });

  it('uses comment as content', async () => {
    const ev = await buildZapRequest(fakeSigner, {
      recipientPubkey: 'recipient_pub',
      amountMsat: 1000,
      relays: ['wss://r'],
      comment: 'gracias',
    });
    expect(ev.content).toBe('gracias');
  });

  it('content defaults to empty string', async () => {
    const ev = await buildZapRequest(fakeSigner, {
      recipientPubkey: 'r',
      amountMsat: 1,
      relays: ['wss://r'],
    });
    expect(ev.content).toBe('');
  });

  it('rejects empty relays array (per NIP-57)', async () => {
    await expect(
      buildZapRequest(fakeSigner, { recipientPubkey: 'r', amountMsat: 1, relays: [] })
    ).rejects.toThrow(/relays/i);
  });

  it('rejects non-positive amountMsat', async () => {
    await expect(
      buildZapRequest(fakeSigner, { recipientPubkey: 'r', amountMsat: 0, relays: ['wss://r'] })
    ).rejects.toThrow(/amount/i);
  });
});
