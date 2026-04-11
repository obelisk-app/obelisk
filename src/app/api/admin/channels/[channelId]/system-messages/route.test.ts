import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse, NextRequest } from 'next/server';

// Prisma surface used by the route. Each test installs its own return
// values via the mocks below.
const mockChannelFindUnique = vi.fn();
const mockMessageFindMany = vi.fn();
const mockMessageCreate = vi.fn();
const mockForumTagFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    channel: { findUnique: (...args: any[]) => mockChannelFindUnique(...args) },
    message: {
      findMany: (...args: any[]) => mockMessageFindMany(...args),
      create: (...args: any[]) => mockMessageCreate(...args),
    },
    forumTag: {
      findMany: (...args: any[]) => mockForumTagFindMany(...args),
    },
  },
}));

const mockRequireRole = vi.fn();
vi.mock('@/lib/auth-roles', () => ({
  requireRole: (...args: any[]) => mockRequireRole(...args),
}));

const mockGetAuthorProfile = vi.fn();
vi.mock('@/lib/profile-sync', () => ({
  getAuthorProfile: (...args: any[]) => mockGetAuthorProfile(...args),
  SYSTEM_PUBKEY:
    '0000000000000000000000000000000000000000000000000000000000000000',
}));

const mockEmit = vi.fn();

import { GET, POST } from './route';
import { SYSTEM_PUBKEY } from '@/lib/profile-sync';

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/admin/channels/ch1/system-messages', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function getReq() {
  return new NextRequest('http://localhost/api/admin/channels/ch1/system-messages');
}

const params = Promise.resolve({ channelId: 'ch1' });

const adminActor = {
  id: 'm-admin',
  serverId: 'srv1',
  pubkey: 'admin-pk',
  role: 'admin' as const,
  displayName: null,
  picture: null,
  instanceOwner: false,
};

