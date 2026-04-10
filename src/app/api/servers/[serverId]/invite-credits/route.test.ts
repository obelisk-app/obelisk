import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    server: { findUnique: vi.fn() },
    member: { findUnique: vi.fn() },
    message: { count: vi.fn() },
    invitation: { count: vi.fn() },
  },
}));

vi.mock('@/lib/api-auth', () => ({
  getAuthPubkey: vi.fn(),
}));

import { GET } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const mockPrisma = prisma as any;
const mockAuth = getAuthPubkey as ReturnType<typeof vi.fn>;
const params = () => Promise.resolve({ serverId: 'srv1' });
const makeReq = () =>
  new NextRequest('http://localhost/api/servers/srv1/invite-credits', {
    headers: { cookie: 'session=test' },
  });

beforeEach(() => vi.clearAllMocks());

describe('GET /invite-credits', () => {
  it('returns 401 without session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq(), { params: params() });
    expect(res.status).toBe(401);
  });

  it('returns adminBypass=true for admin role', async () => {
    mockAuth.mockResolvedValue('admin-pk');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'admin-pk', role: 'admin',
    });

    const res = await GET(makeReq(), { params: params() });
    const data = await res.json();
    expect(data.adminBypass).toBe(true);
    expect(data.eligible).toBe(true);
  });

  it('returns computed credits for members', async () => {
    mockAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findUnique
      .mockResolvedValueOnce({ ownerPubkey: 'owner-pk' }) // getAuthMember
      .mockResolvedValueOnce({
        minDaysActive: 0, minMessages: 0, invitesPerUser: 3,
      }); // computeCredits
    mockPrisma.member.findUnique
      .mockResolvedValueOnce({
        id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
      })
      .mockResolvedValueOnce({ joinedAt: new Date() });
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.invitation.count.mockResolvedValue(0);

    const res = await GET(makeReq(), { params: params() });
    const data = await res.json();
    expect(data.adminBypass).toBe(false);
    expect(data.eligible).toBe(true);
    expect(data.available).toBe(3);
  });
});
