import { describe, it, expect, vi, beforeEach } from 'vitest';

const fastEvents: any[] = [];
const slowEvents: any[] = [];
let onevent: ((e: any) => void) | null = null;

// Mock the SDK coalescer so it routes through our fake pool. The SDK's
// `sharedCoalescer` calls SDK's `getPool()`; in tests that's an unconfigured
// SimplePool that would try real WebSocket connects. Mocking the data module
// lets us intercept `enqueue` directly.
vi.mock('@nostr-wot/data', async () => {
  const actual = await vi.importActual<typeof import('@nostr-wot/data')>('@nostr-wot/data');
  return {
    ...actual,
    sharedCoalescer: {
      enqueue: (req: { onEvent: (e: any) => void }) => {
        onevent = req.onEvent;
        queueMicrotask(() => fastEvents.forEach((e) => onevent!(e)));
        setTimeout(() => slowEvents.forEach((e) => onevent!(e)), 200);
        return () => {};
      },
      querySync: vi.fn(),
    },
  };
});

// dm.ts calls `verifyDMEvent` (NIP-01 sig check) before ingesting events.
// The test fixtures use `sig: 'x'` placeholders, so bypass verification at
// the DM-pool seam — same effect as the previous `@/lib/nostr-pool` mock.
vi.mock('./pool', () => ({
  verifyDMEvent: () => true,
  getDMPool: () => ({ subscribeMany: () => ({ close: () => {} }) }),
  resetDMPool: () => {},
}));

vi.mock('./relay-list-cache', () => ({
  getRelays: () => ({
    result: { inbox: [], readRelays: [], writeRelays: [], stale: false },
  }),
}));

import { loadHistory } from './dm';
import { getCachedEvents, clearAccount } from './dm-cache';

const me = 'a'.repeat(64);
const partner = 'b'.repeat(64);

beforeEach(() => {
  localStorage.clear();
  clearAccount(me);
  fastEvents.length = 0;
  slowEvents.length = 0;
  onevent = null;
});

describe('integration: fast relay surfaces before slow relay', () => {
  it('first event reaches the cache before the slow relay returns', async () => {
    fastEvents.push({ id: 'fast', kind: 4, pubkey: partner, created_at: 100, tags: [['p', me]], content: 'C', sig: 'x' });
    slowEvents.push({ id: 'slow', kind: 4, pubkey: partner, created_at: 50, tags: [['p', me]], content: 'C', sig: 'x' });
    loadHistory(me, partner);
    // Wait for the coalescer's 50ms debounce + microtask emission, but BEFORE the 200ms slow timer.
    await new Promise((r) => setTimeout(r, 100));
    const ids = getCachedEvents(me).map((e) => e.id);
    expect(ids).toContain('fast');
    expect(ids).not.toContain('slow');
  });
});

describe('integration: no plaintext on disk', () => {
  it('after putSecret round-trip, scanning localStorage finds no plaintext substring', async () => {
    const { getOrCreateCacheKey } = await import('./cache-key');
    const { putSecret } = await import('./dm-cache');
    const signer = {
      pubkey: me,
      nip44Encrypt: async (_p: string, t: string) => `WRAP|${t}`,
      nip44Decrypt: async (_p: string, c: string) => c.replace(/^WRAP\|/, ''),
    };
    const key = await getOrCreateCacheKey(me, signer);
    const SECRET = 'INTEGRATION-TEST-SECRET-PAYLOAD';
    await putSecret(me, key, 'eX', SECRET);
    const all = JSON.stringify(localStorage);
    expect(all).not.toContain(SECRET);
  });
});
