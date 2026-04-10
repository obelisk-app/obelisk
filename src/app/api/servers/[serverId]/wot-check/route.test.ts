import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    server: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/api-auth', () => ({
  getAuthPubkey: vi.fn(),
}));

vi.mock('@/lib/wot', () => ({
  isInWot: vi.fn(),
  maybeAutoRefreshWot: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { isInWot } from '@/lib/wot';

const mockPrisma = prisma as any;
const mockAuth = getAuthPubkey as ReturnType<typeof vi.fn>;
const mockIsIn = isInWot as ReturnType<typeof vi.fn>;

const makeReq = () =>
  new NextRequest('http://localhost/api/servers/srv1/wot-check', {
    headers: { cookie: 'session=test' },
  });
const params = () => Promise.resolve({ serverId: 'srv1' });

beforeEach(() => vi.clearAllMocks());

describe('GET /wot-check', () => {
  it('returns 401 without session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq(), { params: params() });
    expect(res.status).toBe(401);
  });

  it('returns 404 when server is missing', async () => {
    mockAuth.mockResolvedValue('pk');
    mockPrisma.server.findUnique.mockResolvedValue(null);
    const res = await GET(makeReq(), { params: params() });
    expect(res.status).toBe(404);
  });

  it('returns allowed=true with reason=follow when in WoT', async () => {
    mockAuth.mockResolvedValue('pk');
    mockPrisma.server.findUnique.mockResolvedValue({
      id: 'srv1', wotEnabled: true, referentePubkey: 'ref',
    });
    mockIsIn.mockResolvedValue({ allowed: true, reason: 'follow' });

    const res = await GET(makeReq(), { params: params() });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.allowed).toBe(true);
    expect(data.reason).toBe('follow');
    expect(data.wotEnabled).toBe(true);
  });

  it('returns allowed=false when not in WoT', async () => {
    mockAuth.mockResolvedValue('pk');
    mockPrisma.server.findUnique.mockResolvedValue({
      id: 'srv1', wotEnabled: true, referentePubkey: 'ref',
    });
    mockIsIn.mockResolvedValue({ allowed: false, reason: 'none' });

    const res = await GET(makeReq(), { params: params() });
    const data = await res.json();
    expect(data.allowed).toBe(false);
    expect(data.reason).toBe('none');
  });
});
