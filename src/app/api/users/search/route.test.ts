import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nip19 } from 'nostr-tools';

vi.mock('@/lib/db', () => ({
  prisma: {
    member: { findMany: vi.fn() },
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

describe('GET /api/users/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthPubkey).mockResolvedValue(null);
    const res = await GET(makeRequest('/api/users/search?q=alice'));
    expect(res.status).toBe(401);
  });

  it('returns empty results when query is empty', async () => {
    vi.mocked(getAuthPubkey).mockResolvedValue('pk1');
    const res = await GET(makeRequest('/api/users/search?q='));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results).toEqual([]);
    expect(prisma.member.findMany).not.toHaveBeenCalled();
  });

  it('searches displayName, nickname, nip05 case-insensitively', async () => {
    vi.mocked(getAuthPubkey).mockResolvedValue('viewer');
    vi.mocked(prisma.member.findMany).mockResolvedValue([
      { pubkey: 'a'.repeat(64), displayName: 'Alice', picture: null, nip05: null, profileUpdatedAt: new Date() },
    ] as any);

    const res = await GET(makeRequest('/api/users/search?q=alice'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results).toHaveLength(1);
    expect(data.results[0]).toMatchObject({ pubkey: 'a'.repeat(64), displayName: 'Alice' });

    const call = vi.mocked(prisma.member.findMany).mock.calls[0][0] as any;
    const orClauses = call.where.OR;
    expect(orClauses).toEqual(expect.arrayContaining([
      { displayName: { contains: 'alice', mode: 'insensitive' } },
      { nickname: { contains: 'alice', mode: 'insensitive' } },
      { nip05: { contains: 'alice', mode: 'insensitive' } },
    ]));
  });

  it('matches a hex prefix on pubkey', async () => {
    vi.mocked(getAuthPubkey).mockResolvedValue('viewer');
    vi.mocked(prisma.member.findMany).mockResolvedValue([] as any);

    await GET(makeRequest('/api/users/search?q=deadbeef'));
    const call = vi.mocked(prisma.member.findMany).mock.calls[0][0] as any;
    expect(call.where.OR).toEqual(expect.arrayContaining([
      { pubkey: { startsWith: 'deadbeef' } },
    ]));
  });

  it('decodes a full npub to its hex pubkey', async () => {
    vi.mocked(getAuthPubkey).mockResolvedValue('viewer');
    vi.mocked(prisma.member.findMany).mockResolvedValue([] as any);

    const hex = 'b'.repeat(64);
    const npub = nip19.npubEncode(hex);
    await GET(makeRequest(`/api/users/search?q=${npub}`));

    const call = vi.mocked(prisma.member.findMany).mock.calls[0][0] as any;
    expect(call.where.OR).toEqual(expect.arrayContaining([
      { pubkey: hex },
    ]));
  });

  it('deduplicates rows that share a pubkey across servers', async () => {
    vi.mocked(getAuthPubkey).mockResolvedValue('viewer');
    const pk = 'c'.repeat(64);
    vi.mocked(prisma.member.findMany).mockResolvedValue([
      { pubkey: pk, displayName: 'New', picture: 'pic-new', nip05: null, profileUpdatedAt: new Date(2025, 0, 2) },
      { pubkey: pk, displayName: 'Old', picture: 'pic-old', nip05: null, profileUpdatedAt: new Date(2025, 0, 1) },
    ] as any);

    const res = await GET(makeRequest('/api/users/search?q=ne'));
    const data = await res.json();
    expect(data.results).toHaveLength(1);
    expect(data.results[0]).toMatchObject({ pubkey: pk, displayName: 'New', picture: 'pic-new' });
  });

  it('omits the viewer from the result set', async () => {
    const viewer = 'd'.repeat(64);
    vi.mocked(getAuthPubkey).mockResolvedValue(viewer);
    vi.mocked(prisma.member.findMany).mockResolvedValue([
      { pubkey: viewer, displayName: 'Me', picture: null, nip05: null, profileUpdatedAt: new Date() },
      { pubkey: 'e'.repeat(64), displayName: 'Other', picture: null, nip05: null, profileUpdatedAt: new Date() },
    ] as any);

    const res = await GET(makeRequest('/api/users/search?q=m'));
    const data = await res.json();
    expect(data.results).toHaveLength(1);
    expect(data.results[0].pubkey).toBe('e'.repeat(64));
  });
});
