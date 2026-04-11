import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    invitation: { findUnique: vi.fn(), update: vi.fn() },
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

import { DELETE } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;

const makeParams = (serverId: string, invitationId: string) =>
  Promise.resolve({ serverId, invitationId });

function makeRequest() {
  return new NextRequest('http://localhost/api/servers/srv1/invitations/inv1', {
    method: 'DELETE',
    headers: { cookie: 'session=test' },
  });
}

function mockAdmin() {
  mockGetAuth.mockResolvedValue('admin-pk');
  mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'admin-pk' });
  mockPrisma.member.findUnique.mockResolvedValue({
    id: 'm1',
    serverId: 'srv1',
    pubkey: 'admin-pk',
    role: 'admin',
  });
}

const sampleInvite = {
  id: 'inv1',
  serverId: 'srv1',
  code: 'abc123',
  createdBy: 'admin-pk',
  targetPubkey: null,
  maxUses: 5,
  uses: 1,
  expiresAt: null,
  createdAt: new Date(),
  revokedAt: null,
  revokedBy: null,
  members: [
    {
      id: 'm2',
      pubkey: 'pk2',
      displayName: 'Alice',
      picture: null,
      nip05: null,
      joinedAt: new Date(),
    },
  ],
};

describe('DELETE /api/servers/:serverId/invitations/:invitationId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 without session', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await DELETE(makeRequest(), { params: makeParams('srv1', 'inv1') });
    expect(res.status).toBe(401);
    expect(mockPrisma.invitation.update).not.toHaveBeenCalled();
  });

  it('returns 403 for non-admin members', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1',
      serverId: 'srv1',
      pubkey: 'member-pk',
      role: 'member',
    });

    const res = await DELETE(makeRequest(), { params: makeParams('srv1', 'inv1') });
    expect(res.status).toBe(403);
    expect(mockPrisma.invitation.update).not.toHaveBeenCalled();
  });

  it('returns 404 if invitation does not exist', async () => {
    mockAdmin();
    mockPrisma.invitation.findUnique.mockResolvedValue(null);

    const res = await DELETE(makeRequest(), { params: makeParams('srv1', 'inv1') });
    expect(res.status).toBe(404);
    expect(mockPrisma.invitation.update).not.toHaveBeenCalled();
  });

  it('returns 404 if invitation belongs to another server', async () => {
    mockAdmin();
    mockPrisma.invitation.findUnique.mockResolvedValue({
      ...sampleInvite,
      serverId: 'other-srv',
    });

    const res = await DELETE(makeRequest(), { params: makeParams('srv1', 'inv1') });
    expect(res.status).toBe(404);
    expect(mockPrisma.invitation.update).not.toHaveBeenCalled();
  });

  it('soft-revokes an active invite and returns it with joined members preserved', async () => {
    mockAdmin();
    mockPrisma.invitation.findUnique.mockResolvedValue(sampleInvite);
    mockPrisma.invitation.update.mockImplementation((args: any) =>
      Promise.resolve({
        ...sampleInvite,
        ...args.data,
      })
    );

    const res = await DELETE(makeRequest(), { params: makeParams('srv1', 'inv1') });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.invitation.revokedAt).toBeTruthy();
    expect(data.invitation.revokedBy).toBe('admin-pk');
    // History is preserved: members still returned for the admin UI.
    expect(data.invitation.members).toHaveLength(1);
    expect(data.invitation.members[0].displayName).toBe('Alice');

    // update call must NOT delete or clear member relations.
    const updateArgs = mockPrisma.invitation.update.mock.calls[0][0];
    expect(updateArgs.data.revokedAt).toBeInstanceOf(Date);
    expect(updateArgs.data.revokedBy).toBe('admin-pk');
    expect(updateArgs.include?.members).toBeDefined();
  });

  it('is idempotent — re-revoking returns current state without re-stamping', async () => {
    mockAdmin();
    const originalRevokedAt = new Date('2026-04-01T12:00:00Z');
    mockPrisma.invitation.findUnique.mockResolvedValue({
      ...sampleInvite,
      revokedAt: originalRevokedAt,
      revokedBy: 'some-other-admin',
    });

    const res = await DELETE(makeRequest(), { params: makeParams('srv1', 'inv1') });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(new Date(data.invitation.revokedAt).toISOString()).toBe(
      originalRevokedAt.toISOString()
    );
    expect(data.invitation.revokedBy).toBe('some-other-admin');
    // Must not attempt to re-update.
    expect(mockPrisma.invitation.update).not.toHaveBeenCalled();
  });
});
