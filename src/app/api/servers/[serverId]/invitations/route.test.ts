import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    invitation: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    server: { findUnique: vi.fn() },
    member: { findUnique: vi.fn() },
    message: { count: vi.fn() },
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

  it('returns all invitations for admin', async () => {
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
    // Admin sees all (no createdBy filter)
    const findManyCall = mockPrisma.invitation.findMany.mock.calls[0][0];
    expect(findManyCall.where).toEqual({ serverId: 'srv1' });
  });

  it('scopes invitations to creator for non-admin members', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
    });
    mockPrisma.invitation.findMany.mockResolvedValue([]);

    await GET(makeRequest('GET'), { params: makeParams('srv1') });

    const findManyCall = mockPrisma.invitation.findMany.mock.calls[0][0];
    expect(findManyCall.where).toEqual({ serverId: 'srv1', createdBy: 'member-pk' });
  });
});

describe('POST /api/servers/:serverId/invitations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 for ineligible member (below activity thresholds)', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findUnique.mockResolvedValue({
      ownerPubkey: 'owner-pk',
      minDaysActive: 7,
      minMessages: 20,
      invitesPerUser: 3,
    });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
      joinedAt: new Date(),
    });
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.invitation.count.mockResolvedValue(0);

    const res = await POST(makeRequest('POST', {}), { params: makeParams('srv1') });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.reasons).toBeDefined();
  });

  it('returns 403 for eligible member with no available credits', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findUnique.mockResolvedValue({
      ownerPubkey: 'owner-pk',
      minDaysActive: 0,
      minMessages: 0,
      invitesPerUser: 3,
      inviteExpiryHours: 168,
    });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
      joinedAt: new Date(),
    });
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.invitation.count.mockResolvedValue(3); // already at limit

    const res = await POST(makeRequest('POST', {}), { params: makeParams('srv1') });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('No invite credits');
  });

  it('creates a forced single-use invite for eligible member', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findUnique.mockResolvedValue({
      ownerPubkey: 'owner-pk',
      minDaysActive: 0,
      minMessages: 0,
      invitesPerUser: 3,
      inviteExpiryHours: 168,
    });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
      joinedAt: new Date(),
    });
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.invitation.count.mockResolvedValue(0);
    mockPrisma.invitation.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'inv1', ...args.data })
    );

    // Member tries to override maxUses=99 — should be ignored, forced to 1.
    const res = await POST(makeRequest('POST', { maxUses: 99 }), { params: makeParams('srv1') });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.invitation.maxUses).toBe(1);
    expect(data.invitation.expiresAt).not.toBeNull();
  });

  it('creates invitation with admin flexibility', async () => {
    mockGetAuth.mockResolvedValue('admin-pk');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'admin-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'admin-pk', role: 'admin',
    });
    mockPrisma.invitation.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'inv1', ...args.data })
    );

    const res = await POST(
      makeRequest('POST', { maxUses: 5, expiresInHours: 48 }),
      { params: makeParams('srv1') }
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.invitation.maxUses).toBe(5);
  });
});
