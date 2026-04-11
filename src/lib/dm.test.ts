import { describe, it, expect, vi, beforeEach } from 'vitest';
import { threadKey, detectNip04InRecent } from './dm';
import type { DMMessage } from './dm';
import { clearCache, getCachedEvents, getPlaintext, getRumor, getSyncState } from './dm-cache';

const ME = 'a'.repeat(64);
const ALICE = 'b'.repeat(64);

// Mock NDK module
const mockEncrypt = vi.fn().mockResolvedValue(undefined);
const mockDecrypt = vi.fn().mockImplementation(async function (this: { content: string }) {
  this.content = 'decrypted:' + this.content;
});
const mockPublish = vi.fn().mockResolvedValue(undefined);
const mockSubscribe = vi.fn();
const mockFetchEvents = vi.fn().mockResolvedValue(new Set());
const mockSigner = { sign: vi.fn() };

vi.mock('./nostr', () => ({
  getNDK: () => ({
    signer: mockSigner,
    subscribe: mockSubscribe,
    fetchEvents: mockFetchEvents,
    getUser: (opts: { pubkey: string }) => ({ pubkey: opts.pubkey, ndk: {} }),
    pool: { relays: new Map() },
  }),
}));

let ndkEventIdCounter = 0;

vi.mock('@nostr-dev-kit/ndk', () => {
  const NDKEventClass = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    _ndk?: unknown,
    raw?: Record<string, unknown>,
  ) {
    ndkEventIdCounter += 1;
    this.kind = (raw?.kind as number) ?? 0;
    this.content = (raw?.content as string) ?? '';
    this.tags = (raw?.tags as string[][]) ?? [];
    this.encrypt = mockEncrypt;
    this.decrypt = mockDecrypt;
    this.publish = mockPublish;
    this.id = (raw?.id as string) ?? `mock-event-${ndkEventIdCounter}`;
    this.pubkey = (raw?.pubkey as string) ?? '';
    this.created_at = (raw?.created_at as number) ?? Math.floor(Date.now() / 1000);
    this.sig = (raw?.sig as string) ?? 'sig';
  });
  return {
    NDKEvent: NDKEventClass,
    NDKUser: vi.fn().mockImplementation(function (this: Record<string, unknown>, opts: { pubkey: string }) {
      this.pubkey = opts.pubkey;
      this.ndk = {};
    }),
    giftWrap: vi.fn().mockImplementation(async () => ({
      id: 'wrap-id-' + Math.random().toString(36).slice(2, 8),
      publish: mockPublish,
    })),
    giftUnwrap: vi.fn(),
  };
});

