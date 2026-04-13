import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock db
vi.mock('@/lib/db', () => ({
  prisma: {
    server: { findFirst: vi.fn(), findUnique: vi.fn() },
    channel: { create: vi.fn() },
    member: { findUnique: vi.fn() },
    memberCustomRole: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

// Mock api-auth
vi.mock('@/lib/api-auth', () => ({
  getAuthPubkey: vi.fn(),
}));

// Mock auth module (used by auth-roles internally)
vi.mock('@/lib/auth', () => ({
  validateSession: vi.fn(),
}));

import { GET, POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;

function makeRequest(method: string, body?: any) {
  const url = 'http://localhost/api/channels';
  const init: any = {
    method,
    headers: { cookie: 'session=test-token' },
  };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  return new NextRequest(url, init);
}

describe('GET /api/channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without session', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(401);
  });

  it('returns channels grouped by category', async () => {
    mockGetAuth.mockResolvedValue('pubkey123');
    mockPrisma.server.findFirst.mockResolvedValue({
      id: 'srv1',
      name: 'Test Server',
      icon: null,
      banner: null,
      ownerPubkey: 'other',
      categories: [
        { id: 'cat1', name: 'General', position: 0, channels: [{ id: 'ch1', name: 'chat', position: 0, readPermission: null, readRoleIds: [] }] },
      ],
      channels: [{ id: 'ch2', name: 'welcome', position: 0, readPermission: null, readRoleIds: [] }],
    });
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'other' });
    mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1', role: 'member' });

    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.server.name).toBe('Test Server');
    expect(data.categories).toHaveLength(1);
    expect(data.pinnedChannels).toHaveLength(1);
  });

  it('filters out channels whose readPermission excludes the caller', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findFirst.mockResolvedValue({
      id: 'srv1',
      name: 'S',
      icon: null,
      banner: null,
      ownerPubkey: 'other',
      categories: [
        {
          id: 'cat1',
          name: 'General',
          position: 0,
          channels: [
            { id: 'open', name: 'open', position: 0, readPermission: null, readRoleIds: [] },
            { id: 'admin-only', name: 'secret', position: 1, readPermission: 'admin', readRoleIds: [] },
            { id: 'role-gated', name: 'vip', position: 2, readPermission: 'roles', readRoleIds: ['r1'] },
          ],
        },
      ],
      channels: [
        { id: 'pinned-admin', name: 'pinned-admin', position: 0, readPermission: 'admin', readRoleIds: [] },
      ],
    });
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'other' });
    mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1', role: 'member' });
    mockPrisma.memberCustomRole.findMany.mockResolvedValue([]);

    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.categories[0].channels.map((c: any) => c.id)).toEqual(['open']);
    expect(data.pinnedChannels).toHaveLength(0);
  });

  it('includes role-gated channels when caller holds a matching custom role', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findFirst.mockResolvedValue({
      id: 'srv1', name: 'S', icon: null, banner: null, ownerPubkey: 'other',
      categories: [{
        id: 'cat1', name: 'G', position: 0, channels: [
          { id: 'vip', name: 'vip', position: 0, readPermission: 'roles', readRoleIds: ['r1'] },
        ],
      }],
      channels: [],
    });
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'other' });
    mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1', role: 'member' });
    mockPrisma.memberCustomRole.findMany.mockResolvedValue([{ roleId: 'r1' }]);

    const res = await GET(makeRequest('GET'));
    const data = await res.json();
    expect(data.categories[0].channels).toHaveLength(1);
  });

  it('owner sees role-gated channels even without the custom role', async () => {
    mockGetAuth.mockResolvedValue('owner-pk');
    mockPrisma.server.findFirst.mockResolvedValue({
      id: 'srv1', name: 'S', icon: null, banner: null, ownerPubkey: 'owner-pk',
      categories: [{
        id: 'cat1', name: 'G', position: 0, channels: [
          { id: 'vip', name: 'vip', position: 0, readPermission: 'roles', readRoleIds: ['r1'] },
          { id: 'admin-only', name: 'secret', position: 1, readPermission: 'admin', readRoleIds: [] },
        ],
      }],
      channels: [],
    });
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });

    const res = await GET(makeRequest('GET'));
    const data = await res.json();
    expect(data.categories[0].channels).toHaveLength(2);
  });
});

describe('POST /api/channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without session', async () => {
    mockGetAuth.mockResolvedValue(null);
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    const res = await POST(makeRequest('POST', { serverId: 'srv1', name: 'test' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 without serverId', async () => {
    mockGetAuth.mockResolvedValue('admin-pubkey');
    const res = await POST(makeRequest('POST', { name: 'test' }));
    expect(res.status).toBe(400);
  });

  it('returns 403 for member role', async () => {
    mockGetAuth.mockResolvedValue('member-pubkey');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pubkey', role: 'member',
    });

    const res = await POST(makeRequest('POST', { serverId: 'srv1', name: 'test' }));
    expect(res.status).toBe(403);
  });

  it('returns 201 for admin role', async () => {
    mockGetAuth.mockResolvedValue('admin-pubkey');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'admin-pubkey', role: 'admin',
    });
    mockPrisma.channel.create.mockResolvedValue({
      id: 'ch1', serverId: 'srv1', name: 'test', type: 'text',
    });

    const res = await POST(makeRequest('POST', { serverId: 'srv1', name: 'Test Channel' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe('test');
  });

  it('returns 400 without name', async () => {
    mockGetAuth.mockResolvedValue('admin-pubkey');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'admin-pubkey', role: 'admin',
    });

    const res = await POST(makeRequest('POST', { serverId: 'srv1' }));
    expect(res.status).toBe(400);
  });
});
