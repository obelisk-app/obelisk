import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./db', () => ({
  prisma: {
    server: { findUnique: vi.fn(), update: vi.fn() },
    wotEntry: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    wotOverride: { findUnique: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));

vi.mock('./nostr', () => ({
  fetchFollowing: vi.fn(),
}));

import { refreshWot, isInWot, maybeAutoRefreshWot } from './wot';
import { prisma } from './db';
import { fetchFollowing } from './nostr';

const mockPrisma = prisma as any;
const mockFetch = fetchFollowing as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('refreshWot', () => {
  it('throws when server has no referente', async () => {
    mockPrisma.server.findUnique.mockResolvedValue({ id: 's1', referentePubkey: null });
    await expect(refreshWot('s1')).rejects.toThrow('referentePubkey');
  });

  it('throws when server not found', async () => {
    mockPrisma.server.findUnique.mockResolvedValue(null);
    await expect(refreshWot('s1')).rejects.toThrow('not found');
  });

  it('diffs follow list and applies adds + removes', async () => {
    mockPrisma.server.findUnique.mockResolvedValue({ id: 's1', referentePubkey: 'ref' });
    mockFetch.mockResolvedValue(['a', 'b', 'c']);
    mockPrisma.wotEntry.findMany.mockResolvedValue([{ pubkey: 'b' }, { pubkey: 'd' }]);
    mockPrisma.wotEntry.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.wotEntry.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.server.update.mockResolvedValue({});

    const result = await refreshWot('s1');

    expect(result.added).toBe(2);
    expect(result.removed).toBe(1);
    expect(result.total).toBe(3);

    const createCall = mockPrisma.wotEntry.createMany.mock.calls[0][0];
    expect(createCall.data.map((e: any) => e.pubkey).sort()).toEqual(['a', 'c']);
    const deleteCall = mockPrisma.wotEntry.deleteMany.mock.calls[0][0];
    expect(deleteCall.where.pubkey.in).toEqual(['d']);
  });

  it('handles empty diff (no adds, no removes)', async () => {
    mockPrisma.server.findUnique.mockResolvedValue({ id: 's1', referentePubkey: 'ref' });
    mockFetch.mockResolvedValue(['a', 'b']);
    mockPrisma.wotEntry.findMany.mockResolvedValue([{ pubkey: 'a' }, { pubkey: 'b' }]);
    mockPrisma.server.update.mockResolvedValue({});

    const result = await refreshWot('s1');
    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.total).toBe(2);
    expect(mockPrisma.wotEntry.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.wotEntry.deleteMany).not.toHaveBeenCalled();
  });
});

describe('isInWot', () => {
  it('returns follow when WotEntry exists', async () => {
    mockPrisma.wotEntry.findUnique.mockResolvedValue({ id: 'e1' });
    mockPrisma.wotOverride.findUnique.mockResolvedValue(null);
    const r = await isInWot('s1', 'pk1');
    expect(r).toEqual({ allowed: true, reason: 'follow' });
  });

  it('returns override when only WotOverride exists', async () => {
    mockPrisma.wotEntry.findUnique.mockResolvedValue(null);
    mockPrisma.wotOverride.findUnique.mockResolvedValue({ id: 'o1' });
    const r = await isInWot('s1', 'pk1');
    expect(r).toEqual({ allowed: true, reason: 'override' });
  });

  it('returns none when neither exists', async () => {
    mockPrisma.wotEntry.findUnique.mockResolvedValue(null);
    mockPrisma.wotOverride.findUnique.mockResolvedValue(null);
    const r = await isInWot('s1', 'pk1');
    expect(r).toEqual({ allowed: false, reason: 'none' });
  });
});

describe('maybeAutoRefreshWot', () => {
  it('skips when wot is disabled', async () => {
    mockPrisma.server.findUnique.mockResolvedValue({
      wotEnabled: false,
      referentePubkey: 'ref',
      referenteFetchedAt: null,
    });
    await maybeAutoRefreshWot('s1');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips when cache is fresh', async () => {
    mockPrisma.server.findUnique.mockResolvedValue({
      wotEnabled: true,
      referentePubkey: 'ref',
      referenteFetchedAt: new Date(),
    });
    await maybeAutoRefreshWot('s1');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refreshes when cache is stale', async () => {
    mockPrisma.server.findUnique
      .mockResolvedValueOnce({
        wotEnabled: true,
        referentePubkey: 'ref',
        referenteFetchedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      })
      // refreshWot inner call
      .mockResolvedValueOnce({ id: 's1', referentePubkey: 'ref' });
    mockFetch.mockResolvedValue(['a']);
    mockPrisma.wotEntry.findMany.mockResolvedValue([]);
    mockPrisma.wotEntry.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.server.update.mockResolvedValue({});

    await maybeAutoRefreshWot('s1');
    expect(mockFetch).toHaveBeenCalledWith('ref');
  });

  it('swallows errors silently', async () => {
    mockPrisma.server.findUnique.mockRejectedValue(new Error('db down'));
    await expect(maybeAutoRefreshWot('s1')).resolves.toBeUndefined();
  });
});
