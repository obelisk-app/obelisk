import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    inviteAlias: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    invitation: { findUnique: vi.fn() },
    server: { findUnique: vi.fn() },
    member: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/lib/auth', () => ({ validateSession: vi.fn() }));

import { GET, POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;
const makeParams = (serverId: string) => Promise.resolve({ serverId });

function makeRequest(method: string, body?: any) {
  const url = 'http://localhost/api/servers/srv1/invite-aliases';
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

describe('GET /api/servers/:serverId/invite-aliases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 without session', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await GET(makeRequest('GET'), { params: makeParams('srv1') });
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
    });
    const res = await GET(makeRequest('GET'), { params: makeParams('srv1') });
    expect(res.status).toBe(403);
  });

  it('lists aliases for admin', async () => {
    mockAdmin();
    mockPrisma.inviteAlias.findMany.mockResolvedValue([
      { id: 'a1', slug: 'obelisk', serverId: 'srv1', enabled: true },
    ]);
    const res = await GET(makeRequest('GET'), { params: makeParams('srv1') });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.aliases).toHaveLength(1);
    expect(data.aliases[0].slug).toBe('obelisk');
  });
});

describe('POST /api/servers/:serverId/invite-aliases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an alias for admin', async () => {
    mockAdmin();
    mockPrisma.inviteAlias.findUnique.mockResolvedValue(null);
    mockPrisma.invitation.findUnique.mockResolvedValue(null);
    mockPrisma.inviteAlias.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'a1', createdAt: new Date(), updatedAt: new Date(), ...args.data })
    );
    const res = await POST(
      makeRequest('POST', { slug: 'Obelisk' }),
      { params: makeParams('srv1') }
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.alias.slug).toBe('obelisk');
    expect(data.alias.enabled).toBe(true);
  });

  it('rejects invalid slug', async () => {
    mockAdmin();
    const res = await POST(
      makeRequest('POST', { slug: 'bad slug!' }),
      { params: makeParams('srv1') }
    );
    expect(res.status).toBe(400);
  });

  it('rejects reserved slug', async () => {
    mockAdmin();
    const res = await POST(
      makeRequest('POST', { slug: 'admin' }),
      { params: makeParams('srv1') }
    );
    expect(res.status).toBe(400);
  });

  it('409 when slug collides with existing alias', async () => {
    mockAdmin();
    mockPrisma.inviteAlias.findUnique.mockResolvedValue({ id: 'other' });
    mockPrisma.invitation.findUnique.mockResolvedValue(null);
    const res = await POST(
      makeRequest('POST', { slug: 'obelisk' }),
      { params: makeParams('srv1') }
    );
    expect(res.status).toBe(409);
  });

  it('409 when slug collides with invite code', async () => {
    mockAdmin();
    mockPrisma.inviteAlias.findUnique.mockResolvedValue(null);
    mockPrisma.invitation.findUnique.mockResolvedValue({ id: 'inv1' });
    const res = await POST(
      makeRequest('POST', { slug: 'obelisk' }),
      { params: makeParams('srv1') }
    );
    expect(res.status).toBe(409);
  });

  it('403 for non-admin', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
    });
    const res = await POST(
      makeRequest('POST', { slug: 'obelisk' }),
      { params: makeParams('srv1') }
    );
    expect(res.status).toBe(403);
  });
});
