import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    channel: { findUnique: vi.fn() },
    message: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    ban: { findUnique: vi.fn() },
    mute: { findFirst: vi.fn() },
    member: { findUnique: vi.fn() },
    server: { findUnique: vi.fn() },
    forumTag: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    forumTagOnMessage: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn((ops: any[]) => Promise.all(ops)),
  },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/lib/auth', () => ({ validateSession: vi.fn() }));
vi.mock('@/lib/auth-roles', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth-roles')>('@/lib/auth-roles');
  return {
    ...actual,
    getAuthMember: vi.fn(),
  };
});
vi.mock('@/lib/profile-sync', () => ({
  getAuthorProfile: vi.fn().mockResolvedValue({ pubkey: 'x', displayName: null, picture: null }),
}));

import { POST, PATCH } from './route';
import { getAuthMember } from '@/lib/auth-roles';
const mockMember = getAuthMember as ReturnType<typeof vi.fn>;
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

describe('PATCH /api/channels/[channelId]/posts/[postId]', () => {
  function patchReq(body: any) {
    return new NextRequest('http://localhost/api/channels/ch1/posts/p1', {
      method: 'PATCH',
      headers: { cookie: 'session=tok', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  async function callPatch(body: any) {
    return PATCH(patchReq(body), {
      params: Promise.resolve({ channelId: 'ch1', postId: 'p1' }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuth.mockResolvedValue('author-pk');
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch1', serverId: 'srv1', type: 'forum',
    });
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'p1', channelId: 'ch1', authorPubkey: 'author-pk',
      title: 'Old', coverImage: null, deletedAt: null,
    });
    mockPrisma.message.update.mockImplementation(({ data }: any) => Promise.resolve({
      id: 'p1', channelId: 'ch1', authorPubkey: 'author-pk',
      title: data.title ?? 'Old',
      coverImage: data.coverImage === undefined ? null : data.coverImage,
      content: 'body', createdAt: new Date(), editedAt: data.editedAt,
      tags: [],
    }));
    mockMember.mockResolvedValue({ role: 'member' });
  });

  it('401 without auth', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await callPatch({ title: 'x' });
    expect(res.status).toBe(401);
  });

  it('allows the author to edit title + coverImage', async () => {
    const res = await callPatch({ title: 'New', coverImage: 'https://cdn/x.jpg' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.post.title).toBe('New');
    expect(data.post.coverImage).toBe('https://cdn/x.jpg');
  });

  it('allows mods who are not the author', async () => {
    mockGetAuth.mockResolvedValue('mod-pk');
    mockMember.mockResolvedValue({ role: 'mod' });
    const res = await callPatch({ title: 'Moderated' });
    expect(res.status).toBe(200);
  });

  it('allows admins who are not the author', async () => {
    mockGetAuth.mockResolvedValue('admin-pk');
    mockMember.mockResolvedValue({ role: 'admin' });
    const res = await callPatch({ title: 'Admin' });
    expect(res.status).toBe(200);
  });

  it('403 for non-author non-staff', async () => {
    mockGetAuth.mockResolvedValue('other-pk');
    mockMember.mockResolvedValue({ role: 'member' });
    const res = await callPatch({ title: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('400 when title blank', async () => {
    const res = await callPatch({ title: '   ' });
    expect(res.status).toBe(400);
  });

  it('400 when no changes', async () => {
    const res = await callPatch({});
    expect(res.status).toBe(400);
  });

  it('allows clearing coverImage with null', async () => {
    const res = await callPatch({ coverImage: null });
    expect(res.status).toBe(200);
    const call = mockPrisma.message.update.mock.calls[0][0];
    expect(call.data.coverImage).toBeNull();
  });

  it('404 when post not found', async () => {
    mockPrisma.message.findUnique.mockResolvedValue(null);
    const res = await callPatch({ title: 'x' });
    expect(res.status).toBe(404);
  });

  it('updates tags when tagNames is provided, auto-creating unknown ones', async () => {
    mockPrisma.forumTag.findMany.mockResolvedValue([]);
    mockPrisma.forumTag.findFirst.mockResolvedValue(null);
    mockPrisma.forumTag.create.mockResolvedValueOnce({ id: 'new-tag', name: '🔥 hot' });
    const res = await callPatch({ tagNames: ['🔥 hot'] });
    expect(res.status).toBe(200);
    expect(mockPrisma.forumTagOnMessage.deleteMany).toHaveBeenCalledWith({
      where: { messageId: 'p1' },
    });
    const createManyCall = mockPrisma.forumTagOnMessage.createMany.mock.calls[0][0];
    expect(createManyCall.data).toEqual([{ messageId: 'p1', tagId: 'new-tag' }]);
  });

  it('accepts tag-only updates without requiring title/cover', async () => {
    const res = await callPatch({ tagIds: [] });
    expect(res.status).toBe(200);
  });
});
