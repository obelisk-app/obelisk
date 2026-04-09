import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    server: { findFirst: vi.fn(), findUnique: vi.fn() },
    category: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
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

function makeRequest(method: string, body?: any) {
  const init: any = { method, headers: { cookie: 'session=tok' } };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  return new NextRequest('http://localhost/api/admin/categories/cat1', init);
}

const ctx = { params: Promise.resolve({ id: 'cat1' }) };

function mockAdmin() {
  mockGetAuth.mockResolvedValue('admin-pk');
  mockPrisma.server.findFirst.mockResolvedValue({ id: 'srv1' });
  mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
  mockPrisma.member.findUnique.mockResolvedValue({
    id: 'm1', serverId: 'srv1', pubkey: 'admin-pk', role: 'admin',
  });
}

describe('PATCH /api/admin/categories/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renames a category', async () => {
    mockAdmin();
    mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat1', serverId: 'srv1' });
    mockPrisma.category.update.mockResolvedValue({ id: 'cat1', name: 'Renamed' });

    const res = await PATCH(makeRequest('PATCH', { name: 'Renamed' }), ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe('Renamed');
  });

  it('returns 404 for non-existent category', async () => {
    mockAdmin();
    mockPrisma.category.findUnique.mockResolvedValue(null);

    const res = await PATCH(makeRequest('PATCH', { name: 'x' }), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 400 with no valid fields', async () => {
    mockAdmin();
    mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat1', serverId: 'srv1' });

    const res = await PATCH(makeRequest('PATCH', {}), ctx);
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/admin/categories/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes category', async () => {
    mockAdmin();
    mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat1', serverId: 'srv1' });
    mockPrisma.category.delete.mockResolvedValue({});

    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(200);
    expect(mockPrisma.category.delete).toHaveBeenCalledWith({ where: { id: 'cat1' } });
  });

  it('returns 404 for non-existent category', async () => {
    mockAdmin();
    mockPrisma.category.findUnique.mockResolvedValue(null);

    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(404);
  });
});
