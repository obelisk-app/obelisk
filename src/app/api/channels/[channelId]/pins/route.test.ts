import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockChannelFindUnique = vi.fn();
const mockMessageFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    channel: { findUnique: (...args: any[]) => mockChannelFindUnique(...args) },
    message: { findMany: (...args: any[]) => mockMessageFindMany(...args) },
  },
}));

const mockGetAuthPubkey = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getAuthPubkey: (...args: any[]) => mockGetAuthPubkey(...args),
}));

const mockGetAuthorProfile = vi.fn();
vi.mock('@/lib/profile-sync', () => ({
  getAuthorProfile: (...args: any[]) => mockGetAuthorProfile(...args),
  SYSTEM_PUBKEY:
    '0000000000000000000000000000000000000000000000000000000000000000',
}));

import { GET } from './route';

function makeReq() {
  return new NextRequest('http://localhost/api/channels/ch1/pins');
}

describe('GET /api/channels/:channelId/pins', () => {
  const params = Promise.resolve({ channelId: 'ch1' });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthPubkey.mockResolvedValue('user1');
  });

  it('returns 401 when not authenticated', async () => {
    mockGetAuthPubkey.mockResolvedValue(null);
    const res = await GET(makeReq(), { params });
    expect(res.status).toBe(401);
  });

  it('returns 404 when channel does not exist', async () => {
    mockChannelFindUnique.mockResolvedValue(null);
    const res = await GET(makeReq(), { params });
    expect(res.status).toBe(404);
  });

  it('returns pinned messages newest-first with author enrichment', async () => {
    mockChannelFindUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1' });
    mockMessageFindMany.mockResolvedValue([
      { id: 'm2', authorPubkey: 'a', content: 'second', pinnedAt: new Date() },
      { id: 'm1', authorPubkey: 'b', content: 'first', pinnedAt: new Date() },
    ]);
    mockGetAuthorProfile.mockImplementation(async (pk: string) => ({
      pubkey: pk,
      displayName: pk.toUpperCase(),
      picture: null,
      nip05: null,
      nickname: null,
    }));

    const res = await GET(makeReq(), { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.messages).toHaveLength(2);
    expect(data.messages[0].author.displayName).toBe('A');
    expect(data.messages[1].author.displayName).toBe('B');

    const findArg = mockMessageFindMany.mock.calls[0][0];
    expect(findArg.where).toMatchObject({
      channelId: 'ch1',
      deletedAt: null,
      pinnedAt: { not: null },
    });
    expect(findArg.orderBy).toEqual({ pinnedAt: 'desc' });
  });

  it('de-duplicates author lookups within a single request', async () => {
    mockChannelFindUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1' });
    mockMessageFindMany.mockResolvedValue([
      { id: 'm2', authorPubkey: 'a', content: 'x', pinnedAt: new Date() },
      { id: 'm1', authorPubkey: 'a', content: 'y', pinnedAt: new Date() },
    ]);
    mockGetAuthorProfile.mockResolvedValue({
      pubkey: 'a',
      displayName: 'Alice',
      picture: null,
      nip05: null,
      nickname: null,
    });

    const res = await GET(makeReq(), { params });
    expect(res.status).toBe(200);
    expect(mockGetAuthorProfile).toHaveBeenCalledTimes(1);
  });
});
