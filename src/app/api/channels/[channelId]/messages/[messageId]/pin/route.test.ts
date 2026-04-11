import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';

// Prisma surface used by the pin route.
const mockChannelFindUnique = vi.fn();
const mockMessageFindUnique = vi.fn();
const mockMessageUpdate = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    channel: { findUnique: (...args: any[]) => mockChannelFindUnique(...args) },
    message: {
      findUnique: (...args: any[]) => mockMessageFindUnique(...args),
      update: (...args: any[]) => mockMessageUpdate(...args),
    },
  },
}));

// Mock the role guard so tests don't need to spin up auth state.
const mockRequireRole = vi.fn();
vi.mock('@/lib/auth-roles', () => ({
  requireRole: (...args: any[]) => mockRequireRole(...args),
}));

// Avoid hitting relays / the real profile cache when enriching.
vi.mock('@/lib/profile-sync', () => ({
  getAuthorProfile: vi.fn().mockResolvedValue(null),
  SYSTEM_PUBKEY:
    '0000000000000000000000000000000000000000000000000000000000000000',
}));

const mockEmit = vi.fn();
(globalThis as any).__io = { to: vi.fn(() => ({ emit: mockEmit })) };

import { POST } from './route';
import { NextRequest } from 'next/server';

function makeReq() {
  return new NextRequest('http://localhost/api/channels/ch1/messages/m1/pin', {
    method: 'POST',
  });
}

describe('POST /api/channels/:channelId/messages/:messageId/pin', () => {
  const params = Promise.resolve({ channelId: 'ch1', messageId: 'm1' });
  const adminActor = {
    id: 'm-admin',
    serverId: 'srv1',
    pubkey: 'admin-pk',
    role: 'admin' as const,
    displayName: null,
    picture: null,
    instanceOwner: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__io = { to: vi.fn(() => ({ emit: mockEmit })) };
  });

  it('returns 404 when the channel does not exist', async () => {
    mockChannelFindUnique.mockResolvedValue(null);
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(404);
    expect(mockRequireRole).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not at least admin', async () => {
    mockChannelFindUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1' });
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(403);
    expect(mockMessageUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when the message is missing / deleted / foreign to the channel', async () => {
    mockChannelFindUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1' });
    mockRequireRole.mockResolvedValue(adminActor);
    mockMessageFindUnique.mockResolvedValue(null);

    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(404);
    expect(mockMessageUpdate).not.toHaveBeenCalled();
  });

  it('pins an unpinned message, records the actor, and broadcasts', async () => {
    mockChannelFindUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1' });
    mockRequireRole.mockResolvedValue(adminActor);
    mockMessageFindUnique.mockResolvedValue({
      id: 'm1',
      channelId: 'ch1',
      deletedAt: null,
      pinnedAt: null,
    });
    mockMessageUpdate.mockResolvedValue({
      id: 'm1',
      channelId: 'ch1',
      authorPubkey: 'author-pk',
      content: 'hello',
      pinnedAt: new Date(),
      pinnedByPubkey: 'admin-pk',
    });

    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pinned).toBe(true);

    const updateArg = mockMessageUpdate.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'm1' });
    expect(updateArg.data.pinnedByPubkey).toBe('admin-pk');
    expect(updateArg.data.pinnedAt).toBeInstanceOf(Date);
    expect(mockEmit).toHaveBeenCalledWith('message-pinned', expect.objectContaining({ id: 'm1' }));
  });

  it('unpins an already-pinned message and broadcasts', async () => {
    mockChannelFindUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1' });
    mockRequireRole.mockResolvedValue(adminActor);
    mockMessageFindUnique.mockResolvedValue({
      id: 'm1',
      channelId: 'ch1',
      deletedAt: null,
      pinnedAt: new Date(),
    });
    mockMessageUpdate.mockResolvedValue({
      id: 'm1',
      channelId: 'ch1',
      authorPubkey: 'author-pk',
      content: 'hello',
      pinnedAt: null,
      pinnedByPubkey: null,
    });

    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pinned).toBe(false);

    const updateArg = mockMessageUpdate.mock.calls[0][0];
    expect(updateArg.data.pinnedAt).toBeNull();
    expect(updateArg.data.pinnedByPubkey).toBeNull();
    expect(mockEmit).toHaveBeenCalledWith('message-pinned', expect.objectContaining({ id: 'm1' }));
  });
});
