import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    server: { findFirst: vi.fn() },
    member: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/api-auth', () => ({
  getAuthPubkey: vi.fn(),
}));

vi.mock('@/lib/profile-sync', () => ({
  fetchAndSyncProfileDeduped: vi.fn(),
}));

import { POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { fetchAndSyncProfileDeduped } from '@/lib/profile-sync';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;
const mockFetchAndSync = fetchAndSyncProfileDeduped as ReturnType<typeof vi.fn>;

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/members/sync-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/members/sync-profile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 without a session', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ pubkey: 'pk1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when pubkey is missing', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findFirst.mockResolvedValue({ id: 's1' });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 404 when target is not a member', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findFirst.mockResolvedValue({ id: 's1' });
    mockPrisma.member.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ pubkey: 'pk2' }));
    expect(res.status).toBe(404);
    expect(mockFetchAndSync).not.toHaveBeenCalled();
  });

  it('ignores client-supplied name/picture and triggers a server-side relay fetch', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findFirst.mockResolvedValue({ id: 's1' });
    mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1' });
    mockFetchAndSync.mockResolvedValue({ id: 'm1' });

    const res = await POST(
      makeRequest({ pubkey: 'pk2', name: 'INJECTED', picture: 'evil.jpg' }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.synced).toBe(true);

    // The route must never forward the untrusted fields to the DB helper.
    expect(mockFetchAndSync).toHaveBeenCalledWith('pk2', 's1');
    expect(mockFetchAndSync).toHaveBeenCalledTimes(1);
  });

  it('reports synced=false when the relay fetch returns nothing', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findFirst.mockResolvedValue({ id: 's1' });
    mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1' });
    mockFetchAndSync.mockResolvedValue(null);

    const res = await POST(makeRequest({ pubkey: 'pk2' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.synced).toBe(false);
  });
});
