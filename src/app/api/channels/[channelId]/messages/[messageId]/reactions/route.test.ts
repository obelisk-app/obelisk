import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock prisma
const mockFindUnique = vi.fn();
const mockReactionFindUnique = vi.fn();
const mockReactionDelete = vi.fn();
const mockReactionCreate = vi.fn();
const mockReactionFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    message: { findUnique: (...args: any[]) => mockFindUnique(...args) },
    reaction: {
      findUnique: (...args: any[]) => mockReactionFindUnique(...args),
      delete: (...args: any[]) => mockReactionDelete(...args),
      create: (...args: any[]) => mockReactionCreate(...args),
      findMany: (...args: any[]) => mockReactionFindMany(...args),
    },
  },
}));

// Mock auth
const mockGetAuthPubkey = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getAuthPubkey: (...args: any[]) => mockGetAuthPubkey(...args),
}));

// Mock socket.io
(globalThis as any).__io = { to: vi.fn(() => ({ emit: vi.fn() })) };

import { POST } from './route';
import { NextRequest } from 'next/server';

function makeReq(body: any) {
  return new NextRequest('http://localhost/api/channels/ch1/messages/m1/reactions', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/channels/:channelId/messages/:messageId/reactions', () => {
  const params = Promise.resolve({ channelId: 'ch1', messageId: 'm1' });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthPubkey.mockResolvedValue('user1');
  });

  it('returns 401 when not authenticated', async () => {
    mockGetAuthPubkey.mockResolvedValue(null);
    const res = await POST(makeReq({ emoji: '❤️' }), { params });
    expect(res.status).toBe(401);
  });

  it('returns 400 when emoji is missing', async () => {
    const res = await POST(makeReq({}), { params });
    expect(res.status).toBe(400);
  });

  it('returns 404 when message not found', async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(makeReq({ emoji: '❤️' }), { params });
    expect(res.status).toBe(404);
  });

  it('adds a reaction when none exists', async () => {
    mockFindUnique.mockResolvedValue({ channelId: 'ch1', deletedAt: null });
    mockReactionFindUnique.mockResolvedValue(null);
    mockReactionCreate.mockResolvedValue({});
    mockReactionFindMany.mockResolvedValue([
      { id: 'r1', messageId: 'm1', authorPubkey: 'user1', emoji: '❤️' },
    ]);

    const res = await POST(makeReq({ emoji: '❤️' }), { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reactions).toHaveLength(1);
    expect(mockReactionCreate).toHaveBeenCalled();
    expect(mockReactionDelete).not.toHaveBeenCalled();
  });

  it('removes a reaction when it already exists (toggle)', async () => {
    mockFindUnique.mockResolvedValue({ channelId: 'ch1', deletedAt: null });
    mockReactionFindUnique.mockResolvedValue({ id: 'r1' });
    mockReactionDelete.mockResolvedValue({});
    mockReactionFindMany.mockResolvedValue([]);

    const res = await POST(makeReq({ emoji: '❤️' }), { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reactions).toHaveLength(0);
    expect(mockReactionDelete).toHaveBeenCalled();
    expect(mockReactionCreate).not.toHaveBeenCalled();
  });
});