describe('POST /api/admin/channels/:channelId/system-messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__io = { to: vi.fn(() => ({ emit: mockEmit })) };
    mockGetAuthorProfile.mockResolvedValue({
      pubkey: SYSTEM_PUBKEY,
      displayName: 'La Crypta',
      picture: '/lacrypta-logo.png',
      nip05: null,
      nickname: null,
    });
  });

  it('returns 404 when the channel does not exist', async () => {
    mockChannelFindUnique.mockResolvedValue(null);
    const res = await POST(postReq({ content: 'hi' }), { params });
    expect(res.status).toBe(404);
    expect(mockRequireRole).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not at least admin', async () => {
    mockChannelFindUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1', type: 'text' });
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    const res = await POST(postReq({ content: 'hi' }), { params });
    expect(res.status).toBe(403);
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('rejects empty content', async () => {
    mockChannelFindUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1', type: 'text' });
    mockRequireRole.mockResolvedValue(adminActor);
    const res = await POST(postReq({ content: '   ' }), { params });
    expect(res.status).toBe(400);
  });

  it('creates an unpinned system message in a text channel and emits new-message', async () => {
    mockChannelFindUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1', type: 'text' });
    mockRequireRole.mockResolvedValue(adminActor);
    mockMessageCreate.mockResolvedValue({
      id: 'm1',
      channelId: 'ch1',
      authorPubkey: SYSTEM_PUBKEY,
      content: 'hello world',
      title: null,
      pinnedAt: null,
      pinnedByPubkey: null,
      replyTo: null,
      reactions: [],
      tags: [],
    });

    const res = await POST(postReq({ content: 'hello world' }), { params });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.authorPubkey).toBe(SYSTEM_PUBKEY);
    expect(data.author.displayName).toBe('La Crypta');

    const createArg = mockMessageCreate.mock.calls[0][0];
    expect(createArg.data.authorPubkey).toBe(SYSTEM_PUBKEY);
    expect(createArg.data.content).toBe('hello world');
    expect(createArg.data.pinnedAt).toBeUndefined();

    expect(mockEmit).toHaveBeenCalledWith('new-message', expect.objectContaining({ id: 'm1' }));
    expect(mockEmit).not.toHaveBeenCalledWith('message-pinned', expect.anything());
  });

  it('pins the message in the same write and emits both events when pin:true', async () => {
    mockChannelFindUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1', type: 'text' });
    mockRequireRole.mockResolvedValue(adminActor);
    mockMessageCreate.mockResolvedValue({
      id: 'm1',
      channelId: 'ch1',
      authorPubkey: SYSTEM_PUBKEY,
      content: 'welcome',
      title: null,
      pinnedAt: new Date(),
      pinnedByPubkey: 'admin-pk',
      replyTo: null,
      reactions: [],
      tags: [],
    });

    const res = await POST(postReq({ content: 'welcome', pin: true }), { params });
    expect(res.status).toBe(201);

    const createArg = mockMessageCreate.mock.calls[0][0];
    expect(createArg.data.pinnedAt).toBeInstanceOf(Date);
    expect(createArg.data.pinnedByPubkey).toBe('admin-pk');

    expect(mockEmit).toHaveBeenCalledWith('new-message', expect.objectContaining({ id: 'm1' }));
    expect(mockEmit).toHaveBeenCalledWith('message-pinned', expect.objectContaining({ id: 'm1' }));
  });

  it('rejects a text-channel post that includes a title', async () => {
    mockChannelFindUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1', type: 'text' });
    mockRequireRole.mockResolvedValue(adminActor);
    const res = await POST(postReq({ content: 'hi', title: 'nope' }), { params });
    expect(res.status).toBe(400);
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('requires a title on forum channels', async () => {
    mockChannelFindUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1', type: 'forum' });
    mockRequireRole.mockResolvedValue(adminActor);
    const res = await POST(postReq({ content: 'body' }), { params });
    expect(res.status).toBe(400);
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('rejects pin:true on forum channels', async () => {
    mockChannelFindUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1', type: 'forum' });
    mockRequireRole.mockResolvedValue(adminActor);
    const res = await POST(postReq({ title: 't', content: 'c', pin: true }), { params });
    expect(res.status).toBe(400);
  });

  it('creates a forum post with tag pivots when tagIds are valid', async () => {
    mockChannelFindUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1', type: 'forum' });
    mockRequireRole.mockResolvedValue(adminActor);
    mockForumTagFindMany.mockResolvedValue([{ id: 'tag1' }, { id: 'tag2' }]);
    mockMessageCreate.mockResolvedValue({
      id: 'p1',
      channelId: 'ch1',
      authorPubkey: SYSTEM_PUBKEY,
      title: 'Redes',
      content: 'links...',
      pinnedAt: null,
      pinnedByPubkey: null,
      replyTo: null,
      reactions: [],
      tags: [
        { tag: { id: 'tag1', name: 'Info', color: '#3b82f6' } },
        { tag: { id: 'tag2', name: 'Recursos', color: '#22c55e' } },
      ],
    });

    const res = await POST(
      postReq({ title: 'Redes', content: 'links...', tagIds: ['tag1', 'tag2'] }),
      { params },
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.title).toBe('Redes');
    expect(data.tags).toEqual([
      { id: 'tag1', name: 'Info', color: '#3b82f6' },
      { id: 'tag2', name: 'Recursos', color: '#22c55e' },
    ]);

    const createArg = mockMessageCreate.mock.calls[0][0];
    expect(createArg.data.tags).toEqual({
      create: [{ tagId: 'tag1' }, { tagId: 'tag2' }],
    });
  });

  it('rejects forum posts whose tagIds do not belong to the channel', async () => {
    mockChannelFindUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1', type: 'forum' });
    mockRequireRole.mockResolvedValue(adminActor);
    mockForumTagFindMany.mockResolvedValue([{ id: 'tag1' }]);
    const res = await POST(
      postReq({ title: 'x', content: 'y', tagIds: ['tag1', 'stray'] }),
      { params },
    );
    expect(res.status).toBe(400);
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('refuses to post to a voice channel', async () => {
    mockChannelFindUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1', type: 'voice' });
    mockRequireRole.mockResolvedValue(adminActor);
    const res = await POST(postReq({ content: 'hi' }), { params });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/channels/:channelId/system-messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthorProfile.mockResolvedValue({
      pubkey: SYSTEM_PUBKEY,
      displayName: 'La Crypta',
      picture: '/lacrypta-logo.png',
      nip05: null,
      nickname: null,
    });
  });

  it('returns only system-authored, non-deleted top-level messages', async () => {
    mockChannelFindUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1', type: 'forum' });
    mockRequireRole.mockResolvedValue(adminActor);
    mockMessageFindMany.mockResolvedValue([
      {
        id: 'p1',
        channelId: 'ch1',
        authorPubkey: SYSTEM_PUBKEY,
        title: 'Reglas',
        content: '...',
        createdAt: new Date(),
        editedAt: null,
        pinnedAt: null,
        pinnedByPubkey: null,
        tags: [{ tag: { id: 't1', name: 'Reglas', color: '#ef4444' } }],
      },
    ]);

    const res = await GET(getReq(), { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.channel).toEqual({ id: 'ch1', type: 'forum' });
    expect(data.author.displayName).toBe('La Crypta');
    expect(data.messages).toHaveLength(1);
    expect(data.messages[0].tags).toEqual([
      { id: 't1', name: 'Reglas', color: '#ef4444' },
    ]);

    const whereArg = mockMessageFindMany.mock.calls[0][0].where;
    expect(whereArg.authorPubkey).toBe(SYSTEM_PUBKEY);
    expect(whereArg.replyToId).toBeNull();
    expect(whereArg.deletedAt).toBeNull();
  });
});