describe('dm utils', () => {
  beforeEach(() => {
    clearCache(ME);
  });

  describe('threadKey', () => {
    it('returns sorted pubkeys', () => {
      expect(threadKey('b', 'a')).toEqual(['a', 'b']);
      expect(threadKey('a', 'b')).toEqual(['a', 'b']);
    });

    it('handles identical pubkeys', () => {
      expect(threadKey('a', 'a')).toEqual(['a', 'a']);
    });
  });

  describe('detectNip04InRecent', () => {
    const makeMsg = (id: string, protocol: 'nip04' | 'nip17'): DMMessage => ({
      id,
      senderPubkey: 'a',
      recipientPubkey: 'b',
      content: 'test',
      createdAt: 0,
      protocol,
    });

    it('returns false when no messages', () => {
      expect(detectNip04InRecent([])).toBe(false);
    });

    it('returns false when all NIP-17', () => {
      const msgs = Array.from({ length: 15 }, (_, i) => makeMsg(`${i}`, 'nip17'));
      expect(detectNip04InRecent(msgs)).toBe(false);
    });

    it('returns true when NIP-04 in last 10', () => {
      const msgs = [
        ...Array.from({ length: 8 }, (_, i) => makeMsg(`${i}`, 'nip17')),
        makeMsg('nip04-1', 'nip04'),
        makeMsg('last', 'nip17'),
      ];
      expect(detectNip04InRecent(msgs)).toBe(true);
    });

    it('returns false when NIP-04 is outside last 10', () => {
      const msgs = [
        makeMsg('old-nip04', 'nip04'),
        ...Array.from({ length: 10 }, (_, i) => makeMsg(`${i}`, 'nip17')),
      ];
      expect(detectNip04InRecent(msgs)).toBe(false);
    });

    it('respects custom count parameter', () => {
      const msgs = [
        makeMsg('nip04-1', 'nip04'),
        ...Array.from({ length: 3 }, (_, i) => makeMsg(`${i}`, 'nip17')),
      ];
      expect(detectNip04InRecent(msgs, 3)).toBe(false);
      expect(detectNip04InRecent(msgs, 4)).toBe(true);
    });
  });

  describe('sendNip04DM', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      clearCache(ME);
    });

    it('sends a kind 4 event and caches it', async () => {
      const { sendNip04DM } = await import('./dm');
      const result = await sendNip04DM(ALICE, 'hello', ME);
      expect(result).not.toBeNull();
      expect(mockEncrypt).toHaveBeenCalled();
      expect(mockPublish).toHaveBeenCalled();
      // Cached as the raw (post-encrypt) event + plaintext preserved for preview
      expect(getCachedEvents(ME)).toHaveLength(1);
      expect(getPlaintext(ME, getCachedEvents(ME)[0].id)).toBe('hello');
    });

    it('returns null on encrypt failure and does not cache', async () => {
      mockEncrypt.mockRejectedValueOnce(new Error('encrypt failed'));
      const { sendNip04DM } = await import('./dm');
      const result = await sendNip04DM(ALICE, 'hello', ME);
      expect(result).toBeNull();
      expect(getCachedEvents(ME)).toHaveLength(0);
    });
  });

  describe('sendNip17DM', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      clearCache(ME);
    });

    it('sends a gift-wrapped kind 14 event and caches the rumor', async () => {
      const { sendNip17DM } = await import('./dm');
      const result = await sendNip17DM(ALICE, 'secret hello', ME);
      expect(result).not.toBeNull();
      expect(mockPublish).toHaveBeenCalled();
      const events = getCachedEvents(ME);
      expect(events).toHaveLength(1);
      const rumor = getRumor(ME, events[0].id);
      expect(rumor?.content).toBe('secret hello');
      expect(rumor?.senderPubkey).toBe(ME);
      expect(rumor?.recipientPubkey).toBe(ALICE);
    });
  });

  describe('sendDM', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      clearCache(ME);
    });

    it('defaults to NIP-17', async () => {
      const { giftWrap } = await import('@nostr-dev-kit/ndk');
      const { sendDM } = await import('./dm');
      await sendDM(ALICE, 'test', 'nip17', ME);
      expect(giftWrap).toHaveBeenCalled();
    });

    it('uses NIP-04 when specified', async () => {
      const { sendDM } = await import('./dm');
      await sendDM(ALICE, 'test', 'nip04', ME);
      expect(mockEncrypt).toHaveBeenCalled();
    });

    it('throws if publish fails', async () => {
      mockPublish.mockRejectedValueOnce(new Error('no relay'));
      const { sendDM } = await import('./dm');
      await expect(sendDM(ALICE, 'test', 'nip04', ME)).rejects.toThrow(/sendDM failed/);
    });
  });

  describe('fetchDMHistory', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      clearCache(ME);
    });

    it('returns messages with hasMore flag', async () => {
      // Simulate a NIP-04 fetch returning 50 events (at cap) for one filter
      const events = new Set(
        Array.from({ length: 50 }, (_, i) => ({
          id: `ev${i}`,
          pubkey: ALICE,
          kind: 4,
          content: `enc-${i}`,
          tags: [['p', ME]],
          created_at: 1000 + i,
          decrypt: mockDecrypt,
        })),
      );
      mockFetchEvents.mockResolvedValue(events);

      const { fetchDMHistory } = await import('./dm');
      const { messages, hasMore } = await fetchDMHistory(ME, ALICE, { limit: 50 });
      expect(messages.length).toBeGreaterThan(0);
      expect(hasMore).toBe(true);
      // Plaintext now cached
      expect(getPlaintext(ME, 'ev0')).toBe('decrypted:enc-0');
    });

    it('passes `before` as `until` filter when paginating', async () => {
      mockFetchEvents.mockResolvedValue(new Set());
      const { fetchDMHistory } = await import('./dm');
      await fetchDMHistory(ME, ALICE, { before: 500, limit: 10 });

      const calls = mockFetchEvents.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      // Every call should carry until:500
      for (const [filter] of calls) {
        expect(filter.until).toBe(500);
      }
    });

    it('returns cache hit on first page without `before`', async () => {
      // Pre-seed cache with a plaintext NIP-04 message between me and Alice
      const { putEvent, putPlaintext } = await import('./dm-cache');
      putEvent(ME, {
        id: 'cached-1',
        pubkey: ALICE,
        kind: 4,
        content: '<enc>',
        tags: [['p', ME]],
        created_at: 100,
      });
      putPlaintext(ME, 'cached-1', 'hello from cache');

      mockFetchEvents.mockResolvedValue(new Set());
      const { fetchDMHistory } = await import('./dm');
      const { messages } = await fetchDMHistory(ME, ALICE, { limit: 50 });
      expect(messages.some((m) => m.id === 'cached-1' && m.content === 'hello from cache')).toBe(true);
    });
  });

  describe('discoverDMThreads', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      clearCache(ME);
    });

    it('returns empty map when cache empty and no signer', async () => {
      const { discoverDMThreads } = await import('./dm');
      const threads = await discoverDMThreads(ME);
      expect(threads.size).toBe(0);
    });

    it('returns cached threads instantly without waiting on relay sync', async () => {
      const { putEvent, putRumor } = await import('./dm-cache');
      putEvent(ME, {
        id: 'wrap-1',
        pubkey: 'ephemeral',
        kind: 1059,
        content: '<sealed>',
        tags: [['p', ME]],
        created_at: 500,
      });
      putRumor(ME, {
        rumorId: 'r-1',
        wrapId: 'wrap-1',
        senderPubkey: ALICE,
        recipientPubkey: ME,
        content: 'hi there',
        createdAt: 500,
      });

      mockFetchEvents.mockResolvedValue(new Set());
      const { discoverDMThreads } = await import('./dm');
      const threads = await discoverDMThreads(ME);
      expect(threads.has(ALICE)).toBe(true);
      expect(threads.get(ALICE)?.lastMessage).toBe('hi there');
      expect(threads.get(ALICE)?.protocol).toBe('nip17');
    });

    it('updates lastFullScanAt after a forced full scan', async () => {
      mockFetchEvents.mockResolvedValue(new Set());
      const { discoverDMThreads } = await import('./dm');
      await discoverDMThreads(ME, { forceFullScan: true });
      // Background task is async; wait a microtask
      await new Promise((r) => setTimeout(r, 10));
      const sync = getSyncState(ME);
      expect(sync.lastFullScanAt).toBeGreaterThan(0);
    });
  });
});
