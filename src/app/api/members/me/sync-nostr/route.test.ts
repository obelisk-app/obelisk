import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    server: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/api-auth', () => ({
  getAuthPubkey: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  validateSession: vi.fn(),
}));

vi.mock('@/lib/profile-sync', () => ({
  fetchProfileFromRelay: vi.fn(),
  syncProfileToDb: vi.fn(),
}));

import { POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { fetchProfileFromRelay, syncProfileToDb } from '@/lib/profile-sync';

const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;
const mockFetchProfile = fetchProfileFromRelay as ReturnType<typeof vi.fn>;
const mockSyncProfile = syncProfileToDb as ReturnType<typeof vi.fn>;

function makeRequest() {
  return new NextRequest('http://localhost/api/members/me/sync-nostr', { method: 'POST' });
}

describe('POST /api/members/me/sync-nostr', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 if not authenticated', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 404 if no server', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    (prisma.server.findFirst as any).mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns 502 if relay fetch fails', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    (prisma.server.findFirst as any).mockResolvedValue({ id: 's1' });
    mockFetchProfile.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
  });

  it('syncs profile and returns member data on success', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    (prisma.server.findFirst as any).mockResolvedValue({ id: 's1' });
    mockFetchProfile.mockResolvedValue({ displayName: 'Alice', picture: 'pic.jpg' });
    mockSyncProfile.mockResolvedValue({
      pubkey: 'pk1',
      displayName: 'Alice',
      picture: 'pic.jpg',
      nip05: null,
      about: null,
      banner: null,
      lud16: null,
      website: null,
      nickname: null,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.displayName).toBe('Alice');
    expect(data.picture).toBe('pic.jpg');
    expect(mockSyncProfile).toHaveBeenCalledWith('pk1', 's1', { displayName: 'Alice', picture: 'pic.jpg' });
  });
});
