import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('@/lib/db', () => ({
  prisma: {
    member: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    channel: { findMany: vi.fn() },
    message: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/api-auth', () => ({
  getAuthPubkey: vi.fn(),
}));

import { GET } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { NextRequest } from 'next/server';

function makeRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

describe('GET /api/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthPubkey).mockResolvedValue(null);
    const res = await GET(makeRequest('/api/search?q=hello&serverId=s1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when query is missing', async () => {
    vi.mocked(getAuthPubkey).mockResolvedValue('pk1');
    const res = await GET(makeRequest('/api/search?serverId=s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Query required');
  });

  it('returns 400 when serverId is missing', async () => {
    vi.mocked(getAuthPubkey).mockResolvedValue('pk1');
    const res = await GET(makeRequest('/api/search?q=hello'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('serverId required');
  });

  it('returns 403 when user is not a member', async () => {
    vi.mocked(getAuthPubkey).mockResolvedValue('pk1');
    vi.mocked(prisma.member.findUnique).mockResolvedValue(null);
    const res = await GET(makeRequest('/api/search?q=hello&serverId=s1'));
    expect(res.status).toBe(403);
  });

  it('returns search results successfully', async () => {
    vi.mocked(getAuthPubkey).mockResolvedValue('pk1');
    vi.mocked(prisma.member.findUnique).mockResolvedValue({ id: 'm1', serverId: 's1', pubkey: 'pk1', role: 'member' } as any);
    vi.mocked(prisma.member.findMany).mockResolvedValue([
      { pubkey: 'pk1', displayName: 'Alice' },
    ] as any);
    vi.mocked(prisma.channel.findMany).mockResolvedValue([
      { id: 'ch1', name: 'general' },
    ] as any);
    vi.mocked(prisma.message.findMany).mockResolvedValue([
      {
        id: 'msg1',
        channelId: 'ch1',
        authorPubkey: 'pk1',
        content: 'hello world',
        createdAt: new Date(),
        editedAt: null,
        replyTo: null,
        reactions: [],
      },
    ] as any);

    const res = await GET(makeRequest('/api/search?q=hello&serverId=s1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results).toHaveLength(1);
    expect(data.results[0].channelName).toBe('general');
    expect(data.nextCursor).toBeNull();
  });

  it('handles pagination with cursor', async () => {
    vi.mocked(getAuthPubkey).mockResolvedValue('pk1');
    vi.mocked(prisma.member.findUnique).mockResolvedValue({ id: 'm1' } as any);
    vi.mocked(prisma.member.findMany).mockResolvedValue([]);
    vi.mocked(prisma.channel.findMany).mockResolvedValue([]);

    // Return limit+1 results to indicate hasMore
    const messages = Array.from({ length: 26 }, (_, i) => ({
      id: `msg${i}`,
      channelId: 'ch1',
      authorPubkey: 'pk1',
      content: 'test',
      createdAt: new Date(),
      editedAt: null,
      replyTo: null,
      reactions: [],
    }));
    vi.mocked(prisma.message.findMany).mockResolvedValue(messages as any);

    const res = await GET(makeRequest('/api/search?q=test&serverId=s1'));
    const data = await res.json();
    expect(data.results).toHaveLength(25);
    expect(data.nextCursor).toBe('msg24');
  });
});
