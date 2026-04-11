import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse, NextRequest } from 'next/server';

const mockMessageFindUnique = vi.fn();
const mockMessageUpdate = vi.fn();
const mockForumTagFindMany = vi.fn();
const mockForumTagOnMessageDeleteMany = vi.fn();
const mockForumTagOnMessageCreateMany = vi.fn();

// The PATCH handler uses prisma.$transaction for the tag swap path.
// The mock interprets the callback form by handing it a tiny surrogate
// client that records the same calls.
const mockTransaction = vi.fn(async (fn: any) => {
  return fn({
    forumTagOnMessage: {
      deleteMany: (...args: any[]) => mockForumTagOnMessageDeleteMany(...args),
      createMany: (...args: any[]) => mockForumTagOnMessageCreateMany(...args),
    },
    message: {
      update: (...args: any[]) => mockMessageUpdate(...args),
    },
  });
});

vi.mock('@/lib/db', () => ({
  prisma: {
    message: {
      findUnique: (...args: any[]) => mockMessageFindUnique(...args),
      update: (...args: any[]) => mockMessageUpdate(...args),
    },
    forumTag: {
      findMany: (...args: any[]) => mockForumTagFindMany(...args),
    },
    forumTagOnMessage: {
      deleteMany: (...args: any[]) => mockForumTagOnMessageDeleteMany(...args),
      createMany: (...args: any[]) => mockForumTagOnMessageCreateMany(...args),
    },
    $transaction: (fn: any) => mockTransaction(fn),
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
const mockEmitMod = vi.fn();

import { PATCH, DELETE } from './route';
import { SYSTEM_PUBKEY } from '@/lib/profile-sync';

function patchReq(body: unknown) {
  return new NextRequest('http://localhost/api/admin/messages/m1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function deleteReq() {
  return new NextRequest('http://localhost/api/admin/messages/m1', {
    method: 'DELETE',
  });
}

const params = Promise.resolve({ messageId: 'm1' });

const adminActor = {
  id: 'm-admin',
  serverId: 'srv1',
  pubkey: 'admin-pk',
  role: 'admin' as const,
  displayName: null,
  picture: null,
  instanceOwner: false,
};

describe('PATCH /api/admin/messages/:messageId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__io = { to: vi.fn(() => ({ emit: mockEmit })) };
    (globalThis as any).__emitModEvent = mockEmitMod;
    mockGetAuthorProfile.mockResolvedValue({
      pubkey: SYSTEM_PUBKEY,
      displayName: 'La Crypta',
      picture: '/lacrypta-logo.png',
      nip05: null,
      nickname: null,
    });
  });

  it('returns 404 when the message is missing', async () => {
    mockMessageFindUnique.mockResolvedValue(null);
    const res = await PATCH(patchReq({ content: 'new' }), { params });
    expect(res.status).toBe(404);
  });

  it('refuses to edit user-authored messages', async () => {
    mockMessageFindUnique.mockResolvedValue({
      id: 'm1',
      channelId: 'ch1',
      authorPubkey: 'user-pk',
      deletedAt: null,
      title: null,
      channel: { id: 'ch1', serverId: 'srv1', type: 'text' },
    });
    const res = await PATCH(patchReq({ content: 'hi' }), { params });
    expect(res.status).toBe(403);
    expect(mockRequireRole).not.toHaveBeenCalled();
    expect(mockMessageUpdate).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not at least admin', async () => {
    mockMessageFindUnique.mockResolvedValue({
      id: 'm1',
      channelId: 'ch1',
      authorPubkey: SYSTEM_PUBKEY,
      deletedAt: null,
      title: null,
      channel: { id: 'ch1', serverId: 'srv1', type: 'text' },
    });
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    const res = await PATCH(patchReq({ content: 'hi' }), { params });
    expect(res.status).toBe(403);
    expect(mockMessageUpdate).not.toHaveBeenCalled();
  });

  it('updates content, stamps editedAt, and emits message-edited', async () => {
    mockMessageFindUnique.mockResolvedValue({
      id: 'm1',
      channelId: 'ch1',
      authorPubkey: SYSTEM_PUBKEY,
      deletedAt: null,
      title: null,
      channel: { id: 'ch1', serverId: 'srv1', type: 'text' },
    });
    mockRequireRole.mockResolvedValue(adminActor);
    mockMessageUpdate.mockResolvedValue({
      id: 'm1',
      channelId: 'ch1',
      authorPubkey: SYSTEM_PUBKEY,
      content: 'fixed typo',
      title: null,
      editedAt: new Date(),
      replyTo: null,
      reactions: [],
      tags: [],
    });

    const res = await PATCH(patchReq({ content: 'fixed typo' }), { params });
    expect(res.status).toBe(200);
    const updateArg = mockMessageUpdate.mock.calls[0][0];
    expect(updateArg.data.content).toBe('fixed typo');
    expect(updateArg.data.editedAt).toBeInstanceOf(Date);
    expect(mockEmit).toHaveBeenCalledWith('message-edited', expect.objectContaining({ id: 'm1' }));
  });

  it('rejects title edits on non-forum channels', async () => {
    mockMessageFindUnique.mockResolvedValue({
      id: 'm1',
      channelId: 'ch1',
      authorPubkey: SYSTEM_PUBKEY,
      deletedAt: null,
      title: null,
      channel: { id: 'ch1', serverId: 'srv1', type: 'text' },
    });
    mockRequireRole.mockResolvedValue(adminActor);
    const res = await PATCH(patchReq({ title: 'x' }), { params });
    expect(res.status).toBe(400);
    expect(mockMessageUpdate).not.toHaveBeenCalled();
  });

  it('replaces the tag set on forum posts using a transaction', async () => {
    mockMessageFindUnique.mockResolvedValue({
      id: 'm1',
      channelId: 'ch1',
      authorPubkey: SYSTEM_PUBKEY,
      deletedAt: null,
      title: 'Redes',
      channel: { id: 'ch1', serverId: 'srv1', type: 'forum' },
    });
    mockRequireRole.mockResolvedValue(adminActor);
    mockForumTagFindMany.mockResolvedValue([{ id: 'tag1' }, { id: 'tag2' }]);
    mockMessageUpdate.mockResolvedValue({
      id: 'm1',
      channelId: 'ch1',
      authorPubkey: SYSTEM_PUBKEY,
      title: 'Redes',
      content: 'body',
      editedAt: new Date(),
      replyTo: null,
      reactions: [],
      tags: [
        { tag: { id: 'tag1', name: 'Info', color: '#3b82f6' } },
        { tag: { id: 'tag2', name: 'Recursos', color: '#22c55e' } },
      ],
    });

    const res = await PATCH(patchReq({ tagIds: ['tag1', 'tag2'] }), { params });
    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
    expect(mockForumTagOnMessageDeleteMany).toHaveBeenCalledWith({
      where: { messageId: 'm1' },
    });
    expect(mockForumTagOnMessageCreateMany).toHaveBeenCalledWith({
      data: [
        { messageId: 'm1', tagId: 'tag1' },
        { messageId: 'm1', tagId: 'tag2' },
      ],
    });
  });
});

describe('DELETE /api/admin/messages/:messageId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__emitModEvent = mockEmitMod;
  });

  it('returns 404 for missing or already-deleted messages', async () => {
    mockMessageFindUnique.mockResolvedValue(null);
    const res = await DELETE(deleteReq(), { params });
    expect(res.status).toBe(404);
  });

  it('refuses to delete user-authored messages', async () => {
    mockMessageFindUnique.mockResolvedValue({
      id: 'm1',
      channelId: 'ch1',
      authorPubkey: 'user-pk',
      deletedAt: null,
      title: null,
      channel: { id: 'ch1', serverId: 'srv1', type: 'text' },
    });
    const res = await DELETE(deleteReq(), { params });
    expect(res.status).toBe(403);
    expect(mockRequireRole).not.toHaveBeenCalled();
  });

  it('soft-deletes and broadcasts message-deleted', async () => {
    mockMessageFindUnique.mockResolvedValue({
      id: 'm1',
      channelId: 'ch1',
      authorPubkey: SYSTEM_PUBKEY,
      deletedAt: null,
      title: null,
      channel: { id: 'ch1', serverId: 'srv1', type: 'text' },
    });
    mockRequireRole.mockResolvedValue(adminActor);
    mockMessageUpdate.mockResolvedValue({ id: 'm1' });

    const res = await DELETE(deleteReq(), { params });
    expect(res.status).toBe(200);
    const updateArg = mockMessageUpdate.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'm1' });
    expect(updateArg.data.deletedAt).toBeInstanceOf(Date);
    expect(mockEmitMod).toHaveBeenCalledWith('message-deleted', {
      messageId: 'm1',
      channelId: 'ch1',
    });
  });
});
