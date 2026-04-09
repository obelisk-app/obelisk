import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    invitation: { findUnique: vi.fn(), update: vi.fn() },
    member: { upsert: vi.fn() },
    ban: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/api-auth', () => ({
  getAuthPubkey: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  validateSession: vi.fn(),
}));

import { GET, POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;

const makeParams = (code: string) => Promise.resolve({ code });

function makeRequest(method: string) {
  return new NextRequest(`http://localhost/api/invitations/test-code`, {
    method,
    headers: { cookie: 'session=test' },
  });
}

describe('GET /api/invitations/:code', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 for invalid code', async () => {
    mockPrisma.invitation.findUnique.mockResolvedValue(null);
    const res = await GET(makeRequest('GET'), { params: makeParams('bad') });
    expect(res.status).toBe(404);
  });

  it('returns 410 for expired invitation', async () => {
    mockPrisma.invitation.findUnique.mockResolvedValue({
      id: 'inv1', code: 'test', maxUses: 1, uses: 0,
      expiresAt: new Date('2020-01-01'),
      server: { id: 's1', name: 'Test', icon: null, banner: null, _count: { members: 5 } },
    });
    const res = await GET(makeRequest('GET'), { params: makeParams('test') });
    expect(res.status).toBe(410);
  });

  it('returns 410 for fully used invitation', async () => {
    mockPrisma.invitation.findUnique.mockResolvedValue({
      id: 'inv1', code: 'test', maxUses: 1, uses: 1,
      expiresAt: null,
      server: { id: 's1', name: 'Test', icon: null, banner: null, _count: { members: 5 } },
    });
    const res = await GET(makeRequest('GET'), { params: makeParams('test') });
    expect(res.status).toBe(410);
  });

  it('returns server info for valid invitation', async () => {
    mockPrisma.invitation.findUnique.mockResolvedValue({
      id: 'inv1', code: 'test', maxUses: 5, uses: 2,
      expiresAt: new Date('2030-01-01'), targetPubkey: null,
      server: { id: 's1', name: 'Cool Server', icon: null, banner: null, _count: { members: 10 } },
    });
    const res = await GET(makeRequest('GET'), { params: makeParams('test') });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.server.name).toBe('Cool Server');
  });
});

describe('POST /api/invitations/:code', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 without session', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await POST(makeRequest('POST'), { params: makeParams('test') });
    expect(res.status).toBe(401);
  });

  it('returns 404 for invalid code', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.invitation.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest('POST'), { params: makeParams('bad') });
    expect(res.status).toBe(404);
  });

  it('returns 403 for wrong target pubkey', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.invitation.findUnique.mockResolvedValue({
      id: 'inv1', serverId: 's1', code: 'test', maxUses: 1, uses: 0,
      expiresAt: null, targetPubkey: 'pk-other',
      server: { id: 's1', name: 'Test', icon: null, banner: null },
    });
    const res = await POST(makeRequest('POST'), { params: makeParams('test') });
    expect(res.status).toBe(403);
  });

  it('accepts valid invitation', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.invitation.findUnique.mockResolvedValue({
      id: 'inv1', serverId: 's1', code: 'test', maxUses: 5, uses: 2,
      expiresAt: null, targetPubkey: null,
      server: { id: 's1', name: 'Test', icon: null, banner: null },
    });
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockPrisma.$transaction.mockResolvedValue([{}, {}]);

    const res = await POST(makeRequest('POST'), { params: makeParams('test') });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.server.name).toBe('Test');
  });
});
