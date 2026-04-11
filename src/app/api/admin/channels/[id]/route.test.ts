import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    server: { findFirst: vi.fn(), findUnique: vi.fn() },
    channel: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
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
  return new NextRequest('http://localhost/api/admin/channels/ch1', init);
}

const ctx = { params: Promise.resolve({ id: 'ch1' }) };

function mockAdmin() {
  mockGetAuth.mockResolvedValue('admin-pk');
  mockPrisma.server.findFirst.mockResolvedValue({ id: 'srv1' });
  mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
  mockPrisma.member.findUnique.mockResolvedValue({
    id: 'm1', serverId: 'srv1', pubkey: 'admin-pk', role: 'admin',
  });
}

describe('PATCH /api/admin/channels/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 for member role', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.channel.findUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1' });
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
    });

    const res = await PATCH(makeRequest('PATCH', { name: 'new' }), ctx);
    expect(res.status).toBe(403);
  });

  it('updates channel name', async () => {
    mockAdmin();
    mockPrisma.channel.findUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1' });
    mockPrisma.channel.update.mockResolvedValue({ id: 'ch1', name: 'new-name', type: 'text' });

    const res = await PATCH(makeRequest('PATCH', { name: 'New Name' }), ctx);
    expect(res.status).toBe(200);
    expect(mockPrisma.channel.update).toHaveBeenCalledWith({
      where: { id: 'ch1' },
      data: { name: 'new-name' },
    });
  });

  it('returns 400 for invalid type', async () => {
    mockAdmin();
    mockPrisma.channel.findUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1' });

    const res = await PATCH(makeRequest('PATCH', { type: 'invalid' }), ctx);
    expect(res.status).toBe(400);
  });

  it('accepts writePermission "mod" and persists it', async () => {
    mockAdmin();
    mockPrisma.channel.findUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1' });
    mockPrisma.channel.update.mockResolvedValue({ id: 'ch1', writePermission: 'mod' });

    const res = await PATCH(makeRequest('PATCH', { writePermission: 'mod' }), ctx);
    expect(res.status).toBe(200);
    expect(mockPrisma.channel.update).toHaveBeenCalledWith({
      where: { id: 'ch1' },
      data: { writePermission: 'mod' },
    });
  });

  it('normalizes writePermission "everyone" to null', async () => {
    mockAdmin();
    mockPrisma.channel.findUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1' });
    mockPrisma.channel.update.mockResolvedValue({ id: 'ch1', writePermission: null });

    const res = await PATCH(makeRequest('PATCH', { writePermission: 'everyone' }), ctx);
    expect(res.status).toBe(200);
    expect(mockPrisma.channel.update).toHaveBeenCalledWith({
      where: { id: 'ch1' },
      data: { writePermission: null },
    });
  });

  it('returns 400 for invalid writePermission value', async () => {
    mockAdmin();
    mockPrisma.channel.findUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1' });

    const res = await PATCH(makeRequest('PATCH', { writePermission: 'nope' }), ctx);
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent channel', async () => {
    mockAdmin();
    mockPrisma.channel.findUnique.mockResolvedValue(null);

    const res = await PATCH(makeRequest('PATCH', { name: 'x' }), ctx);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/channels/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes channel', async () => {
    mockAdmin();
    mockPrisma.channel.findUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1' });
    mockPrisma.channel.delete.mockResolvedValue({});

    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(200);
    expect(mockPrisma.channel.delete).toHaveBeenCalledWith({ where: { id: 'ch1' } });
  });

  it('returns 403 for member role', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.channel.findUnique.mockResolvedValue({ id: 'ch1', serverId: 'srv1' });
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
    });

    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(403);
  });
});
