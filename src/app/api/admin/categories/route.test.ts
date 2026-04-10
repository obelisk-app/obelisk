import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    server: { findFirst: vi.fn(), findUnique: vi.fn() },
    category: { findMany: vi.fn(), create: vi.fn() },
    channel: { findMany: vi.fn() },
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

function makeRequest(method: string, body?: any) {
  const init: any = { method, headers: { cookie: 'session=tok' } };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  return new NextRequest('http://localhost/api/admin/categories?serverId=srv1', init);
}

function mockAdmin() {
  mockGetAuth.mockResolvedValue('admin-pk');
  mockPrisma.server.findFirst.mockResolvedValue({ id: 'srv1' });
  mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
  mockPrisma.member.findUnique.mockResolvedValue({
    id: 'm1', serverId: 'srv1', pubkey: 'admin-pk', role: 'admin',
  });
}

describe('GET /api/admin/categories', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns categories with channels and uncategorized', async () => {
    mockAdmin();
    mockPrisma.category.findMany.mockResolvedValue([
      { id: 'cat1', name: 'General', position: 0, channels: [{ id: 'ch1', name: 'chat' }] },
    ]);
    mockPrisma.channel.findMany.mockResolvedValue([
      { id: 'ch2', name: 'welcome' },
    ]);

    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.categories).toHaveLength(1);
    expect(data.uncategorizedChannels).toHaveLength(1);
  });

  it('returns 403 for member', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findFirst.mockResolvedValue({ id: 'srv1' });
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
    });

    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/categories', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a category', async () => {
    mockAdmin();
    mockPrisma.category.create.mockResolvedValue({ id: 'cat1', name: 'New Category', position: 0 });

    const res = await POST(makeRequest('POST', { name: 'New Category' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe('New Category');
  });

  it('returns 400 without name', async () => {
    mockAdmin();
    const res = await POST(makeRequest('POST', {}));
    expect(res.status).toBe(400);
  });

  it('returns 403 for member', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findFirst.mockResolvedValue({ id: 'srv1' });
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
    });

    const res = await POST(makeRequest('POST', { name: 'Test' }));
    expect(res.status).toBe(403);
  });
});
