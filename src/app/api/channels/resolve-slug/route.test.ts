import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    member: { findMany: vi.fn(), findUnique: vi.fn() },
    channel: { findMany: vi.fn() },
    message: { findFirst: vi.fn() },
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
  return new NextRequest(`http://localhost/api/channels/resolve-slug${qs}`, {
    method: 'GET',
    headers: { cookie: 'session=tok' },
  });
}

describe('GET /api/channels/resolve-slug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue('pk1');
    mockPrisma.member.findMany.mockResolvedValue([
      { serverId: 's1', server: { id: 's1', name: 'Test Server' } },
    ]);
    mockPrisma.channel.findMany.mockResolvedValue([
      { id: 'c1', serverId: 's1', name: 'general', readPermission: null, readRoleIds: [] },
    ]);
  });

  it('returns 401 without auth', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req('?c=general'));
    expect(res.status).toBe(401);
  });

  it('returns channelName on basic resolution', async () => {
    const res = await GET(req('?c=general'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      serverId: 's1',
      channelId: 'c1',
      channelName: 'general',
      noAccess: false,
      postTitle: null,
      messageAuthorName: null,
    });
  });

  it('returns postTitle when p= provided and post exists', async () => {
    mockPrisma.message.findFirst.mockResolvedValue({ title: 'Hello World' });
    const res = await GET(req('?c=general&p=msg123'));
    const data = await res.json();
    expect(data.postTitle).toBe('Hello World');
    expect(mockPrisma.message.findFirst).toHaveBeenCalledWith({
      where: { id: 'msg123', channelId: 'c1', deletedAt: null },
      select: { title: true },
    });
  });

  it('returns null postTitle when post not found', async () => {
    mockPrisma.message.findFirst.mockResolvedValue(null);
    const res = await GET(req('?c=general&p=missing'));
    const data = await res.json();
    expect(data.postTitle).toBeNull();
  });

  it('returns messageAuthorName when m= provided', async () => {
    mockPrisma.message.findFirst.mockResolvedValue({ authorPubkey: 'pk-author' });
    mockPrisma.member.findUnique.mockResolvedValue({ displayName: 'Alice' });
    const res = await GET(req('?c=general&m=msg1'));
    const data = await res.json();
    expect(data.messageAuthorName).toBe('Alice');
  });

  it('returns noAccess:true when viewer cannot read the channel', async () => {
    mockPrisma.channel.findMany.mockResolvedValue([
      { id: 'c1', serverId: 's1', name: 'general', readPermission: 'admin', readRoleIds: [] },
    ]);
    mockAccess.mockResolvedValue({ role: 'member', customRoleIds: [] });
    mockCanRead.mockReturnValue(false);
    const res = await GET(req('?c=general'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      serverId: 's1',
      channelId: 'c1',
      channelName: 'general',
      noAccess: true,
      postTitle: null,
      messageAuthorName: null,
    });
  });

  it('returns 404 for unknown slug', async () => {
    mockPrisma.channel.findMany.mockResolvedValue([]);
    const res = await GET(req('?c=unknown'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when c missing', async () => {
    const res = await GET(req('?'));
    expect(res.status).toBe(400);
  });
});
