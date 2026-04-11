import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    channel: { findUnique: vi.fn() },
    message: { findUnique: vi.fn(), create: vi.fn() },
    ban: { findUnique: vi.fn() },
    mute: { findFirst: vi.fn() },
    member: { findUnique: vi.fn() },
    server: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/lib/auth', () => ({ validateSession: vi.fn() }));
vi.mock('@/lib/profile-sync', () => ({
  getAuthorProfile: vi.fn().mockResolvedValue({ pubkey: 'x', displayName: null, picture: null }),
}));

import { POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;

function makeRequest(body: any) {
  return new NextRequest('http://localhost/api/channels/ch1/posts/p1', {
    method: 'POST',
    headers: { cookie: 'session=tok', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ channelId: 'ch1', postId: 'p1' }) };

describe('POST /api/channels/[channelId]/posts/[postId] reply', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 channel_write_locked when member replies in admin-only channel', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch1', serverId: 'srv1', writePermission: 'admin',
    });
    mockPrisma.message.findUnique.mockResolvedValue({ id: 'p1', channelId: 'ch1' });
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockPrisma.mute.findFirst.mockResolvedValue(null);
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
      displayName: null, picture: null,
    });

    const res = await POST(makeRequest({ content: 'reply' }), ctx);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('channel_write_locked');
  });

  it('allows regular member to reply when channel is open', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch1', serverId: 'srv1', writePermission: null,
    });
    mockPrisma.message.findUnique.mockResolvedValue({ id: 'p1', channelId: 'ch1' });
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockPrisma.mute.findFirst.mockResolvedValue(null);
    mockPrisma.message.create.mockResolvedValue({
      id: 'r1', channelId: 'ch1', authorPubkey: 'member-pk',
      content: 'reply', replyToId: 'p1', createdAt: new Date().toISOString(),
    });

    const res = await POST(makeRequest({ content: 'reply' }), ctx);
    expect(res.status).toBe(201);
  });
});
