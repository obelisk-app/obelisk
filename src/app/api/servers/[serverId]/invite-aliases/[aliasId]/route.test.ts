import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    inviteAlias: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    invitation: { findUnique: vi.fn() },
    server: { findUnique: vi.fn() },
    member: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/lib/auth', () => ({ validateSession: vi.fn() }));

import { PATCH, DELETE } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;
const makeParams = () =>
  Promise.resolve({ serverId: 'srv1', aliasId: 'a1' });

function makeRequest(method: string, body?: any) {
  const url = 'http://localhost/api/servers/srv1/invite-aliases/a1';
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

describe('PATCH alias', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renames slug', async () => {
    mockAdmin();
    mockPrisma.inviteAlias.findUnique
      .mockResolvedValueOnce({ id: 'a1', slug: 'old', serverId: 'srv1', enabled: true })
      .mockResolvedValueOnce(null); // slug clash check
    mockPrisma.invitation.findUnique.mockResolvedValue(null);
    mockPrisma.inviteAlias.update.mockImplementation((args: any) =>
      Promise.resolve({ id: 'a1', slug: args.data.slug, enabled: true, serverId: 'srv1' })
    );
    const res = await PATCH(
      makeRequest('PATCH', { slug: 'newslug' }),
      { params: makeParams() }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.alias.slug).toBe('newslug');
  });

  it('toggles enabled', async () => {
    mockAdmin();
    mockPrisma.inviteAlias.findUnique.mockResolvedValue({
      id: 'a1', slug: 'x', serverId: 'srv1', enabled: true,
    });
    mockPrisma.inviteAlias.update.mockImplementation((args: any) =>
      Promise.resolve({ id: 'a1', slug: 'x', enabled: args.data.enabled, serverId: 'srv1' })
    );
    const res = await PATCH(
      makeRequest('PATCH', { enabled: false }),
      { params: makeParams() }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.alias.enabled).toBe(false);
  });

  it('404 when alias belongs to another server', async () => {
    mockAdmin();
    mockPrisma.inviteAlias.findUnique.mockResolvedValue({
      id: 'a1', slug: 'x', serverId: 'other', enabled: true,
    });
    const res = await PATCH(
      makeRequest('PATCH', { enabled: false }),
      { params: makeParams() }
    );
    expect(res.status).toBe(404);
  });

  it('409 when renaming to colliding slug', async () => {
    mockAdmin();
    mockPrisma.inviteAlias.findUnique
      .mockResolvedValueOnce({ id: 'a1', slug: 'x', serverId: 'srv1', enabled: true })
      .mockResolvedValueOnce({ id: 'other' });
    mockPrisma.invitation.findUnique.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest('PATCH', { slug: 'taken' }),
      { params: makeParams() }
    );
    expect(res.status).toBe(409);
  });

  it('403 for non-admin', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
    });
    const res = await PATCH(makeRequest('PATCH', { enabled: false }), { params: makeParams() });
    expect(res.status).toBe(403);
  });
});

describe('DELETE alias', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes alias', async () => {
    mockAdmin();
    mockPrisma.inviteAlias.findUnique.mockResolvedValue({
      id: 'a1', slug: 'x', serverId: 'srv1', enabled: true,
    });
    mockPrisma.inviteAlias.delete.mockResolvedValue({});
    const res = await DELETE(makeRequest('DELETE'), { params: makeParams() });
    expect(res.status).toBe(200);
    expect(mockPrisma.inviteAlias.delete).toHaveBeenCalled();
  });

  it('404 when alias missing', async () => {
    mockAdmin();
    mockPrisma.inviteAlias.findUnique.mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE'), { params: makeParams() });
    expect(res.status).toBe(404);
  });
});
