import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the dynamic `./db-server` import used inside getPrisma().
// We register the mock under both the relative specifier (matches the
// dynamic `import('./db-server')` inside profile-sync.ts) and the alias
// (matches any static `@/lib/db-server` imports) to be safe.
const mockPrisma = {
  member: {
    upsert: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
};

vi.mock('./db-server', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/db-server', () => ({ prisma: mockPrisma }));

// Mock NDK so fetchProfileFromRelay never actually hits the network.
// `ensureConnected` in profile-sync.ts waits up to 5s for a relay with
// `connectivity.status === 1`, so we seed one fake "connected" relay.
const mockFetchProfile = vi.fn();
vi.mock('@nostr-dev-kit/ndk', () => {
  class NDK {
    pool = {
      relays: new Map<string, { connectivity: { status: number } }>([
        ['wss://mock', { connectivity: { status: 1 } }],
      ]),
    };
    async connect() {}
    getUser() {
      return {
        pubkey: 'pk',
        profile: null as any,
        async fetchProfile() {
          const result = await mockFetchProfile();
          (this as any).profile = result;
          return result;
        },
      };
    }
  }
  return { default: NDK };
});

import {
  syncProfileToDb,
  fetchAndSyncProfileDeduped,
  triggerBackgroundRefreshIfStale,
  getAuthorProfile,
  __resetProfileSyncState,
} from './profile-sync';

describe('profile-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetProfileSyncState();
    mockFetchProfile.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('syncProfileToDb', () => {
    it('stamps profileUpdatedAt by default', async () => {
      mockPrisma.member.upsert.mockResolvedValue({});
      await syncProfileToDb('pk1', 's1', { displayName: 'Alice' });

      const call = mockPrisma.member.upsert.mock.calls[0][0];
      expect(call.update.profileUpdatedAt).toBeInstanceOf(Date);
      expect(call.create.profileUpdatedAt).toBeInstanceOf(Date);
      expect(call.update.displayName).toBe('Alice');
    });

    it('omits profileUpdatedAt when markFresh is false', async () => {
      mockPrisma.member.upsert.mockResolvedValue({});
      await syncProfileToDb(
        'pk1',
        's1',
        { displayName: 'Alice', picture: 'pic.jpg' },
        { markFresh: false },
      );

      const call = mockPrisma.member.upsert.mock.calls[0][0];
      expect(call.update.profileUpdatedAt).toBeUndefined();
      expect(call.create.profileUpdatedAt).toBeUndefined();
      expect(call.update.displayName).toBe('Alice');
      expect(call.update.picture).toBe('pic.jpg');
    });
  });

  describe('fetchAndSyncProfileDeduped', () => {
    it('returns the same promise for concurrent callers with the same key', async () => {
      // Use a pre-made deferred so the resolver exists before any call;
      // mockImplementation-based capture races with async microtasks.
      let resolveFetch!: (v: any) => void;
      const pending = new Promise((r) => { resolveFetch = r; });
      mockFetchProfile.mockReturnValue(pending);

      const p1 = fetchAndSyncProfileDeduped('pk1', 's1');
      const p2 = fetchAndSyncProfileDeduped('pk1', 's1');
      expect(p1).toBe(p2);

      // Resolve to null so we short-circuit before syncProfileToDb.
      await Promise.resolve();
      resolveFetch(null);
      await p1;

      expect(mockFetchProfile).toHaveBeenCalledTimes(1);
    });

    it('different keys do not share a promise', async () => {
      // Return null to short-circuit before syncProfileToDb — we only
      // care about dedup + call-count semantics here.
      mockFetchProfile.mockResolvedValue(null);

      const p1 = fetchAndSyncProfileDeduped('pk1', 's1');
      const p2 = fetchAndSyncProfileDeduped('pk2', 's1');
      expect(p1).not.toBe(p2);
      await Promise.all([p1, p2]);
      expect(mockFetchProfile).toHaveBeenCalledTimes(2);
    });

    it('evicts inFlight entry after completion so new calls trigger a new fetch', async () => {
      mockFetchProfile.mockResolvedValue(null);

      await fetchAndSyncProfileDeduped('pk1', 's1');
      await fetchAndSyncProfileDeduped('pk1', 's1');
      expect(mockFetchProfile).toHaveBeenCalledTimes(2);
    });
  });

  describe('triggerBackgroundRefreshIfStale', () => {
    it('does nothing when no stale members exist', async () => {
      mockPrisma.member.count.mockResolvedValue(0);
      await triggerBackgroundRefreshIfStale('s1', 6);
      expect(mockPrisma.member.count).toHaveBeenCalledOnce();
      expect(mockPrisma.member.findMany).not.toHaveBeenCalled();
    });

    it('enforces the 60s cooldown per server', async () => {
      mockPrisma.member.count.mockResolvedValue(3);
      mockPrisma.member.findMany.mockResolvedValue([]); // no members to refresh

      await triggerBackgroundRefreshIfStale('s1', 6);
      // Second call within cooldown window — should short-circuit before count().
      await triggerBackgroundRefreshIfStale('s1', 6);
      expect(mockPrisma.member.count).toHaveBeenCalledTimes(1);
    });

    it('cooldown is per-server, not global', async () => {
      mockPrisma.member.count.mockResolvedValue(0);
      await triggerBackgroundRefreshIfStale('s1', 6);
      await triggerBackgroundRefreshIfStale('s2', 6);
      expect(mockPrisma.member.count).toHaveBeenCalledTimes(2);
    });

    it('queries stale members using the correct cutoff', async () => {
      mockPrisma.member.count.mockResolvedValue(0);
      await triggerBackgroundRefreshIfStale('s1', 6);

      const call = mockPrisma.member.count.mock.calls[0][0];
      expect(call.where.serverId).toBe('s1');
      expect(call.where.OR).toEqual([
        { profileUpdatedAt: null },
        { profileUpdatedAt: { lt: expect.any(Date) } },
      ]);
    });
  });

  describe('getAuthorProfile', () => {
    it('returns null when the member does not exist', async () => {
      mockPrisma.member.findUnique.mockResolvedValue(null);
      const result = await getAuthorProfile('pk1', 's1');
      expect(result).toBeNull();
    });

    it('returns the cached profile fields', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({
        pubkey: 'pk1',
        displayName: 'Alice',
        picture: 'pic.jpg',
        nip05: 'alice@example.com',
        nickname: null,
        profileUpdatedAt: new Date(),
      });
      const result = await getAuthorProfile('pk1', 's1');
      expect(result).toEqual({
        pubkey: 'pk1',
        displayName: 'Alice',
        picture: 'pic.jpg',
        nip05: 'alice@example.com',
        nickname: null,
      });
    });

    it('still returns the stub when profile fields are null (profile not yet synced)', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({
        pubkey: 'pk1',
        displayName: null,
        picture: null,
        nip05: null,
        nickname: null,
        profileUpdatedAt: null,
      });
      // Avoid errors from the background fire-and-forget relay fetch.
      mockFetchProfile.mockResolvedValue(null);

      const result = await getAuthorProfile('pk1', 's1');
      expect(result).toEqual({
        pubkey: 'pk1',
        displayName: null,
        picture: null,
        nip05: null,
        nickname: null,
      });
    });
  });
});
