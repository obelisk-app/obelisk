import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    channel: { findUnique: vi.fn() },
    message: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    ban: { findUnique: vi.fn() },
    mute: { findFirst: vi.fn() },
    member: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUnique: vi.fn() },
    server: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/api-auth', () => ({
  getAuthPubkey: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  validateSession: vi.fn(),
}));

import { POST, PATCH } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;

function makeRequest(body: any) {
  return new NextRequest('http://localhost/api/channels/ch1/messages', {
    method: 'POST',
    headers: {
      cookie: 'session=test-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

const routeContext = { params: Promise.resolve({ channelId: 'ch1' }) };

describe('POST /api/channels/[channelId]/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.channel.findUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1' });
  });

  it('returns 401 without session', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ content: 'hello' }), routeContext);
    expect(res.status).toBe(401);
  });

  it('returns 403 when user is banned', async () => {
    mockGetAuth.mockResolvedValue('banned-user');
    mockPrisma.ban.findUnique.mockResolvedValue({
      id: 'b1', serverId: 'srv1', pubkey: 'banned-user',
    });

    const res = await POST(makeRequest({ content: 'hello' }), routeContext);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/banned/i);
  });

  it('returns 403 when user is muted', async () => {
    mockGetAuth.mockResolvedValue('muted-user');
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    const futureDate = new Date(Date.now() + 3600_000);
    mockPrisma.mute.findFirst.mockResolvedValue({
      id: 'm1', serverId: 'srv1', targetPubkey: 'muted-user', expiresAt: futureDate,
    });

    const res = await POST(makeRequest({ content: 'hello' }), routeContext);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/muted/i);
  });

  it('returns 201 when user is not banned or muted', async () => {
    mockGetAuth.mockResolvedValue('good-user');
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockPrisma.mute.findFirst.mockResolvedValue(null);
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg1', channelId: 'ch1', authorPubkey: 'good-user',
      content: 'hello', replyToId: null, createdAt: new Date().toISOString(),
      replyTo: null,
    });

    const res = await POST(makeRequest({ content: 'hello' }), routeContext);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.content).toBe('hello');
  });

  it('returns 400 for empty content', async () => {
    mockGetAuth.mockResolvedValue('good-user');
    const res = await POST(makeRequest({ content: '' }), routeContext);
    expect(res.status).toBe(400);
  });

  it('returns 403 channel_write_locked when member posts in admin-only channel', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch1', serverId: 'srv1', writePermission: 'admin',
    });
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockPrisma.mute.findFirst.mockResolvedValue(null);
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
      displayName: null, picture: null,
    });

    const res = await POST(makeRequest({ content: 'hello' }), routeContext);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('channel_write_locked');
  });

  it('allows admin to post in admin-only channel', async () => {
    mockGetAuth.mockResolvedValue('admin-pk');
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch1', serverId: 'srv1', writePermission: 'admin',
    });
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockPrisma.mute.findFirst.mockResolvedValue(null);
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'admin-pk', role: 'admin',
      displayName: null, picture: null,
    });
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg1', channelId: 'ch1', authorPubkey: 'admin-pk',
      content: 'hello', replyToId: null, createdAt: new Date().toISOString(),
      replyTo: null,
    });

    const res = await POST(makeRequest({ content: 'hello' }), routeContext);
    expect(res.status).toBe(201);
  });
});

function makePatchRequest(body: any) {
  return new NextRequest('http://localhost/api/channels/ch1/messages', {
    method: 'PATCH',
    headers: {
      cookie: 'session=test-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/channels/[channelId]/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without session', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await PATCH(makePatchRequest({ messageId: 'm1', content: 'edited' }), routeContext);
    expect(res.status).toBe(401);
  });

  it('returns 400 without messageId', async () => {
    mockGetAuth.mockResolvedValue('user1');
    const res = await PATCH(makePatchRequest({ content: 'edited' }), routeContext);
    expect(res.status).toBe(400);
  });

  it('returns 404 when message not found', async () => {
    mockGetAuth.mockResolvedValue('user1');
    mockPrisma.message.findUnique.mockResolvedValue(null);
    const res = await PATCH(makePatchRequest({ messageId: 'm1', content: 'edited' }), routeContext);
    expect(res.status).toBe(404);
  });

  it('returns 403 when editing another user message', async () => {
    mockGetAuth.mockResolvedValue('user1');
    mockPrisma.message.findUnique.mockResolvedValue({
      authorPubkey: 'other-user', channelId: 'ch1', deletedAt: null,
    });
    const res = await PATCH(makePatchRequest({ messageId: 'm1', content: 'edited' }), routeContext);
    expect(res.status).toBe(403);
  });

  it('returns 200 and updates message when author edits', async () => {
    mockGetAuth.mockResolvedValue('user1');
    mockPrisma.message.findUnique.mockResolvedValue({
      authorPubkey: 'user1', channelId: 'ch1', deletedAt: null,
    });
    const editedAt = new Date().toISOString();
    mockPrisma.message.update.mockResolvedValue({
      id: 'm1', channelId: 'ch1', authorPubkey: 'user1',
      content: 'edited content', editedAt, replyTo: null, reactions: [],
    });

    const res = await PATCH(makePatchRequest({ messageId: 'm1', content: 'edited content' }), routeContext);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.content).toBe('edited content');
    expect(data.editedAt).toBeTruthy();
  });
});
