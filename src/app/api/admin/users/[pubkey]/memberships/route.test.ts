import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    server: { findMany: vi.fn(), findUnique: vi.fn() },
    member: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    moderationAction: { create: vi.fn() },
  },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/lib/auth', () => ({ validateSession: vi.fn() }));

import { GET, POST, DELETE } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;

const ENV_KEY = 'INSTANCE_OWNER_PUBKEY';
const VALID_PUBKEY = 'a'.repeat(64);

function makeRequest(method: string, query = '', body?: any) {
  const init: any = { method, headers: { cookie: 'session=tok' } };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  return new NextRequest(`http://localhost/api/admin/users/${VALID_PUBKEY}/memberships${query}`, init);
}

const params = Promise.resolve({ pubkey: VALID_PUBKEY });

describe('cross-server memberships endpoint', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = process.env[ENV_KEY];
    process.env[ENV_KEY] = 'instance-pk';
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  describe('GET', () => {
    it('returns 401 without session', async () => {
      mockGetAuth.mockResolvedValue(null);
      const res = await GET(makeRequest('GET'), { params });
      expect(res.status).toBe(401);
    });

    it('returns 403 for non-instance owner', async () => {
      mockGetAuth.mockResolvedValue('regular-pk');
      const res = await GET(makeRequest('GET'), { params });
      expect(res.status).toBe(403);
    });

    it('returns memberships across all servers for instance owner', async () => {
      mockGetAuth.mockResolvedValue('instance-pk');
      mockPrisma.server.findMany.mockResolvedValue([
        { id: 's1', name: 'A', icon: null, ownerPubkey: 'someone' },
        { id: 's2', name: 'B', icon: null, ownerPubkey: VALID_PUBKEY }, // target owns this
        { id: 's3', name: 'C', icon: null, ownerPubkey: 'else' },
      ]);
      mockPrisma.member.findMany.mockResolvedValue([
        { serverId: 's1', role: 'admin', joinedAt: new Date() },
      ]);

      const res = await GET(makeRequest('GET'), { params });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.servers).toHaveLength(3);

      const byId = Object.fromEntries(data.servers.map((s: any) => [s.id, s]));
      expect(byId.s1.role).toBe('admin');
      expect(byId.s1.isMember).toBe(true);
      expect(byId.s2.role).toBe('owner');
      expect(byId.s2.isServerOwner).toBe(true);
      expect(byId.s3.role).toBeNull();
      expect(byId.s3.isMember).toBe(false);
    });
  });

  describe('POST', () => {
    it('rejects non-instance owner', async () => {
      mockGetAuth.mockResolvedValue('regular-pk');
      const res = await POST(makeRequest('POST', '', { serverId: 's1' }), { params });
      expect(res.status).toBe(403);
    });

    it('returns 400 without serverId', async () => {
      mockGetAuth.mockResolvedValue('instance-pk');
      const res = await POST(makeRequest('POST', '', {}), { params });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid role', async () => {
      mockGetAuth.mockResolvedValue('instance-pk');
      const res = await POST(makeRequest('POST', '', { serverId: 's1', role: 'owner' }), { params });
      expect(res.status).toBe(400);
    });

    it('upserts the Member row for instance owner', async () => {
      mockGetAuth.mockResolvedValue('instance-pk');
      mockPrisma.server.findUnique.mockResolvedValue({ id: 's1', ownerPubkey: 'someone' });
      mockPrisma.member.upsert.mockResolvedValue({
        pubkey: VALID_PUBKEY, role: 'mod',
      });
      mockPrisma.moderationAction.create.mockResolvedValue({});

      const res = await POST(makeRequest('POST', '', { serverId: 's1', role: 'mod' }), { params });
      expect(res.status).toBe(200);
      expect(mockPrisma.member.upsert).toHaveBeenCalled();
      expect(mockPrisma.moderationAction.create).toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it('rejects non-instance owner', async () => {
      mockGetAuth.mockResolvedValue('regular-pk');
      const res = await DELETE(makeRequest('DELETE', '?serverId=s1'), { params });
      expect(res.status).toBe(403);
    });

    it('returns 400 without serverId', async () => {
      mockGetAuth.mockResolvedValue('instance-pk');
      const res = await DELETE(makeRequest('DELETE'), { params });
      expect(res.status).toBe(400);
    });

    it('refuses to remove the server owner', async () => {
      mockGetAuth.mockResolvedValue('instance-pk');
      mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: VALID_PUBKEY.toLowerCase() });

      const res = await DELETE(makeRequest('DELETE', '?serverId=s1'), { params });
      expect(res.status).toBe(409);
      expect(mockPrisma.member.deleteMany).not.toHaveBeenCalled();
    });

    it('removes the member', async () => {
      mockGetAuth.mockResolvedValue('instance-pk');
      mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'someone-else' });
      mockPrisma.member.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.moderationAction.create.mockResolvedValue({});

      const res = await DELETE(makeRequest('DELETE', '?serverId=s1'), { params });
      expect(res.status).toBe(200);
      expect(mockPrisma.member.deleteMany).toHaveBeenCalled();
    });

    it('returns 404 if member is not in the server', async () => {
      mockGetAuth.mockResolvedValue('instance-pk');
      mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'someone-else' });
      mockPrisma.member.deleteMany.mockResolvedValue({ count: 0 });

      const res = await DELETE(makeRequest('DELETE', '?serverId=s1'), { params });
      expect(res.status).toBe(404);
    });
  });
});
