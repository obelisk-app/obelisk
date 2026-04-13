import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    message: { findMany: vi.fn() },
    member: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/lib/channel-access', () => ({ resolveMemberAccess: vi.fn() }));
vi.mock('@/lib/roles', () => ({ canReadChannel: vi.fn() }));

import { GET } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { resolveMemberAccess } from '@/lib/channel-access';
import { canReadChannel } from '@/lib/roles';

const mockPrisma = prisma as any;
const mockAuth = getAuthPubkey as ReturnType<typeof vi.fn>;
const mockAccess = resolveMemberAccess as ReturnType<typeof vi.fn>;
const mockCanRead = canReadChannel as ReturnType<typeof vi.fn>;

function req(qs: string) {
  return new NextRequest(`http://localhost/api/forum/posts/meta${qs}`, {
    method: 'GET',
    headers: { cookie: 'session=tok' },
  });
}

describe('GET /api/forum/posts/meta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue('pk1');
    mockPrisma.member.findMany.mockResolvedValue([{ serverId: 's1' }]);
  });

  it('returns 401 without auth', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req('?ids=p1'));
    expect(res.status).toBe(401);
  });

  it('returns empty when ids empty', async () => {
    const res = await GET(req(''));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ posts: [] });
  });

  it('returns post metadata for accessible ids', async () => {
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'p1',
        title: 'Hello',
        channelId: 'c1',
        channel: { id: 'c1', name: 'forum', serverId: 's1', readPermission: null, readRoleIds: [] },
      },
    ]);
    const res = await GET(req('?ids=p1'));
    const data = await res.json();
    expect(data.posts).toEqual([
      { id: 'p1', title: 'Hello', coverImage: null, channelId: 'c1', channelName: 'forum', serverId: 's1' },
    ]);
  });

  it('filters out posts from servers the viewer is not a member of', async () => {
    mockPrisma.member.findMany.mockResolvedValue([]); // not a member of s1
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'p1',
        title: 'Hello',
        channelId: 'c1',
        channel: { id: 'c1', name: 'forum', serverId: 's1', readPermission: null, readRoleIds: [] },
      },
    ]);
    const res = await GET(req('?ids=p1'));
    expect((await res.json()).posts).toEqual([]);
  });

  it('filters out posts whose channel readPermission denies the viewer', async () => {
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'p1',
        title: 'Secret',
        channelId: 'c1',
        channel: { id: 'c1', name: 'secret', serverId: 's1', readPermission: 'admin', readRoleIds: [] },
      },
    ]);
    mockAccess.mockResolvedValue({ role: 'member', customRoleIds: [] });
    mockCanRead.mockReturnValue(false);
    const res = await GET(req('?ids=p1'));
    expect((await res.json()).posts).toEqual([]);
  });
});
