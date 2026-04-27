import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    member: { findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    ban: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/api-auth', () => ({
  getAuthPubkey: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  validateSession: vi.fn(),
}));

vi.mock('@/lib/profile-sync', () => ({
  fetchProfileFromRelay: vi.fn(),
}));

import { POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { fetchProfileFromRelay } from '@/lib/profile-sync';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;
const mockFetchProfile = fetchProfileFromRelay as ReturnType<typeof vi.fn>;

function makeRequest() {
  return new NextRequest('http://localhost/api/members/me/sync-nostr', { method: 'POST' });
}

describe('POST /api/members/me/sync-nostr', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 if not authenticated', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 200 with updated:0 if user has no active memberships', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.member.findMany.mockResolvedValue([]);
    mockPrisma.ban.findMany.mockResolvedValue([]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 0 });
    expect(mockPrisma.member.updateMany).not.toHaveBeenCalled();
  });

  it('returns 200 with updated:0 if every membership is on a banned server', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.member.findMany.mockResolvedValue([
      { id: 'm1', serverId: 's1' },
    ]);
    mockPrisma.ban.findMany.mockResolvedValue([{ serverId: 's1' }]);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 0 });
    expect(mockPrisma.member.updateMany).not.toHaveBeenCalled();
  });

  it('returns 502 if relay fetch fails', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.member.findMany.mockResolvedValue([{ id: 'm1', serverId: 's1' }]);
    mockPrisma.ban.findMany.mockResolvedValue([]);
    mockFetchProfile.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
  });

  it('updates profile across all non-banned memberships and never creates new rows', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.member.findMany.mockResolvedValue([
      { id: 'm1', serverId: 's1' },
      { id: 'm2', serverId: 's2' },
    ]);
    mockPrisma.ban.findMany.mockResolvedValue([]);
    mockFetchProfile.mockResolvedValue({ displayName: 'Alice', picture: 'pic.jpg' });
    mockPrisma.member.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.member.findUnique.mockResolvedValue({
      pubkey: 'pk1',
      displayName: 'Alice',
      picture: 'pic.jpg',
      nip05: null,
      about: null,
      banner: null,
      lud16: null,
      website: null,
      nickname: null,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.displayName).toBe('Alice');
    expect(mockPrisma.member.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m1', 'm2'] } },
      data: expect.objectContaining({ displayName: 'Alice', picture: 'pic.jpg' }),
    });
  });

  it('skips banned servers in the update set', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.member.findMany.mockResolvedValue([
      { id: 'm1', serverId: 's1' },
      { id: 'm2', serverId: 's2' },
    ]);
    mockPrisma.ban.findMany.mockResolvedValue([{ serverId: 's2' }]);
    mockFetchProfile.mockResolvedValue({ displayName: 'Alice' });
    mockPrisma.member.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.member.findUnique.mockResolvedValue({
      pubkey: 'pk1', displayName: 'Alice', picture: null, nip05: null,
      about: null, banner: null, lud16: null, website: null, nickname: null,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockPrisma.member.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m1'] } },
      data: expect.any(Object),
    });
  });
});
