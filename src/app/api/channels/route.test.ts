import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock db
vi.mock('@/lib/db', () => ({
  prisma: {
    server: { findFirst: vi.fn(), findUnique: vi.fn() },
    channel: { create: vi.fn() },
    member: { findUnique: vi.fn() },
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
      categories: [
        { id: 'cat1', name: 'General', position: 0, channels: [{ id: 'ch1', name: 'chat', position: 0 }] },
      ],
      channels: [{ id: 'ch2', name: 'welcome', position: 0 }],
    });

    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.server.name).toBe('Test Server');
    expect(data.categories).toHaveLength(1);
    expect(data.pinnedChannels).toHaveLength(1);
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
