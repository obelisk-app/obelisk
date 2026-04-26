import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadHistory, verifyAndIngest, _resetDM } from './dm';
import { getCachedEvents, setCursor, clearAccount } from './dm-cache';

const me = 'a'.repeat(64);
const partner = 'b'.repeat(64);

const enqueueMock = vi.fn();
vi.mock('./coalescer', () => ({
  RequestCoalescer: class { enqueue(req: any) { enqueueMock(req); } },
}));

vi.mock('./relay-list-cache', () => ({
  getRelays: () => ({
    result: { inbox: ['wss://inbox.partner'], readRelays: ['wss://read.partner'], writeRelays: ['wss://write.partner'], stale: false },
  }),
}));

vi.mock('@/lib/nostr', () => ({
  getNDK: () => ({
    signer: { user: async () => ({ pubkey: me }) },
    pool: { relays: new Map() },
  }),
}));

beforeEach(() => {
  localStorage.clear();
  clearAccount(me);
  enqueueMock.mockClear();
  _resetDM();
});

describe('loadHistory', () => {
  it('uses since cursor from cached max(created_at)', () => {
    setCursor(me, 'nip04In', 1000);
    loadHistory(me, partner);
    const filter = enqueueMock.mock.calls[0][0].filters.find((f: any) => f.kinds[0] === 4 && f['#p']?.[0] === me);
    expect(filter.since).toBe(1000);
  });

  it('omits since for fresh cursor', () => {
    loadHistory(me, partner);
    const filters = enqueueMock.mock.calls[0][0].filters;
    for (const f of filters) expect(f.since).toBeUndefined();
  });
});

describe('verifyAndIngest', () => {
  it('drops events with bad signatures', () => {
    const bad = { id: 'x', kind: 4, pubkey: 'y'.repeat(64), created_at: 1, content: '', tags: [], sig: 'invalid' } as any;
    verifyAndIngest(me, bad);
    expect(getCachedEvents(me)).toHaveLength(0);
  });

  it('dedupes by event id', async () => {
    const { generateSecretKey, getPublicKey, finalizeEvent } = await import('nostr-tools/pure');
    const sk = generateSecretKey();
    const partnerPk = getPublicKey(sk);
    const good = finalizeEvent({ kind: 4, created_at: 1, tags: [['p', me]], content: 'CIPHER' }, sk) as any;
    verifyAndIngest(me, good);
    verifyAndIngest(me, good);
    const events = getCachedEvents(me).filter(e => e.pubkey === partnerPk);
    expect(events.length).toBe(1);
  });
});
