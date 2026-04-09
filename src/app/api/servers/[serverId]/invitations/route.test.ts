import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    invitation: { findMany: vi.fn(), create: vi.fn() },
    server: { findUnique: vi.fn() },
    member: { findUnique: vi.fn() },
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

const makeParams = (serverId: string) => Promise.resolve({ serverId });

function makeRequest(method: string, body?: any) {
  const url = 'http://localhost/api/servers/srv1/invitations';
  const init: any = { method, headers: { cookie: 'session=test' } };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  return new NextRequest(url, init);
}

describe('GET /api/servers/:serverId/invitations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 without session', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await GET(makeRequest('GET'), { params: makeParams('srv1') });
    expect(res.status).toBe(401);
  });

  it('returns invitations for admin', async () => {
    mockGetAuth.mockResolvedValue('admin-pk');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'admin-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'admin-pk', role: 'admin',
    });
    mockPrisma.invitation.findMany.mockResolvedValue([
      { id: 'inv1', code: 'abc123', maxUses: 1, uses: 0 },
    ]);

    const res = await GET(makeRequest('GET'), { params: makeParams('srv1') });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.invitations).toHaveLength(1);
  });
});

describe('POST /api/servers/:serverId/invitations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 for member role', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
    });

    const res = await POST(makeRequest('POST', {}), { params: makeParams('srv1') });
    expect(res.status).toBe(403);
  });

  it('creates invitation for admin', async () => {
    mockGetAuth.mockResolvedValue('admin-pk');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'admin-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'admin-pk', role: 'admin',
    });
    mockPrisma.invitation.create.mockResolvedValue({
      id: 'inv1', code: 'generated-code', maxUses: 5, uses: 0,
    });

    const res = await POST(makeRequest('POST', { maxUses: 5 }), { params: makeParams('srv1') });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.invitation.maxUses).toBe(5);
  });
});
