import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    invitation: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
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

function mockAdmin() {
  mockGetAuth.mockResolvedValue('admin-pk');
  mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'admin-pk' });
  mockPrisma.member.findUnique.mockResolvedValue({
    id: 'm1', serverId: 'srv1', pubkey: 'admin-pk', role: 'admin',
  });
}

describe('GET /api/servers/:serverId/invitations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 without session', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await GET(makeRequest('GET'), { params: makeParams('srv1') });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin members (admin-only endpoint now)', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
    });

    const res = await GET(makeRequest('GET'), { params: makeParams('srv1') });
    expect(res.status).toBe(403);
  });

  it('returns invitations with their joined members for admin', async () => {
    mockAdmin();
    mockPrisma.invitation.findMany.mockResolvedValue([
      {
        id: 'inv1',
        code: 'abc123',
        maxUses: 1,
        uses: 1,
        members: [
          { id: 'm2', pubkey: 'pk2', displayName: 'Alice', picture: null, nip05: null, joinedAt: new Date() },
        ],
      },
    ]);

    const res = await GET(makeRequest('GET'), { params: makeParams('srv1') });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.invitations).toHaveLength(1);
    expect(data.invitations[0].members).toHaveLength(1);
    expect(data.invitations[0].members[0].displayName).toBe('Alice');

    // Verify the include shape was requested so the API actually returns members
    const findManyCall = mockPrisma.invitation.findMany.mock.calls[0][0];
    expect(findManyCall.include?.members).toBeDefined();
  });
});

describe('POST /api/servers/:serverId/invitations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 without session', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', {}), { params: makeParams('srv1') });
    expect(res.status).toBe(401);
  });

  it('returns 403 for members when invites are disabled (invitesPerUser=0)', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    // requireRole lookup
    mockPrisma.server.findUnique.mockResolvedValueOnce({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValueOnce({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
    });
    // invite credit lookup
    mockPrisma.server.findUnique.mockResolvedValueOnce({
      minDaysActive: 7, invitesPerUser: 0, inviteExpiryHours: 168,
    });

    const res = await POST(makeRequest('POST', {}), { params: makeParams('srv1') });
    expect(res.status).toBe(403);
    expect(mockPrisma.invitation.create).not.toHaveBeenCalled();
  });

  it('returns 403 for members with insufficient tenure', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findUnique.mockResolvedValueOnce({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValueOnce({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
    });
    mockPrisma.server.findUnique.mockResolvedValueOnce({
      minDaysActive: 7, invitesPerUser: 3, inviteExpiryHours: 168,
    });
    mockPrisma.member.findUnique.mockResolvedValueOnce({
      joinedAt: new Date(), // just joined
    });

    const res = await POST(makeRequest('POST', {}), { params: makeParams('srv1') });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('7 days');
  });

  it('returns 403 when member has used all credits', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findUnique.mockResolvedValueOnce({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValueOnce({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
    });
    mockPrisma.server.findUnique.mockResolvedValueOnce({
      minDaysActive: 7, invitesPerUser: 3, inviteExpiryHours: 168,
    });
    mockPrisma.member.findUnique.mockResolvedValueOnce({
      joinedAt: new Date(Date.now() - 30 * 86_400_000),
    });
    mockPrisma.invitation.count.mockResolvedValue(3);

    const res = await POST(makeRequest('POST', {}), { params: makeParams('srv1') });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('3 invite credits');
  });

  it('allows eligible member to create a constrained invite', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findUnique.mockResolvedValueOnce({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValueOnce({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
    });
    mockPrisma.server.findUnique.mockResolvedValueOnce({
      minDaysActive: 7, invitesPerUser: 3, inviteExpiryHours: 168,
    });
    mockPrisma.member.findUnique.mockResolvedValueOnce({
      joinedAt: new Date(Date.now() - 30 * 86_400_000),
    });
    mockPrisma.invitation.count.mockResolvedValue(1);
    mockPrisma.invitation.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'inv1', ...args.data, members: [] })
    );

    const res = await POST(makeRequest('POST', { maxUses: 99 }), { params: makeParams('srv1') });
    expect(res.status).toBe(201);
    const data = await res.json();
    // Member invites are forced: maxUses=1, auto-expiry, no targetPubkey
    expect(data.invitation.maxUses).toBe(1);
    expect(data.invitation.expiresAt).not.toBeNull();
    expect(data.invitation.targetPubkey).toBeNull();
  });

  it('admin can create with custom maxUses and expiresInHours', async () => {
    mockAdmin();
    mockPrisma.invitation.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'inv1', ...args.data, members: [] })
    );

    const res = await POST(
      makeRequest('POST', { maxUses: 5, expiresInHours: 48 }),
      { params: makeParams('srv1') }
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.invitation.maxUses).toBe(5);
    expect(data.invitation.expiresAt).not.toBeNull();
  });

  it('admin gets default maxUses=1 and no expiry when omitted', async () => {
    mockAdmin();
    mockPrisma.invitation.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'inv1', ...args.data, members: [] })
    );

    const res = await POST(makeRequest('POST', {}), { params: makeParams('srv1') });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.invitation.maxUses).toBe(1);
    expect(data.invitation.expiresAt).toBeNull();
    expect(data.invitation.memberCreated).toBe(false);
  });

  it('admin with asMember:true routes through the member credit flow', async () => {
    mockGetAuth.mockResolvedValue('admin-pk');
    // requireRole path
    mockPrisma.server.findUnique.mockResolvedValueOnce({ ownerPubkey: 'admin-pk' });
    mockPrisma.member.findUnique.mockResolvedValueOnce({
      id: 'm1', serverId: 'srv1', pubkey: 'admin-pk', role: 'admin',
    });
    // member-path server config
    mockPrisma.server.findUnique.mockResolvedValueOnce({
      minDaysActive: 7, invitesPerUser: 3, inviteExpiryHours: 168,
    });
    // member-path joinedAt lookup
    mockPrisma.member.findUnique.mockResolvedValueOnce({
      joinedAt: new Date(Date.now() - 30 * 86_400_000),
    });
    mockPrisma.invitation.count.mockResolvedValue(0);
    mockPrisma.invitation.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'inv1', ...args.data, members: [] })
    );

    const res = await POST(
      makeRequest('POST', { asMember: true, maxUses: 99 }),
      { params: makeParams('srv1') }
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    // Admin-asking-as-member gets member constraints: forced maxUses=1 and
    // memberCreated=true (so it counts against the pool, not their admin list).
    expect(data.invitation.maxUses).toBe(1);
    expect(data.invitation.memberCreated).toBe(true);
    expect(data.invitation.expiresAt).not.toBeNull();
  });
});
