import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    message: { findUnique: vi.fn() },
    member: { findUnique: vi.fn() },
    postSubscription: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/lib/channel-access', () => ({ resolveMemberAccess: vi.fn() }));
vi.mock('@/lib/roles', () => ({ canReadChannel: vi.fn() }));

import { POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { resolveMemberAccess } from '@/lib/channel-access';
import { canReadChannel } from '@/lib/roles';

const mockPrisma = prisma as any;
const mockAuth = getAuthPubkey as ReturnType<typeof vi.fn>;
const mockAccess = resolveMemberAccess as ReturnType<typeof vi.fn>;
const mockCanRead = canReadChannel as ReturnType<typeof vi.fn>;

function req() {
  return new NextRequest('http://localhost/api/forum/posts/p1/follow', {
    method: 'POST',
    headers: { cookie: 'session=tok' },
  });
}

async function call() {
  return POST(req(), { params: Promise.resolve({ postId: 'p1' }) });
}

describe('POST /api/forum/posts/[postId]/follow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue('pk1');
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'p1',
      title: 'Post',
      deletedAt: null,
      channel: { id: 'c1', serverId: 's1', readPermission: null, readRoleIds: [] },
    });
    mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1' });
  });

  it('401 without auth', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
  });

  it('404 when post not found', async () => {
    mockPrisma.message.findUnique.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
  });

  it('404 when message has no title (chat message, not a post)', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'p1', title: null, deletedAt: null,
      channel: { id: 'c1', serverId: 's1', readPermission: null, readRoleIds: [] },
    });
    const res = await call();
    expect(res.status).toBe(404);
  });

  it('403 when not a member of the server', async () => {
    mockPrisma.member.findUnique.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(403);
  });

  it('403 when channel readPermission denies viewer', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'p1', title: 'Post', deletedAt: null,
      channel: { id: 'c1', serverId: 's1', readPermission: 'admin', readRoleIds: [] },
    });
    mockAccess.mockResolvedValue({ role: 'member', customRoleIds: [] });
    mockCanRead.mockReturnValue(false);
    const res = await call();
    expect(res.status).toBe(403);
  });

  it('creates subscription when not already following', async () => {
    mockPrisma.postSubscription.findUnique.mockResolvedValue(null);
    mockPrisma.postSubscription.create.mockResolvedValue({ id: 'sub1' });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ following: true });
    expect(mockPrisma.postSubscription.create).toHaveBeenCalled();
  });

  it('deletes subscription when toggling off', async () => {
    mockPrisma.postSubscription.findUnique.mockResolvedValue({ id: 'sub1' });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ following: false });
    expect(mockPrisma.postSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub1' } });
  });
});
