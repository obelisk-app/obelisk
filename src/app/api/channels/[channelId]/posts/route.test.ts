import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    channel: { findUnique: vi.fn() },
    message: { findMany: vi.fn(), create: vi.fn() },
    ban: { findUnique: vi.fn() },
    mute: { findFirst: vi.fn() },
    member: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUnique: vi.fn() },
    server: { findUnique: vi.fn() },
    forumTag: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
  },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/lib/auth', () => ({ validateSession: vi.fn() }));

import { GET, POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;

function makeRequest(method: string, body?: any) {
  const init: any = { method, headers: { cookie: 'session=tok' } };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  return new NextRequest('http://localhost/api/channels/ch1/posts', init);
}

const ctx = { params: Promise.resolve({ channelId: 'ch1' }) };

describe('GET /api/channels/[channelId]/posts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns posts for a forum channel', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.channel.findUnique.mockResolvedValue({ id: 'ch1', type: 'forum' });
    mockPrisma.message.findMany.mockResolvedValue([
      { id: 'p1', channelId: 'ch1', authorPubkey: 'pk1', title: 'Hello', content: 'World',
        createdAt: new Date(), _count: { replies: 3 }, replies: [{ createdAt: new Date() }], tags: [] },
    ]);

    const res = await GET(makeRequest('GET'), ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.posts).toHaveLength(1);
    expect(data.posts[0].title).toBe('Hello');
    expect(data.posts[0].replyCount).toBe(3);
  });

  it('returns 400 for non-forum channel', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.channel.findUnique.mockResolvedValue({ id: 'ch1', type: 'text' });

    const res = await GET(makeRequest('GET'), ctx);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/channels/[channelId]/posts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a forum post with title and content', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.channel.findUnique.mockResolvedValue({ id: 'ch1', type: 'forum', serverId: 'srv1' });
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockPrisma.mute.findFirst.mockResolvedValue(null);
    mockPrisma.message.create.mockResolvedValue({
      id: 'p1', channelId: 'ch1', authorPubkey: 'pk1',
      title: 'My Post', content: 'Post body', tags: [],
    });

    const res = await POST(makeRequest('POST', { title: 'My Post', content: 'Post body' }), ctx);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.title).toBe('My Post');
  });

  it('returns 400 for non-forum channel', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.channel.findUnique.mockResolvedValue({ id: 'ch1', type: 'text', serverId: 'srv1' });

    const res = await POST(makeRequest('POST', { title: 'x', content: 'y' }), ctx);
    expect(res.status).toBe(400);
  });

  it('returns 400 without title', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.channel.findUnique.mockResolvedValue({ id: 'ch1', type: 'forum', serverId: 'srv1' });
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockPrisma.mute.findFirst.mockResolvedValue(null);

    const res = await POST(makeRequest('POST', { content: 'body' }), ctx);
    expect(res.status).toBe(400);
  });

  it('auto-creates custom tags from tagNames', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.channel.findUnique.mockResolvedValue({ id: 'ch1', type: 'forum', serverId: 'srv1' });
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockPrisma.mute.findFirst.mockResolvedValue(null);
    // No existing tags — helper will create them.
    mockPrisma.forumTag.findMany.mockResolvedValue([]);
    mockPrisma.forumTag.findFirst.mockResolvedValue(null);
    mockPrisma.forumTag.create
      .mockResolvedValueOnce({ id: 't1', name: '🔥 hot' })
      .mockResolvedValueOnce({ id: 't2', name: 'question' });
    mockPrisma.message.create.mockImplementation(async (args: any) => ({
      id: 'p1', channelId: 'ch1', authorPubkey: 'pk1',
      title: args.data.title, content: args.data.content, tags: [],
    }));

    const res = await POST(
      makeRequest('POST', { title: 'T', content: 'C', tagNames: ['🔥 hot', 'question'] }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect(mockPrisma.forumTag.create).toHaveBeenCalledTimes(2);
    const createArg = mockPrisma.message.create.mock.calls[0][0];
    expect(createArg.data.tags.create).toEqual([
      { tagId: 't1' },
      { tagId: 't2' },
    ]);
  });

  it('returns 403 channel_write_locked when member posts in mod-only forum channel', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch1', type: 'forum', serverId: 'srv1', writePermission: 'mod',
    });
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockPrisma.mute.findFirst.mockResolvedValue(null);
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
      displayName: null, picture: null,
    });

    const res = await POST(makeRequest('POST', { title: 'x', content: 'y' }), ctx);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('channel_write_locked');
  });
});
