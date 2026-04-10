import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    channel: { findUnique: vi.fn() },
    message: { findMany: vi.fn(), create: vi.fn() },
    ban: { findUnique: vi.fn() },
    mute: { findFirst: vi.fn() },
    member: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
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
});
