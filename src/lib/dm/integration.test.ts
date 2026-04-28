import { describe, it, expect, vi, beforeEach } from 'vitest';

const fastEvents: any[] = [];
const slowEvents: any[] = [];
let onevent: ((e: any) => void) | null = null;

// The SDK's coalescer references its own internal getPool() — vitest
// can't intercept that across the package boundary cleanly. Override
// via the SDK's setPool() in beforeEach so the coalescer reaches our
// fake pool when it actually fires.
const fakePool = {
  subscribeMany: (_relays: string[], _filter: any, h: any) => {
    onevent = h.onevent;
    queueMicrotask(() => fastEvents.forEach((e) => onevent!(e)));
    setTimeout(() => slowEvents.forEach((e) => onevent!(e)), 200);
    return { close: () => {} };
  },
};
vi.mock('@/lib/nostr-pool', () => ({
  verifyNostrEvent: () => true,
  getNostrPool: () => fakePool,
  resetNostrPool: () => {},
}));

vi.mock('./relay-list-cache', () => ({
  getRelays: () => ({
    result: { inbox: [], readRelays: [], writeRelays: [], stale: false },
  }),
}));

import { loadHistory } from './dm';
import { getCachedEvents, clearAccount } from './dm-cache';
import { setPool } from '@nostr-wot/data';

const me = 'a'.repeat(64);
const partner = 'b'.repeat(64);

beforeEach(() => {
  localStorage.clear();
  clearAccount(me);
  fastEvents.length = 0;
  slowEvents.length = 0;
  onevent = null;
  // Override the SDK's pool so the coalescer reaches our fake.
  setPool(fakePool as never);
});

// "Fast relay surfaces before slow" was an integration check on obelisk's
// in-tree coalescer. The coalescer now lives in @nostr-wot/data and is
// covered by the SDK's own race tests; the boundary here is too coarse
// to assert on internal SDK timing without flakiness.

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
