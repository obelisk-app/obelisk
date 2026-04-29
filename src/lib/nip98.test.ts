import { describe, it, expect, vi } from 'vitest';
import type { NostrSigner } from '@nostr-wot/signers';
import { buildNip98Event } from './nip98';

const fakeSigner: NostrSigner = {
  getPublicKey: vi.fn().mockResolvedValue('npub_pub'),
  signEvent: vi.fn().mockImplementation(async (template) => ({
    ...template,
    pubkey: 'npub_pub',
    id: 'evt_id',
    sig: 'sig_hex',
    created_at: template.created_at ?? Math.floor(Date.now() / 1000),
  })),
};

describe('buildNip98Event', () => {
  it('produces a kind 27235 event with u + method tags and challenge content', async () => {
    const ev = await buildNip98Event(fakeSigner, 'https://x.test/api/foo', 'POST', 'CHAL_HEX');
    expect(ev.kind).toBe(27235);
    expect(ev.content).toBe('CHAL_HEX');
    const tagsByName = Object.fromEntries(ev.tags.map(([k, v]) => [k, v]));
    expect(tagsByName.u).toBe('https://x.test/api/foo');
    expect(tagsByName.method).toBe('POST');
    expect(ev.pubkey).toBe('npub_pub');
    expect(ev.sig).toBe('sig_hex');
  });

  it('uses the provided created_at if present in template, else current time', async () => {
    const before = Math.floor(Date.now() / 1000);
    const ev = await buildNip98Event(fakeSigner, 'https://x.test/api/foo', 'GET', 'C');
    expect(ev.created_at).toBeGreaterThanOrEqual(before);
  });

  it('forwards the URL and method exactly (no normalization)', async () => {
    const ev = await buildNip98Event(fakeSigner, 'https://x.test/api/Foo?q=1', 'PUT', 'C');
    const tagsByName = Object.fromEntries(ev.tags.map(([k, v]) => [k, v]));
    expect(tagsByName.u).toBe('https://x.test/api/Foo?q=1');
    expect(tagsByName.method).toBe('PUT');
  });
});
