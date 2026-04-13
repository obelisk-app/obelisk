import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    postSubscription: { findMany: vi.fn() },
    member: { findMany: vi.fn() },
    message: { count: vi.fn(), findMany: vi.fn() },
    mention: { count: vi.fn() },
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

function req(qs = '') {
  return new NextRequest(`http://localhost/api/forum/posts/followed${qs}`, {
    method: 'GET',
    headers: { cookie: 'session=tok' },
  });
}

describe('GET /api/forum/posts/followed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue('pk1');
    mockPrisma.member.findMany.mockResolvedValue([{ serverId: 's1' }]);
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.mention.count.mockResolvedValue(0);
  });

  it('401 without auth', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('returns followed posts the viewer can still read', async () => {
    mockPrisma.postSubscription.findMany.mockResolvedValue([{ postId: 'p1', lastReadAt: null }]);
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'p1', title: 'Hello', coverImage: null, deletedAt: null,
        channel: { id: 'c1', name: 'forum', serverId: 's1', readPermission: null, readRoleIds: [] },
      },
    ]);
    const res = await GET(req());
    const data = await res.json();
    expect(data.posts).toEqual([
      {
        id: 'p1',
        title: 'Hello',
        coverImage: null,
        channelId: 'c1',
        channelName: 'forum',
        serverId: 's1',
        unreadCount: 0,
        hasMention: false,
        lastReadAt: null,
      },
    ]);
  });

  it('surfaces hasMention when a Mention row targets the viewer in the post thread', async () => {
    mockPrisma.postSubscription.findMany.mockResolvedValue([{ postId: 'p1', lastReadAt: null }]);
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'p1', title: 'Hello', coverImage: null, deletedAt: null,
        channel: { id: 'c1', name: 'forum', serverId: 's1', readPermission: null, readRoleIds: [] },
      },
    ]);
    mockPrisma.mention.count.mockResolvedValue(1);
    const res = await GET(req());
    const data = await res.json();
    expect(data.posts[0].hasMention).toBe(true);
  });

  it('omits deleted or non-post messages', async () => {
    mockPrisma.postSubscription.findMany.mockResolvedValue([{ postId: 'p1', lastReadAt: null }]);
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'p1', title: null, coverImage: null, deletedAt: null,
        channel: { id: 'c1', name: 'forum', serverId: 's1', readPermission: null, readRoleIds: [] },
      },
    ]);
    const res = await GET(req());
    expect((await res.json()).posts).toEqual([]);
  });

  it('filters by serverId when provided', async () => {
    mockPrisma.member.findMany.mockResolvedValue([{ serverId: 's1' }, { serverId: 's2' }]);
    mockPrisma.postSubscription.findMany.mockResolvedValue([
      { postId: 'p1', lastReadAt: null },
      { postId: 'p2', lastReadAt: null },
    ]);
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'p1', title: 'Hi', coverImage: null, deletedAt: null,
        channel: { id: 'c1', name: 'forum', serverId: 's1', readPermission: null, readRoleIds: [] },
      },
      {
        id: 'p2', title: 'Other', coverImage: null, deletedAt: null,
        channel: { id: 'c2', name: 'other', serverId: 's2', readPermission: null, readRoleIds: [] },
      },
    ]);
    const res = await GET(req('?serverId=s1'));
    const data = await res.json();
    expect(data.posts).toHaveLength(1);
    expect(data.posts[0].id).toBe('p1');
  });
});
